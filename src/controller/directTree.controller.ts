// src/controller/directTree.controller.ts
import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { addressParam, HttpError, json } from '../utils/http.js'
import { requireMember, treeNodes, type TreeMember } from '../utils/memberSummary.js'

const query = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(24).default(6),
})

// ─── GET /api/tree/direct/:address?page=1&pageSize=6 ──────
// One page of the members `address` referred, oldest first, in the dashboard's
// TreeMember shape: the member at the root and their directs as children.
// The contract has no cap on directs, so the view is paged instead of fixed-width.
export const getDirectTree = async (req: Request, res: Response) => {
  const parsed = query.safeParse(req.query)
  if (!parsed.success) throw new HttpError(400, 'page must be ≥ 1 and pageSize between 1 and 24')
  const { page, pageSize } = parsed.data
  const root = addressParam(req)
  await requireMember(root)

  // The root member is its own sponsor, so exclude self-references.
  const where = { sponsor: root, NOT: { address: root } }
  const [rows, total] = await Promise.all([
    prisma.member.findMany({ where, orderBy: { regId: 'asc' }, skip: (page - 1) * pageSize, take: pageSize, select: { address: true } }),
    prisma.member.count({ where }),
  ])
  const directs = rows.map((r) => r.address)
  const nodes = await treeNodes([root, ...directs])

  res.json(
    json({
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      tree: {
        ...nodes.get(root)!,
        generation: 0,
        children: directs.map((d) => ({ ...nodes.get(d)!, generation: 1, children: [] })),
      } satisfies TreeMember,
    }),
  )
}
