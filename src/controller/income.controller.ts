// src/controller/income.controller.ts
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { addressParam, HttpError, json, paged, pagination } from '../utils/http.js'
import { requireMember } from '../utils/memberSummary.js'

const recent = { orderBy: [{ blockNumber: 'desc' as const }, { logIndex: 'desc' as const }] }

const INCOME = {
  x3: (receiver: string) => ({ model: prisma.x3Payment, where: { receiver, recycled: false } }),
  level: (receiver: string) => ({ model: prisma.levelIncome, where: { receiver } }),
  'level-lapse': (receiver: string) => ({ model: prisma.levelLapseIncome, where: { receiver } }),
}
const LOST = {
  x3: (lostBy: string) => ({ model: prisma.x3Lost, where: { lostBy } }),
  level: (lostBy: string) => ({ model: prisma.levelLost, where: { lostBy } }),
}

// Prisma delegates don't share a callable union type, so these go through a narrow cast.
type Delegate = { findMany: (args: object) => Promise<unknown[]>; count: (args: object) => Promise<number> }

async function history(table: { model: unknown; where: object }, req: Request) {
  const { page, pageSize, skip, take } = pagination(req)
  const model = table.model as Delegate
  const [rows, total] = await Promise.all([
    model.findMany({ where: table.where, skip, take, ...recent }),
    model.count({ where: table.where }),
  ])
  return json(paged(rows, total, page, pageSize))
}

// ─── GET /api/members/:address/income/:stream ─────────────
// stream: x3 | level | level-lapse
export const getIncome = async (req: Request, res: Response) => {
  const address = addressParam(req)
  const pick = INCOME[req.params.stream as keyof typeof INCOME]
  if (!pick) throw new HttpError(400, `stream must be one of ${Object.keys(INCOME).join(', ')}`)
  await requireMember(address)
  res.json(await history(pick(address), req))
}

// ─── GET /api/members/:address/lost/:stream ───────────────
// stream: x3 | level
export const getLostIncome = async (req: Request, res: Response) => {
  const address = addressParam(req)
  const pick = LOST[req.params.stream as keyof typeof LOST]
  if (!pick) throw new HttpError(400, `stream must be one of ${Object.keys(LOST).join(', ')}`)
  await requireMember(address)
  res.json(await history(pick(address), req))
}

// ─── GET /api/members/:address/recycles ───────────────────
export const getRecycles = async (req: Request, res: Response) => {
  const address = addressParam(req)
  await requireMember(address)
  res.json(await history({ model: prisma.recycle, where: { owner: address } }, req))
}
