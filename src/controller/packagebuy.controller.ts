// src/controller/packagebuy.controller.ts
import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { z } from 'zod'
import { PACKAGE_COUNT } from '../lib/packages.js'
import { TX_HASH_RE, applyContractEvents, loadContractTx } from '../services/txFallback.service.js'
import { addressParam, HttpError, json } from '../utils/http.js'
import { requireMember } from '../utils/memberSummary.js'

// ─── GET /api/packages ────────────────────────────────────
// The 12 packages with on-chain prices.
export const getPackages = async (_req: Request, res: Response) => {
  res.json(json(await prisma.packageTier.findMany({ orderBy: { level: 'asc' } })))
}

// ─── GET /api/members/:address/packages ───────────────────
export const getUserPackages = async (req: Request, res: Response) => {
  const address = addressParam(req)
  await requireMember(address)
  res.json(json(await prisma.packagePurchase.findMany({ where: { memberAddress: address }, orderBy: { package: 'asc' } })))
}

// ─── GET /api/packages/mine ───────────────────────────────
// The signed-in member's packages, for the Packages page (FutureRide's GET /api/packages).
export const getMyPackages = async (_req: Request, res: Response) => {
  const member = res.locals.member as { address: string; highestPackage: number }
  const purchases = await prisma.packagePurchase.findMany({ where: { memberAddress: member.address }, orderBy: { package: 'asc' } })
  res.json(
    json({
      highestPackage: member.highestPackage,
      purchases: purchases.map((p) => ({ package: p.package, price: p.price, purchasedAt: p.purchasedAt, txHash: p.txHash })),
    }),
  )
}

// ─── POST /api/packages/buy ───────────────────────────────
// Fallback after BuyRankUser(): the frontend posts { packageNumber, transactionHash }
// once the tx is mined, and the purchase is stored now instead of when the worker
// sees it. As in FutureRide, the tx must contain this member's PackageBuyEV for
// exactly this package; otherwise it's rejected. All of the tx's events (x3, level
// income, recycles…) are applied with it, in log order.
const buyBody = z.object({
  packageNumber: z.number().int().min(1).max(PACKAGE_COUNT),
  transactionHash: z.string().regex(TX_HASH_RE),
})

async function recordPurchase(res: Response, address: string, packageNumber: number, transactionHash: string, label: string) {
  const existing = await prisma.packagePurchase.findUnique({
    where: { memberAddress_package: { memberAddress: address, package: packageNumber } },
  })
  if (existing) {
    res.json(json({ success: true, alreadyRecorded: true, message: 'Package already recorded', package: existing }))
    return
  }

  const events = await loadContractTx(transactionHash.toLowerCase())
  const purchase = events.find(
    (e) => e.event === 'PackageBuyEV' && String(e.args?.user).toLowerCase() === address && Number(e.args?.package) === packageNumber,
  )
  if (!purchase) {
    console.warn(`🚨 [${label}] REJECTED — no PackageBuyEV for ${address} P${packageNumber} in ${transactionHash}`)
    throw new HttpError(400, 'This transaction does not contain that package purchase.')
  }

  const result = await applyContractEvents(events, 'PackageFallback')
  if (result.status === 'deferred') {
    res.status(202).json(json({ success: true, alreadyRecorded: false, message: 'Purchase confirmed on chain; it will appear shortly', ...result }))
    return
  }
  console.log(`✅ Package ${packageNumber} recorded for ${address} via ${label}`)
  res.status(201).json(json({ success: true, alreadyRecorded: result.stored === 0, message: `Package ${packageNumber} activated`, ...result }))
}

export const buyPackage = async (req: Request, res: Response) => {
  const parsed = buyBody.safeParse(req.body)
  if (!parsed.success) throw new HttpError(400, `packageNumber (1–${PACKAGE_COUNT}) and a valid transactionHash are required`)
  await recordPurchase(res, res.locals.walletAddress as string, parsed.data.packageNumber, parsed.data.transactionHash, 'POST /buy')
}

// ─── POST /api/packages/buy-for ───────────────────────────
// The same fallback when a member pays for someone else's rank. Safe for any signed-in
// member to call: it can only store what that transaction's on-chain events prove.
const buyForBody = buyBody.extend({ userAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/) })

export const buyPackageFor = async (req: Request, res: Response) => {
  const parsed = buyForBody.safeParse(req.body)
  if (!parsed.success) throw new HttpError(400, `userAddress, packageNumber (1–${PACKAGE_COUNT}) and a valid transactionHash are required`)
  const { userAddress, packageNumber, transactionHash } = parsed.data
  await recordPurchase(res, userAddress.toLowerCase(), packageNumber, transactionHash, 'POST /buy-for')
}
