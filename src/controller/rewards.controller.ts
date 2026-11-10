// src/controller/rewards.controller.ts — the Rewards tab's tables (FutureRide's /api/income/*).
// All routes are scoped to the signed-in wallet. Query: ?page=&limit=&search=&package=&level=
// Response: { success, total, page, pageSize, totalPages, records }
import type { Request, Response } from 'express'
import { z } from 'zod'
import { empirexId } from '../lib/format.js'
import { PACKAGE_COUNT } from '../lib/packages.js'
import { prisma } from '../lib/prisma.js'
import { HttpError } from '../utils/http.js'

const query = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(15),
  search: z.string().trim().toLowerCase().max(42).default(''),
  package: z.coerce.number().int().min(0).max(PACKAGE_COUNT).default(0), // 0 = all
  level: z.coerce.number().int().min(0).default(0), // 0 = all
})

interface Row {
  id: string
  buyer: string
  receiver?: string
  package: number
  amount: { toString(): string }
  generation?: number
  depth?: number
  paidAt?: Date
  lostAt?: Date
  txHash: string
}

// Prisma delegates don't share a callable union type, so these go through a narrow cast.
type Delegate = { findMany: (args: object) => Promise<unknown[]>; count: (args: object) => Promise<number> }

interface Stream {
  model: unknown
  /** The column holding the signed-in wallet. */
  owner: 'receiver' | 'lostBy'
  /** Always-on conditions. */
  where?: object
  /** Column behind the "level" filter and value, if this stream has one. */
  level?: 'generation' | 'depth'
}

const table = (stream: Stream) => async (req: Request, res: Response) => {
  const parsed = query.safeParse(req.query)
  if (!parsed.success) throw new HttpError(400, 'Invalid page, limit, search, package or level')
  const { page, limit, search, package: pkg, level } = parsed.data

  const where = {
    [stream.owner]: res.locals.walletAddress as string,
    ...stream.where,
    ...(search ? { buyer: { contains: search } } : {}),
    ...(pkg > 0 ? { package: pkg } : {}),
    ...(level > 0 && stream.level ? { [stream.level]: level } : {}),
  }
  const model = stream.model as Delegate
  const [rows, total] = await Promise.all([
    model.findMany({
      where,
      orderBy: [{ blockNumber: 'desc' }, { logIndex: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }) as Promise<Row[]>,
    model.count({ where }),
  ])

  res.json({
    success: true,
    total,
    page,
    pageSize: limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    records: rows.map((r) => ({
      id: r.id,
      // The EmpireX ID of the member whose purchase caused this row.
      empirexId: empirexId(r.buyer),
      fromUserAddress: r.buyer,
      redirectedToAddress: r.receiver && stream.owner === 'lostBy' ? r.receiver : null,
      packageNumber: r.package,
      level: stream.level ? (r[stream.level] ?? null) : null,
      amount: Number(r.amount.toString()),
      creditedAt: r.paidAt ?? r.lostAt,
      transactionHash: r.txHash,
    })),
  })
}

// The third-slot payment of a cycle funds the recycle and is never paid out, so it isn't a reward.
export const getX3Rewards = table({ model: prisma.x3Payment, owner: 'receiver', where: { recycled: false } })
export const getLevelRewards = table({ model: prisma.levelIncome, owner: 'receiver', level: 'generation' })
export const getLevelLapseRewards = table({ model: prisma.levelLapseIncome, owner: 'receiver', level: 'depth' })
export const getX3Missed = table({ model: prisma.x3Lost, owner: 'lostBy' })
export const getLevelMissed = table({ model: prisma.levelLost, owner: 'lostBy', level: 'generation' })
