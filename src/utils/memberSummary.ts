// src/utils/memberSummary.ts — read models shared by the member and signed-in controllers.
import { Prisma } from '@prisma/client'
import { empirexId } from '../lib/format.js'
import { prisma } from '../lib/prisma.js'
import { HttpError } from './http.js'

const sum = (value: Prisma.Decimal | null) => (value ?? new Prisma.Decimal(0)).toString()

export async function requireMember(address: string) {
  const member = await prisma.member.findUnique({ where: { address } })
  if (!member) throw new HttpError(404, `${address} is not a registered member`)
  return member
}

/** Referral downline size (every member whose sponsor chain reaches `address`). */
async function teamSize(address: string) {
  const [row] = await prisma.$queryRaw<{ count: bigint }[]>`
    WITH RECURSIVE team AS (
      SELECT address FROM "Member" WHERE sponsor = ${address} AND address <> sponsor
      UNION ALL
      SELECT m.address FROM "Member" m JOIN team t ON m.sponsor = t.address WHERE m.address <> m.sponsor
    )
    SELECT count(*)::bigint AS count FROM team`
  return Number(row?.count ?? 0)
}

export async function memberSummary(address: string) {
  const member = await requireMember(address)
  const tiers = await prisma.packageTier.findMany({ orderBy: { level: 'asc' } })
  const [directs, team, x3, level, levelLapse, x3Lost, levelLost, recycles] = await Promise.all([
    prisma.member.count({ where: { sponsor: address, NOT: { address } } }),
    teamSize(address),
    prisma.x3Payment.aggregate({ where: { receiver: address, recycled: false }, _sum: { amount: true } }),
    prisma.levelIncome.aggregate({ where: { receiver: address }, _sum: { amount: true } }),
    prisma.levelLapseIncome.aggregate({ where: { receiver: address }, _sum: { amount: true } }),
    prisma.x3Lost.aggregate({ where: { lostBy: address }, _sum: { amount: true } }),
    prisma.levelLost.aggregate({ where: { lostBy: address }, _sum: { amount: true } }),
    prisma.recycle.count({ where: { owner: address } }),
  ])
  const income = {
    x3: sum(x3._sum.amount),
    level: sum(level._sum.amount),
    levelLapse: sum(levelLapse._sum.amount),
  }
  const tier = tiers.find((t) => t.level === member.highestPackage)
  return {
    address: member.address,
    memberId: empirexId(member.address),
    sponsor: member.isRoot ? null : member.sponsor,
    sponsorMemberId: member.isRoot ? null : empirexId(member.sponsor),
    isRoot: member.isRoot,
    registeredAt: member.registeredAt,
    package: tier ? { level: tier.level, name: tier.name, price: tier.price.toString() } : null,
    nextPackage: tiers.find((t) => t.level === member.highestPackage + 1) ?? null,
    qualifiedDirects: member.qualifiedDirects,
    directCount: directs,
    teamSize: team,
    recycles,
    income: {
      ...income,
      total: new Prisma.Decimal(income.x3).plus(income.level).plus(income.levelLapse).toString(),
    },
    lost: { x3: sum(x3Lost._sum.amount), level: sum(levelLost._sum.amount) },
  }
}

// ─── Tree nodes, in the dashboard's TreeMember shape (src/dashboard/data/trees.ts) ─

export interface TreeMember {
  address: string
  sponsor: string
  memberId: string
  package: { level: number; name: string; price: number } | null
  generation: number
  /** S3 Tree: this placement came from the member's own matrix recycling. */
  recycled?: boolean
  /** S3 Tree: this slot paid the matrix owner nothing. */
  noIncome?: boolean
  children: (TreeMember | null)[]
}

export async function treeNodes(addresses: string[]) {
  const [members, tiers] = await Promise.all([
    prisma.member.findMany({ where: { address: { in: addresses } } }),
    prisma.packageTier.findMany(),
  ])
  const tierByLevel = new Map(tiers.map((t) => [t.level, t]))
  return new Map(
    members.map((m) => {
      const tier = tierByLevel.get(m.highestPackage)
      return [
        m.address,
        {
          address: m.address,
          sponsor: m.sponsor,
          memberId: empirexId(m.address),
          package: tier ? { level: tier.level, name: tier.name, price: Number(tier.price) } : null,
        },
      ] as const
    }),
  )
}
