import { Router } from 'express'
import { sessionWallet } from '../../lib/auth.js'
import { prisma } from '../../lib/prisma.js'
import { HttpError, json } from '../http.js'
import { memberSummary } from '../queries.js'

export const meRouter = Router()

/** The signed-in wallet's summary. 200 with registered:false when it hasn't joined on chain yet. */
meRouter.get('/me', async (req, res) => {
  const address = await sessionWallet(req.headers)
  if (!address) throw new HttpError(401, 'sign in with your wallet first')
  const member = await prisma.member.findUnique({ where: { address }, select: { address: true } })
  if (!member) {
    res.json({ registered: false, address })
    return
  }
  res.json(json({ registered: true, ...(await memberSummary(address)) }))
})
