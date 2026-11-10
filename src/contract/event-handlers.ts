// src/contract/event-handlers.ts
//
// Turns one decoded ethers Event into a service call. Shared by the live
// WebSocket listeners (event-listener.ts) and the catch-up sync
// (services/syncService.ts), so both parse every event the same way.
//
// Events the deployed contract emits — each has a listener:
//   RegisterEV, PackageBuyEV, x3Distribution, Recycle, LapsPayEV,
//   LevelIncomeEV, LevellapseIncomeEV, LevelLostIncomeEV
//
// Declared in the ABI but never emitted (their emits are commented out in
// contract/empirex.sol), so they have no listener:
//   DirectPayEV, GenerationPayEV, PackageBuy
// Ownership events (OwnershipTransferred, renouncedOwnership) aren't stored.
import type { ethers } from 'ethers'
import { contract } from './index.js'
import { toToken } from '../lib/format.js'
import { lapsIncomeService } from '../services/lapsincome.service.js'
import { levelIncomeService } from '../services/levelincome.service.js'
import { levelLapseIncomeService } from '../services/levelLapseIncome.service.js'
import { levelLostIncomeService } from '../services/levelLostIncome.service.js'
import { packageBuyService } from '../services/packagebuy.service.js'
import { recycleService } from '../services/recycle.service.js'
import { registerUserService } from '../services/registeruser.service.js'
import { x3DistributionService } from '../services/x3Distribution.service.js'
import type { EventMeta } from '../utils/processEvent.js'

export const LISTENED_EVENTS = [
  'RegisterEV',
  'PackageBuyEV',
  'x3Distribution',
  'Recycle',
  'LapsPayEV',
  'LevelIncomeEV',
  'LevellapseIncomeEV',
  'LevelLostIncomeEV',
] as const

export type ListenedEvent = (typeof LISTENED_EVENTS)[number]

const num = (v: ethers.BigNumber) => v.toNumber()
const amount = (v: ethers.BigNumber) => toToken(v.toBigInt())

/** Named args only (an ethers Result also has positional keys). */
function namedArgs(event: ethers.Event): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const inputs = event.event ? contract.interface.getEvent(event.event).inputs : []
  for (const input of inputs) {
    const v = event.args?.[input.name]
    out[input.name] = v && typeof v === 'object' && '_isBigNumber' in v ? (v as ethers.BigNumber).toString() : v
  }
  return out
}

function meta(event: ethers.Event, timestamp: ethers.BigNumber): EventMeta {
  return {
    eventName: event.event!,
    txHash: event.transactionHash.toLowerCase(),
    logIndex: event.logIndex,
    blockNumber: event.blockNumber,
    timestamp: timestamp.toNumber(),
    args: namedArgs(event),
  }
}

/** Every handler returns true when the event was stored now, false when it already was. */
export const eventHandlers: Record<ListenedEvent, (event: ethers.Event) => Promise<boolean>> = {
  // RegisterEV(address indexed user, address indexed referral, uint256 indexed time, uint256 id)
  RegisterEV: (e) => {
    const { user, referral, time, id } = e.args!
    return registerUserService(user, referral, num(id), num(time), meta(e, time))
  },

  // PackageBuyEV(address indexed user, uint256 indexed package, uint256 time, uint256 currentId)
  PackageBuyEV: (e) => {
    const { user, time, currentId } = e.args!
    return packageBuyService(user, num(e.args!.package), num(currentId), num(time), meta(e, time))
  },

  // x3Distribution(address indexed from, address indexed to, uint256 package, uint256 chain, uint256 time, uint256 amount)
  x3Distribution: (e) => {
    const { from, to, chain, time } = e.args!
    return x3DistributionService(from, to, num(e.args!.package), num(chain), amount(e.args!.amount), num(time), meta(e, time))
  },

  // Recycle(address indexed recycleuser, address indexed recycleBy, uint256 time, uint256 chain, uint256 package)
  Recycle: (e) => {
    const { recycleuser, recycleBy, time, chain } = e.args!
    return recycleService(recycleuser, recycleBy, num(chain), num(e.args!.package), num(time), meta(e, time))
  },

  // LapsPayEV(address indexed from, address indexed to, uint256 indexed amount, uint256 package, uint256 time, uint256 lvlpay, address[] lapAdd)
  LapsPayEV: (e) => {
    const { from, to, time, lvlpay, lapAdd } = e.args!
    return lapsIncomeService(from, to, amount(e.args!.amount), num(e.args!.package), num(lvlpay), num(time), lapAdd, meta(e, time))
  },

  // LevelIncomeEV(address indexed from, address indexed to, uint256 indexed amount, uint256 lvl, uint256 time, uint256 package)
  LevelIncomeEV: (e) => {
    const { from, to, lvl, time } = e.args!
    return levelIncomeService(from, to, amount(e.args!.amount), num(lvl), num(e.args!.package), num(time), meta(e, time))
  },

  // LevellapseIncomeEV(address indexed from, address indexed to, uint256 indexed amount, uint256 lvl, uint256 time, uint256 package)
  LevellapseIncomeEV: (e) => {
    const { from, to, lvl, time } = e.args!
    return levelLapseIncomeService(from, to, amount(e.args!.amount), num(lvl), num(e.args!.package), num(time), meta(e, time))
  },

  // LevelLostIncomeEV(address indexed from, address[] to, uint256 amount, uint256 lvl, uint256 time, uint256 package)
  LevelLostIncomeEV: (e) => {
    const { from, to, lvl, time } = e.args!
    return levelLostIncomeService(from, to, amount(e.args!.amount), num(lvl), num(e.args!.package), num(time), meta(e, time))
  },
}

export const isListenedEvent = (name: string | undefined): name is ListenedEvent =>
  !!name && (LISTENED_EVENTS as readonly string[]).includes(name)
