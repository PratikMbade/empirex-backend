// src/contract/event-listener.ts
//
// One WebSocket listener per contract event, same pattern as FutureRide:
// reconnectSilent keeps the socket alive, and every callback routes its work
// through queueTxEvent instead of running immediately. One registration tx
// emits RegisterEV + PackageBuyEV + LapsPayEV + x3Distribution (+ Recycle) +
// level events, which arrive as independent, unordered pushes; the queue runs
// them in a fixed order (RegisterEV first, then chain order) — see
// utils/txEventQueue.ts.
//
// Anything a listener misses or fails on (socket down, member not indexed yet)
// is picked up by the sync scheduler (services/syncService.ts). Both paths are
// idempotent on (txHash, logIndex), see utils/processEvent.ts.
import type { ethers } from 'ethers'
import { config } from '../lib/config.js'
import { reconnectSilent } from '../utils/reconnectSilent.js'
import { queueTxEvent } from '../utils/txEventQueue.js'
import { eventHandlers, type ListenedEvent } from './event-handlers.js'
import { contractAbi } from './index.js'

const CONTRACT_ADDRESS = config.CONTRACT_ADDRESS
const RPC_WSS = config.RPC_WS_URL!

/** Opens a socket for `eventName` and queues every log it pushes. `describe` builds the log line. */
function listen(eventName: ListenedEvent, describe: (args: ethers.utils.Result) => string) {
  reconnectSilent({
    wssUrl: RPC_WSS,
    contractAddress: CONTRACT_ADDRESS,
    abi: contractAbi,
    label: eventName,
    onReady: (_, contract) => {
      contract.removeAllListeners(eventName)

      contract.on(eventName, (...params: unknown[]) => {
        const event = params[params.length - 1] as ethers.Event
        const txHash = event.transactionHash.toLowerCase()
        console.log(`📥 ${eventName}: ${describe(event.args!)} tx:${txHash}#${event.logIndex}`)

        queueTxEvent(txHash, eventName, event.logIndex, async () => {
          await eventHandlers[eventName](event)
        })
      })
    },
  })
}

// ─────────────────────────────────────────────────────────
//  REGISTER EV
//  event RegisterEV(
//    address indexed user,
//    address indexed referral,
//    uint256 indexed time,
//    uint256 id
//  )
//  New member → Member row; generation-tree position read from B_Matrix_L12_Details
// ─────────────────────────────────────────────────────────
export const registrationEventListener = () =>
  listen('RegisterEV', (a) => `${a.user} ref:${a.referral} id:${a.id}`)

// ─────────────────────────────────────────────────────────
//  PACKAGE BUY EV
//  event PackageBuyEV(
//    address indexed user,
//    uint256 indexed package,
//    uint256 time,
//    uint256 currentId   ← buyer's id in this package's queue
//  )
//  Emitted on registration (package 1), manual buys and bulk buys
// ─────────────────────────────────────────────────────────
export const packageBuyEventListener = () =>
  listen('PackageBuyEV', (a) => `${a.user} PKG${a.package} currentId:${a.currentId}`)

// ─────────────────────────────────────────────────────────
//  X3 DISTRIBUTION
//  event x3Distribution(
//    address indexed from,   ← buyer
//    address indexed to,     ← matrix owner whose slot the buyer took
//    uint256 package,
//    uint256 chain,          ← buyer's own cycle number
//    uint256 time,
//    uint256 amount          ← 50% of the package fee
//  )
//  Third-slot fills are not paid — the Recycle emitted right after marks them
// ─────────────────────────────────────────────────────────
export const x3DistributionEventListener = () =>
  listen('x3Distribution', (a) => `${a.from}→${a.to} PKG${a.package} chain:${a.chain}`)

// ─────────────────────────────────────────────────────────
//  RECYCLE
//  event Recycle(
//    address indexed recycleuser,  ← matrix owner
//    address indexed recycleBy,    ← buyer who filled the third slot
//    uint256 time,
//    uint256 chain,                ← owner's new cycle number
//    uint256 package
//  )
// ─────────────────────────────────────────────────────────
export const recycleEventListener = () =>
  listen('Recycle', (a) => `${a.recycleuser} by ${a.recycleBy} PKG${a.package} → cycle ${a.chain}`)

// ─────────────────────────────────────────────────────────
//  LAPS PAY EV
//  event LapsPayEV(
//    address indexed from,     ← buyer
//    address indexed to,       ← who got the x3 slot
//    uint256 indexed amount,
//    uint256 package,
//    uint256 time,
//    uint256 lvlpay,           ← how many steps up the slot was found
//    address[] lapAdd          ← members passed over (contract drops the last one)
//  )
//  Emitted for every x3 placement; lapsed when `to` isn't the buyer's sponsor
// ─────────────────────────────────────────────────────────
export const lapsIncomeEventListener = () =>
  listen('LapsPayEV', (a) => `${a.from}→${a.to} PKG${a.package} LVL${a.lvlpay} lapsed:[${(a.lapAdd as string[]).join(', ')}]`)

// ─────────────────────────────────────────────────────────
//  LEVEL INCOME EV
//  event LevelIncomeEV(
//    address indexed from,     ← buyer
//    address indexed to,       ← eligible upline
//    uint256 indexed amount,
//    uint256 lvl,              ← generation (1-12)
//    uint256 time,
//    uint256 package
//  )
// ─────────────────────────────────────────────────────────
export const levelIncomeEventListener = () =>
  listen('LevelIncomeEV', (a) => `${a.from}→${a.to} LVL${a.lvl} PKG${a.package}`)

// ─────────────────────────────────────────────────────────
//  LEVEL LAPSE INCOME EV
//  event LevellapseIncomeEV(
//    address indexed from,
//    address indexed to,       ← upline (or owner) further up who got the cut
//    uint256 indexed amount,
//    uint256 lvl,              ← depth above the buyer
//    uint256 time,
//    uint256 package
//  )
// ─────────────────────────────────────────────────────────
export const levelLapseIncomeEventListener = () =>
  listen('LevellapseIncomeEV', (a) => `${a.from}→${a.to} depth ${a.lvl} PKG${a.package}`)

// ─────────────────────────────────────────────────────────
//  LEVEL LOST INCOME EV
//  event LevelLostIncomeEV(
//    address indexed from,     ← buyer
//    address[] to,             ← every upline passed over at this level
//    uint256 amount,
//    uint256 lvl,
//    uint256 time,
//    uint256 package
//  )
//  One LevelLost row per skipped address
// ─────────────────────────────────────────────────────────
export const levelLostIncomeEventListener = () =>
  listen('LevelLostIncomeEV', (a) => `${a.from} → [${(a.to as string[]).join(', ')}] lost LVL${a.lvl} PKG${a.package}`)
