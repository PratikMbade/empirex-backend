// src/middleware/authMiddleware.ts
import type { NextFunction, Request, Response } from 'express'
import { sessionWallet } from '../lib/auth.js'
import { prisma } from '../lib/prisma.js'

/** Signed-in wallet (SIWE session) → res.locals.walletAddress, else 401. */
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const address = await sessionWallet(req.headers)
  if (!address) {
    res.status(401).json({ error: 'sign in with your wallet first' })
    return
  }
  res.locals.walletAddress = address
  next()
}

/** After requireAuth: the wallet must be a registered member → res.locals.member, else 403. */
export const requireRegistered = async (_req: Request, res: Response, next: NextFunction) => {
  const member = await prisma.member.findUnique({ where: { address: res.locals.walletAddress as string } })
  if (!member) {
    res.status(403).json({ error: 'Not registered on contract' })
    return
  }
  res.locals.member = member
  next()
}
