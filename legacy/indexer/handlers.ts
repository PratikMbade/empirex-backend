// handlers.ts — turns each decoded EmpireX log into database rows.
//
// Every handler runs inside the same DB transaction that records the log in
// ContractLog, so a log is either fully applied or not at all. A handler that
// throws stops the batch; the indexer retries from the same block next tick
// instead of skipping data.
import type { Prisma } from '@prisma/client'
import type { Log } from 'viem'
import type { empirexAbi } from '../contract/abi.js'
import { contract, publicClient } from '../lib/chain.js'
import { lower, toDate, toToken } from '../lib/format.js'

type Tx = Prisma.TransactionClient
type AnyLog = Log<bigint, number, false, undefined, true, typeof empirexAbi>
type EventLog<Name extends AnyLog['eventName']> = Extract<AnyLog, { eventName: Name }>

/** Location fields shared by every derived row. */
const at = (log: AnyLog) => ({ blockNumber: log.blockNumber, txHash: lower(log.transactionHash), logIndex: log.logIndex })

// ─── Reads done before the transaction ────────────────────────────────────────
// RPC calls stay outside the DB transaction so it is never held open on the network.

export interface Prefetched {
  genParent?: string
  genSide?: 'LEFT' | 'RIGHT'
}

/**
 * The binary generation tree has no placement event, so it is read from
 * B_Matrix_L12_Details. Placement is written once and never changes, so reading the
 * latest state is correct even while catching up on old blocks.
 */
async function readGenPlacement(user: `0x${string}`): Promise<Prefetched> {
  const [, upline] = await publicClient.readContract({ ...contract, functionName: 'B_Matrix_L12_Details', args: [user] })
  if (lower(upline) === lower(user)) return {}
  const [, , , left, right] = await publicClient.readContract({ ...contract, functionName: 'B_Matrix_L12_Details', args: [upline] })
  const side = lower(left) === lower(user) ? 'LEFT' : lower(right) === lower(user) ? 'RIGHT' : null
  if (!side) throw new Error(`B_Matrix_L12_Details: ${user} is not a child of its upline ${upline}`)
  return { genParent: lower(upline), genSide: side }
}

export async function prefetch(log: AnyLog): Promise<Prefetched> {
  return log.eventName === 'RegisterEV' ? readGenPlacement(log.args.user) : {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function requireMember(tx: Tx, address: string) {
  const member = await tx.member.findUnique({ where: { address } })
  if (!member) throw new Error(`member ${address} is not indexed yet`)
  return member
}

/** Walks `steps` sponsors up from `address`, as the contract's register[x]._referralAdd loop does. */
async function sponsorAncestor(tx: Tx, address: string, steps: number) {
  let current = address
  for (let i = 0; i < steps; i++) current = (await requireMember(tx, current)).sponsor
  return current
}

// ─── Event handlers ───────────────────────────────────────────────────────────

async function onRegister(tx: Tx, log: EventLog<'RegisterEV'>, pre: Prefetched) {
  const address = lower(log.args.user)
  const sponsor = lower(log.args.referral)
  await requireMember(tx, sponsor)
  const data = {
    regId: Number(log.args.id),
    sponsor,
    registeredAt: toDate(log.args.time),
    regTxHash: lower(log.transactionHash),
    genParent: pre.genParent ?? null,
    genSide: pre.genSide ?? null,
    genPlacedAt: pre.genParent ? toDate(log.args.time) : null,
  }
  await tx.member.upsert({ where: { address }, create: { address, ...data }, update: data })
}

async function onPackageBuy(tx: Tx, log: EventLog<'PackageBuyEV'>) {
  const address = lower(log.args.user)
  const level = Number(log.args.package)
  const member = await requireMember(tx, address)
  const tier = await tx.packageTier.findUnique({ where: { level } })
  if (!tier) throw new Error(`package ${level} is not in PackageTier; run the bootstrap first`)

  await tx.packagePurchase.create({
    data: {
      memberAddress: address,
      package: level,
      packageBuyId: Number(log.args.currentId),
      price: tier.price,
      purchasedAt: toDate(log.args.time),
      ...at(log),
    },
  })
  if (level > member.highestPackage) {
    await tx.member.update({ where: { address }, data: { highestPackage: level } })
  }
  // Mirrors register[referrer]._eTeamCount += 1 when a direct reaches package 4.
  if (level === 4 && !member.isRoot) {
    await tx.member.update({ where: { address: member.sponsor }, data: { qualifiedDirects: { increment: 1 } } })
  }
}

async function onX3Distribution(tx: Tx, log: EventLog<'x3Distribution'>) {
  const receiver = lower(log.args.to)
  const buyer = lower(log.args.from)
  const pkg = Number(log.args.package)

  await tx.x3Payment.create({
    data: {
      receiver,
      buyer,
      package: pkg,
      amount: toToken(log.args.amount),
      buyerChain: Number(log.args.chain),
      paidAt: toDate(log.args.time),
      ...at(log),
    },
  })

  // DirectTeamS3 never seats a member in their own matrix (`if (ref != _user)`),
  // which happens when the root recycles into itself.
  if (receiver === buyer) return

  const current = await tx.x3Matrix.findFirst({ where: { owner: receiver, package: pkg }, orderBy: { cycle: 'desc' } })
  if (!current) {
    await tx.x3Matrix.create({ data: { owner: receiver, package: pkg, cycle: 1, slot1: buyer } })
    return
  }
  const slot = !current.slot1 ? 'slot1' : !current.slot2 ? 'slot2' : !current.slot3 ? 'slot3' : null
  if (!slot) throw new Error(`x3 matrix ${receiver} P${pkg} cycle ${current.cycle} is full but was not recycled`)
  await tx.x3Matrix.update({
    where: { owner_package_cycle: { owner: receiver, package: pkg, cycle: current.cycle } },
    data: { [slot]: buyer },
  })
}

async function onRecycle(tx: Tx, log: EventLog<'Recycle'>) {
  const owner = lower(log.args.recycleuser)
  const triggeredBy = lower(log.args.recycleBy)
  const pkg = Number(log.args.package)
  const newCycle = Number(log.args.chain)

  await tx.recycle.create({
    data: { owner, triggeredBy, package: pkg, newCycle, recycledAt: toDate(log.args.time), ...at(log) },
  })

  // The third-slot payment is emitted right before Recycle. The contract sends it
  // to itself instead of the owner, so it is not income.
  const thirdSlot = await tx.x3Payment.findUnique({
    where: { txHash_logIndex: { txHash: lower(log.transactionHash), logIndex: log.logIndex - 1 } },
  })
  if (!thirdSlot || thirdSlot.receiver !== owner || thirdSlot.buyer !== triggeredBy || thirdSlot.package !== pkg) {
    throw new Error(`Recycle at ${log.transactionHash}#${log.logIndex} has no matching third-slot x3Distribution before it`)
  }
  await tx.x3Payment.update({ where: { id: thirdSlot.id }, data: { recycled: true } })

  await tx.x3Matrix.upsert({
    where: { owner_package_cycle: { owner, package: pkg, cycle: newCycle } },
    create: { owner, package: pkg, cycle: newCycle },
    update: {},
  })
}

/**
 * LapsPayEV fires for every x3 placement. The contract's lapAdd array drops the
 * last member it passed over (_sliceLaps(lapsArr, lvl) where lvl + 1 were
 * filled), so the full list is rebuilt from the sponsor chain the same way the
 * contract walks it, and checked against the event.
 */
async function onLapsPay(tx: Tx, log: EventLog<'LapsPayEV'>) {
  const receiver = lower(log.args.to)
  const buyer = lower(log.args.from)
  const pkg = Number(log.args.package)
  const depth = Number(log.args.lvlpay)
  const amount = toToken(log.args.amount)
  const time = toDate(log.args.time)
  const eventList = log.args.lapAdd.map(lower)

  const buyerMember = await requireMember(tx, buyer)
  const lapsed = receiver !== buyerMember.sponsor

  await tx.x3Routing.create({
    data: { receiver, buyer, package: pkg, amount, depth, lapsed, routedAt: time, ...at(log) },
  })
  if (!lapsed) return

  // lapsArr[0] is the sponsor; each next entry is `package` sponsors further up.
  const skipped = [buyerMember.sponsor]
  for (let i = 0; i < depth; i++) skipped.push(await sponsorAncestor(tx, skipped[i]!, pkg))

  const matchesEvent = eventList.every((address, i) => address === skipped[i])
  if (!matchesEvent) {
    console.warn(`[x3] lapse list rebuilt for ${log.transactionHash}#${log.logIndex} differs from the event; storing the event's list`)
  }
  const lostBy = matchesEvent ? skipped : eventList

  if (lostBy.length) {
    await tx.x3Lost.createMany({
      data: lostBy.map((address, position) => ({ lostBy: address, buyer, receiver, package: pkg, amount, position, lostAt: time, ...at(log) })),
    })
  }
}

async function onLevelIncome(tx: Tx, log: EventLog<'LevelIncomeEV'>) {
  await tx.levelIncome.create({
    data: {
      receiver: lower(log.args.to),
      buyer: lower(log.args.from),
      package: Number(log.args.package),
      generation: Number(log.args.lvl),
      amount: toToken(log.args.amount),
      paidAt: toDate(log.args.time),
      ...at(log),
    },
  })
}

async function onLevelLapse(tx: Tx, log: EventLog<'LevellapseIncomeEV'>) {
  await tx.levelLapseIncome.create({
    data: {
      receiver: lower(log.args.to),
      buyer: lower(log.args.from),
      package: Number(log.args.package),
      depth: Number(log.args.lvl),
      amount: toToken(log.args.amount),
      paidAt: toDate(log.args.time),
      ...at(log),
    },
  })
}

async function onLevelLost(tx: Tx, log: EventLog<'LevelLostIncomeEV'>) {
  const shared = {
    buyer: lower(log.args.from),
    package: Number(log.args.package),
    generation: Number(log.args.lvl),
    amount: toToken(log.args.amount),
    lostAt: toDate(log.args.time),
    ...at(log),
  }
  if (!log.args.to.length) return
  await tx.levelLost.createMany({ data: log.args.to.map((address, position) => ({ lostBy: lower(address), position, ...shared })) })
}

/** Applies one log. Events with no handler (ownership changes, unused declarations) are only stored in ContractLog. */
export async function applyLog(tx: Tx, log: AnyLog, pre: Prefetched) {
  switch (log.eventName) {
    case 'RegisterEV':
      return onRegister(tx, log, pre)
    case 'PackageBuyEV':
      return onPackageBuy(tx, log)
    case 'x3Distribution':
      return onX3Distribution(tx, log)
    case 'Recycle':
      return onRecycle(tx, log)
    case 'LapsPayEV':
      return onLapsPay(tx, log)
    case 'LevelIncomeEV':
      return onLevelIncome(tx, log)
    case 'LevellapseIncomeEV':
      return onLevelLapse(tx, log)
    case 'LevelLostIncomeEV':
      return onLevelLost(tx, log)
    default:
      return
  }
}

export type { AnyLog }
