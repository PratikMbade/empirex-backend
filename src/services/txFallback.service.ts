// src/services/txFallback.service.ts
//
// The "fallback" path FutureRide uses after a user's own transaction: the
// frontend posts the tx hash as soon as it's mined, and the backend applies
// that receipt's events right away instead of waiting for the worker.
// Every write goes through processEvent (keyed by txHash + logIndex), so this
// is safe to run alongside the worker and safe to call more than once.
import type { ethers } from 'ethers'
import { contract, provider } from '../contract/index.js'
import { eventHandlers, isListenedEvent, type ListenedEvent } from '../contract/event-handlers.js'
import { config } from '../lib/config.js'
import { HttpError } from '../utils/http.js'

export const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/

/** The mined receipt's EmpireX events, decoded, in log order. Throws HttpError for anything unusable. */
export async function loadContractTx(txHash: string): Promise<ethers.Event[]> {
  const receipt = await provider.getTransactionReceipt(txHash)
  if (!receipt) throw new HttpError(404, 'Transaction not found or not mined yet')
  if (receipt.status !== 1) throw new HttpError(422, 'Transaction reverted')
  if (receipt.to?.toLowerCase() !== config.CONTRACT_ADDRESS.toLowerCase()) {
    throw new HttpError(422, 'Transaction is not an EmpireX contract call')
  }
  // Logs from other contracts in the tx (the USDT transfers) are skipped.
  return receipt.logs
    .filter((log) => log.address.toLowerCase() === config.CONTRACT_ADDRESS.toLowerCase())
    .flatMap((log) => {
      try {
        const description = contract.interface.parseLog(log)
        return [{ ...log, event: description.name, args: description.args } as unknown as ethers.Event]
      } catch {
        return []
      }
    })
    .sort((a, b) => a.logIndex - b.logIndex)
}

export interface ApplyResult {
  /** 'deferred' when an event couldn't be applied yet (e.g. an earlier tx isn't indexed); the worker's sync will. */
  status: 'stored' | 'deferred'
  stored: number
  alreadyStored: number
  total: number
}

/** Applies every listened event, in log order. Stops at the first one that can't be applied yet. */
export async function applyContractEvents(events: ethers.Event[], label: string): Promise<ApplyResult> {
  const listened = events.filter((e) => isListenedEvent(e.event))
  let stored = 0
  let alreadyStored = 0
  for (const event of listened) {
    try {
      if (await eventHandlers[event.event as ListenedEvent](event)) stored++
      else alreadyStored++
    } catch (err) {
      console.warn(`⚠️  [${label}] ${event.event} in ${event.transactionHash} deferred to the worker:`, err instanceof Error ? err.message : err)
      return { status: 'deferred', stored, alreadyStored, total: listened.length }
    }
  }
  return { status: 'stored', stored, alreadyStored, total: listened.length }
}
