// src/controller/generationTree.controller.ts
import type { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { addressParam, HttpError, json } from '../utils/http.js'
import { requireMember, treeNodes, type TreeMember } from '../utils/memberSummary.js'

/** Binary generation tree (B_Matrix_L12_Details), `depth` generations below `root`. Children are [left, right]. */
async function buildGenerationTree(root: string, depth: number): Promise<TreeMember> {
  await requireMember(root)
  const childrenOf = new Map<string, (string | null)[]>()
  let frontier = [root]
  const all = [root]
  // one DB round-trip per level, never more than ~2^depth rows
  for (let level = 0; level < depth && frontier.length; level++) {
    const rows = await prisma.member.findMany({
      where: { genParent: { in: frontier } },
      select: { address: true, genParent: true, genSide: true },
    })
    for (const parent of frontier) childrenOf.set(parent, [null, null])
    for (const row of rows) childrenOf.get(row.genParent!)![row.genSide === 'LEFT' ? 0 : 1] = row.address
    frontier = rows.map((r) => r.address)
    all.push(...frontier)
  }
  const nodes = await treeNodes(all)
  const build = (address: string, generation: number): TreeMember => ({
    ...nodes.get(address)!,
    generation,
    children: generation < depth ? (childrenOf.get(address) ?? [null, null]).map((c) => (c ? build(c, generation + 1) : null)) : [],
  })
  return build(root, 0)
}

// ─── GET /api/tree/generation/:address?depth=3 ────────────
export const getGenerationTree = async (req: Request, res: Response) => {
  const depth = z.coerce.number().int().min(1).max(6).default(3).safeParse(req.query.depth)
  if (!depth.success) throw new HttpError(400, 'depth must be between 1 and 6')
  res.json(json({ tree: await buildGenerationTree(addressParam(req), depth.data) }))
}
