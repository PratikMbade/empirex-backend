import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { addressParam, HttpError, json, paged, pagination } from '../http.js'
import { generationTree, memberSummary, requireMember, x3Tree } from '../queries.js'

export const membersRouter = Router()

const recent = { orderBy: [{ blockNumber: 'desc' as const }, { logIndex: 'desc' as const }] }

membersRouter.get('/packages', async (_req, res) => {
  res.json(json(await prisma.packageTier.findMany({ orderBy: { level: 'asc' } })))
})

membersRouter.get('/members/:address', async (req, res) => {
  res.json(json(await memberSummary(addressParam(req))))
})

membersRouter.get('/members/:address/packages', async (req, res) => {
  const address = addressParam(req)
  await requireMember(address)
  res.json(json(await prisma.packagePurchase.findMany({ where: { memberAddress: address }, orderBy: { package: 'asc' } })))
})

membersRouter.get('/members/:address/direct-team', async (req, res) => {
  const address = addressParam(req)
  await requireMember(address)
  const { page, pageSize, skip, take } = pagination(req)
  const where = { sponsor: address, NOT: { address } }
  const [rows, total] = await Promise.all([
    prisma.member.findMany({ where, skip, take, orderBy: { regId: 'asc' } }),
    prisma.member.count({ where }),
  ])
  const counts = await prisma.member.groupBy({ by: ['sponsor'], where: { sponsor: { in: rows.map((r) => r.address) } }, _count: true })
  const directsOf = new Map(counts.map((c) => [c.sponsor, c._count]))
  const members = rows.map((m) => ({
    address: m.address,
    memberId: m.regId,
    registeredAt: m.registeredAt,
    highestPackage: m.highestPackage,
    qualifiedDirects: m.qualifiedDirects,
    directCount: directsOf.get(m.address) ?? 0,
  }))
  res.json(json(paged(members, total, page, pageSize)))
})

const INCOME = {
  x3: (receiver: string) => ({ model: prisma.x3Payment, where: { receiver, recycled: false } }),
  level: (receiver: string) => ({ model: prisma.levelIncome, where: { receiver } }),
  'level-lapse': (receiver: string) => ({ model: prisma.levelLapseIncome, where: { receiver } }),
}
const LOST = {
  x3: (lostBy: string) => ({ model: prisma.x3Lost, where: { lostBy } }),
  level: (lostBy: string) => ({ model: prisma.levelLost, where: { lostBy } }),
}

// Prisma delegates don't share a callable union type, so these two go through a narrow cast.
type Delegate = { findMany: (args: object) => Promise<unknown[]>; count: (args: object) => Promise<number> }

async function history(table: { model: unknown; where: object }, req: Parameters<typeof pagination>[0]) {
  const { page, pageSize, skip, take } = pagination(req)
  const model = table.model as Delegate
  const [rows, total] = await Promise.all([
    model.findMany({ where: table.where, skip, take, ...recent }),
    model.count({ where: table.where }),
  ])
  return json(paged(rows, total, page, pageSize))
}

membersRouter.get('/members/:address/income/:stream', async (req, res) => {
  const address = addressParam(req)
  const pick = INCOME[req.params.stream as keyof typeof INCOME]
  if (!pick) throw new HttpError(400, `stream must be one of ${Object.keys(INCOME).join(', ')}`)
  await requireMember(address)
  res.json(await history(pick(address), req))
})

membersRouter.get('/members/:address/lost/:stream', async (req, res) => {
  const address = addressParam(req)
  const pick = LOST[req.params.stream as keyof typeof LOST]
  if (!pick) throw new HttpError(400, `stream must be one of ${Object.keys(LOST).join(', ')}`)
  await requireMember(address)
  res.json(await history(pick(address), req))
})

membersRouter.get('/members/:address/recycles', async (req, res) => {
  const address = addressParam(req)
  await requireMember(address)
  res.json(await history({ model: prisma.recycle, where: { owner: address } }, req))
})

// ─── Trees ────────────────────────────────────────────────────────────────────

membersRouter.get('/tree/generation/:address', async (req, res) => {
  const depth = z.coerce.number().int().min(1).max(6).default(3).safeParse(req.query.depth)
  if (!depth.success) throw new HttpError(400, 'depth must be between 1 and 6')
  res.json(json({ tree: await generationTree(addressParam(req), depth.data) }))
})

membersRouter.get('/tree/x3/:address', async (req, res) => {
  const query = z
    .object({ package: z.coerce.number().int().min(1).max(12).default(1), cycle: z.coerce.number().int().min(0).optional() })
    .safeParse(req.query)
  if (!query.success) throw new HttpError(400, 'package must be 1–12 and cycle a whole number')
  res.json(json(await x3Tree(addressParam(req), query.data.package, query.data.cycle)))
})
