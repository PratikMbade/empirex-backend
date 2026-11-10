// src/controller/userInfo.controller.ts
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { json } from '../utils/http.js'
import { memberSummary } from '../utils/memberSummary.js'

// ─── GET /api/me ──────────────────────────────────────────
// The signed-in wallet's summary. 200 with registered:false when it hasn't joined on chain yet.
export const getMe = async (_req: Request, res: Response) => {
  const address = res.locals.walletAddress as string
  const member = await prisma.member.findUnique({ where: { address }, select: { address: true } })
  if (!member) {
    res.json({ registered: false, address })
    return
  }
  res.json(json({ registered: true, ...(await memberSummary(address)) }))
}
