// src/controller/x3Tree.controller.ts
import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { addressParam, HttpError, json } from '../utils/http.js'
import { requireMember, treeNodes, type TreeMember } from '../utils/memberSummary.js'

const query = z.object({
  package: z.coerce.number().int().min(1).max(12).default(1),
  cycle: z.coerce.number().int().min(0).optional(),
})

// ─── GET /api/tree/x3/:address?package=1&cycle= ───────────
// One cycle of a member's x3 matrix (the first, recycle 0, by default): the owner and its three slots.
export const getX3Tree = async (req: Request, res: Response) => {
  const parsed = query.safeParse(req.query)
  if (!parsed.success) throw new HttpError(400, 'package must be 1–12 and cycle a whole number')
  const { package: pkg, cycle } = parsed.data
  const owner = addressParam(req)

  await requireMember(owner)
  const cycles = await prisma.x3Matrix.findMany({ where: { owner, package: pkg }, orderBy: { cycle: 'asc' } })
  const matrix = cycle === undefined ? cycles[0] : cycles.find((c) => c.cycle === cycle)
  if (cycle !== undefined && !matrix) throw new HttpError(404, `no cycle ${cycle} for package ${pkg}`)
  const slots = [matrix?.slot1 ?? null, matrix?.slot2 ?? null, matrix?.slot3 ?? null]

  // Matrix slots fill in payment order, so a slot's payment is found by counting every earlier placement.
  const payments = await prisma.x3Payment.findMany({
    where: { receiver: owner, package: pkg, NOT: { buyer: owner } },
    orderBy: [{ blockNumber: 'asc' }, { logIndex: 'asc' }],
    select: { buyer: true, buyerChain: true, recycled: true },
  })
  const placedBefore = cycles.filter((c) => matrix && c.cycle < matrix.cycle).flatMap((c) => [c.slot1, c.slot2, c.slot3]).filter((s) => s !== null).length
  const placement = (slot: string, index: number) => {
    const payment = payments[placedBefore + index]
    if (payment?.buyer !== slot) return { recycled: false, noIncome: false }
    // A member's first purchase is chain 1, so a higher chain means their own matrix filled and they came back.
    return { recycled: payment.buyerChain > 1, noIncome: payment.recycled }
  }
  const nodes = await treeNodes([owner, ...slots.filter((s): s is string => s !== null)])

  res.json(
    json({
      package: pkg,
      cycle: matrix?.cycle ?? null,
      cycles: cycles.map((c) => c.cycle),
      tree: {
        ...nodes.get(owner)!,
        generation: 0,
        children: slots.map((s, i) => (s ? { ...nodes.get(s)!, ...placement(s, i), generation: 1, children: [] } : null)),
      } satisfies TreeMember,
    }),
  )
}
