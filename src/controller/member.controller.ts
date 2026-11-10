// src/controller/member.controller.ts
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { addressParam, json, paged, pagination } from '../utils/http.js'
import { memberSummary, requireMember } from '../utils/memberSummary.js'
import { empirexId } from '../lib/format.js'

// ─── GET /api/members/:address ────────────────────────────
// Package, directs, team size, income and lost totals, recycles.
export const getMemberSummary = async (req: Request, res: Response) => {
  res.json(json(await memberSummary(addressParam(req))))
}

// ─── GET /api/members/:address/direct-team ────────────────
export const getDirectTeam = async (req: Request, res: Response) => {
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
    memberId: empirexId(m.address),
    registeredAt: m.registeredAt,
    highestPackage: m.highestPackage,
    qualifiedDirects: m.qualifiedDirects,
    directCount: directsOf.get(m.address) ?? 0,
  }))
  res.json(json(paged(members, total, page, pageSize)))
}
