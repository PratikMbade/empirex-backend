// src/controller/team.controller.ts — a member's whole referral downline (sponsor chain), not just directs.
import { Prisma } from '@prisma/client'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { PACKAGE_COUNT } from '../lib/packages.js'
import { prisma } from '../lib/prisma.js'
import { addressParam, HttpError, json, paged, pagination } from '../utils/http.js'
import { requireMember } from '../utils/memberSummary.js'
import { empirexId } from '../lib/format.js'

// Everyone whose sponsor chain reaches `address`, with depth 1 for directs.
// The root member is its own sponsor, so self-references are skipped.
const downline = (address: string) => Prisma.sql`
  WITH RECURSIVE team AS (
    SELECT address, 1 AS depth FROM "Member" WHERE sponsor = ${address} AND address <> sponsor
    UNION ALL
    SELECT m.address, t.depth + 1 FROM "Member" m JOIN team t ON m.sponsor = t.address WHERE m.address <> m.sponsor
  )`

// ─── GET /api/members/:address/team-overview ──────────────
// Team size and how many members sit at each package level (0 = registered, no package yet).
export const getTeamOverview = async (req: Request, res: Response) => {
  const address = addressParam(req)
  await requireMember(address)
  const [rows, tiers] = await Promise.all([
    prisma.$queryRaw<{ level: number; count: bigint }[]>`
      ${downline(address)}
      SELECT m."highestPackage" AS level, count(*)::bigint AS count
      FROM team t JOIN "Member" m ON m.address = t.address
      GROUP BY m."highestPackage"`,
    prisma.packageTier.findMany({ orderBy: { level: 'asc' } }),
  ])
  const countAt = new Map(rows.map((r) => [r.level, Number(r.count)]))
  res.json(
    json({
      total: rows.reduce((sum, r) => sum + Number(r.count), 0),
      noPackage: countAt.get(0) ?? 0,
      levels: Array.from({ length: PACKAGE_COUNT }, (_, i) => {
        const tier = tiers.find((t) => t.level === i + 1)
        return { level: i + 1, name: tier?.name ?? `Level ${i + 1}`, price: Number(tier?.price ?? 0), count: countAt.get(i + 1) ?? 0 }
      }),
    }),
  )
}

const teamQuery = z.object({
  minLevel: z.coerce.number().int().min(0).max(PACKAGE_COUNT).default(0),
  maxLevel: z.coerce.number().int().min(0).max(PACKAGE_COUNT).default(PACKAGE_COUNT),
  search: z.string().trim().toLowerCase().max(42).default(''),
  /** 0 = whole team, 1 = directs only. */
  depth: z.coerce.number().int().min(0).default(0),
  sort: z.enum(['level', 'newest']).default('level'),
})

// ─── GET /api/members/:address/team?minLevel=&maxLevel=&search=&depth=&sort=&page=&pageSize= ─
// The downline. sort=level: lowest package first (the members who most need support); sort=newest: latest joiners first.
export const getTeam = async (req: Request, res: Response) => {
  const parsed = teamQuery.safeParse(req.query)
  if (!parsed.success) throw new HttpError(400, `minLevel and maxLevel must be between 0 and ${PACKAGE_COUNT}`)
  const { minLevel, maxLevel, search, depth, sort } = parsed.data
  const address = addressParam(req)
  await requireMember(address)
  const { page, pageSize, skip, take } = pagination(req)

  const filters = Prisma.sql`m."highestPackage" BETWEEN ${minLevel} AND ${maxLevel}
    ${search ? Prisma.sql`AND m.address LIKE ${`%${search.replace(/[\\%_]/g, '\\$&')}%`}` : Prisma.empty}
    ${depth ? Prisma.sql`AND t.depth = ${depth}` : Prisma.empty}`
  const order = sort === 'newest' ? Prisma.sql`m."regId" DESC` : Prisma.sql`m."highestPackage" ASC, m."regId" ASC`

  const [rows, [countRow], tiers] = await Promise.all([
    prisma.$queryRaw<
      { address: string; regId: number; sponsor: string; highestPackage: number; registeredAt: Date; depth: number; directs: bigint }[]
    >`
      ${downline(address)}
      SELECT m.address, m."regId", m.sponsor, m."highestPackage", m."registeredAt", t.depth,
             (SELECT count(*) FROM "Member" d WHERE d.sponsor = m.address AND d.address <> d.sponsor)::bigint AS directs
      FROM team t JOIN "Member" m ON m.address = t.address
      WHERE ${filters}
      ORDER BY ${order}
      LIMIT ${take} OFFSET ${skip}`,
    prisma.$queryRaw<{ count: bigint }[]>`
      ${downline(address)}
      SELECT count(*)::bigint AS count
      FROM team t JOIN "Member" m ON m.address = t.address
      WHERE ${filters}`,
    prisma.packageTier.findMany(),
  ])
  const tierAt = new Map(tiers.map((t) => [t.level, t]))

  // Total rewards per member on this page; the same streams as the member summary.
  const receivers = rows.map((m) => m.address)
  const totals = await Promise.all([
    prisma.x3Payment.groupBy({ by: ['receiver'], where: { receiver: { in: receivers }, recycled: false }, _sum: { amount: true } }),
    prisma.levelIncome.groupBy({ by: ['receiver'], where: { receiver: { in: receivers } }, _sum: { amount: true } }),
    prisma.levelLapseIncome.groupBy({ by: ['receiver'], where: { receiver: { in: receivers } }, _sum: { amount: true } }),
  ])
  const income = new Map<string, Prisma.Decimal>()
  for (const row of totals.flat()) income.set(row.receiver, (income.get(row.receiver) ?? new Prisma.Decimal(0)).plus(row._sum.amount ?? 0))

  const members = rows.map((m) => {
    const next = tierAt.get(m.highestPackage + 1)
    return {
      address: m.address,
      memberId: empirexId(m.address),
      sponsor: m.sponsor,
      depth: m.depth,
      registeredAt: m.registeredAt,
      level: m.highestPackage,
      packageName: tierAt.get(m.highestPackage)?.name ?? null,
      directCount: Number(m.directs),
      totalIncome: Number(income.get(m.address) ?? 0),
      nextPackage: next ? { level: next.level, name: next.name, price: Number(next.price) } : null,
    }
  })
  res.json(json(paged(members, Number(countRow?.count ?? 0), page, pageSize)))
}
