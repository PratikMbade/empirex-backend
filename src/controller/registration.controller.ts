// src/controller/registration.controller.ts — the login and register pages' backend (FutureRide's /api/register).
import type { Request, Response } from 'express'
import { z } from 'zod'
import { EMPIREX_ID_RE, empirexId, empirexSuffix } from '../lib/format.js'
import { prisma } from '../lib/prisma.js'
import { applyContractEvents, loadContractTx, TX_HASH_RE } from '../services/txFallback.service.js'
import { HttpError, json } from '../utils/http.js'

const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

type MemberRow = NonNullable<Awaited<ReturnType<typeof prisma.member.findFirst>>>

async function sponsorInfo(member: MemberRow | null) {
  if (!member) return null
  const tier = member.highestPackage ? await prisma.packageTier.findUnique({ where: { level: member.highestPackage } }) : null
  return {
    valid: true as const,
    userAddress: member.address,
    memberId: empirexId(member.address),
    displayAddress: shortAddress(member.address),
    highestPackage: member.highestPackage,
    packageName: tier?.name ?? null,
  }
}

/** Refuses a shared ID: picking one of the matches could place a new member under the wrong sponsor. */
async function memberByEmpirexId(id: string) {
  const matches = await prisma.member.findMany({ where: { address: { endsWith: empirexSuffix(id) } }, take: 2 })
  if (matches.length > 1) throw new HttpError(409, 'More than one member has this EmpireX ID. Please enter the full wallet address of the person who invited you.')
  return matches[0] ?? null
}

// ─── GET /api/register/info ───────────────────────────────
// Is the signed-in wallet registered on the contract? Always 200 for a signed-in wallet.
export const getRegisterInfo = async (_req: Request, res: Response) => {
  const address = res.locals.walletAddress as string
  const member = await prisma.member.findUnique({ where: { address }, select: { sponsor: true } })
  res.json({
    isRegistered: !!member,
    userAddress: address,
    memberId: member ? empirexId(address) : null,
    sponsor: member && member.sponsor !== address ? member.sponsor : null,
  })
}

// ─── GET /api/register/validate/:referral ─────────────────
// A sponsor by EmpireX ID ("EMXB2D6342D") or wallet address; called as the user types and from ?ref= links.
// The value only reaches the query after matching one of the two exact formats below.
export const validateReferral = async (req: Request, res: Response) => {
  const raw = String(req.params.referral ?? '').trim()
  let info = null
  if (/^0x[0-9a-fA-F]{40}$/.test(raw)) info = await sponsorInfo(await prisma.member.findUnique({ where: { address: raw.toLowerCase() } }))
  else if (EMPIREX_ID_RE.test(raw)) info = await sponsorInfo(await memberByEmpirexId(raw))
  else throw new HttpError(400, 'Enter an EmpireX ID (like EMXB2D6342D) or a wallet address')

  if (!info) {
    res.status(404).json({ valid: false, error: 'No registered member with that EmpireX ID or address' })
    return
  }
  res.json(info)
}

// ─── GET /api/register/default-sponsor ────────────────────
// The root member: the sponsor for anyone who joins without a referral.
export const getDefaultSponsor = async (_req: Request, res: Response) => {
  const info = await sponsorInfo(await prisma.member.findFirst({ where: { isRoot: true } }))
  if (!info) throw new HttpError(503, 'Registration is not open yet: the contract has no root member')
  res.json(info)
}

// ─── POST /api/register/fallback ──────────────────────────
// Stores a just-mined registration from its receipt, so the dashboard doesn't
// wait for the worker. Safe to repeat and to race the worker.
const fallbackBody = z.object({ transactionHash: z.string().regex(TX_HASH_RE) })

export const registrationFallback = async (req: Request, res: Response) => {
  const parsed = fallbackBody.safeParse(req.body)
  if (!parsed.success) throw new HttpError(400, 'Valid transactionHash is required')
  const events = await loadContractTx(parsed.data.transactionHash.toLowerCase())
  const result = await applyContractEvents(events, 'RegisterFallback')
  res.status(result.status === 'stored' ? 200 : 202).json(json(result))
}
