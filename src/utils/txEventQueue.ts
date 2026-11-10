// src/utils/txEventQueue.ts
//
// One EmpireX transaction emits several events: a registration emits
// RegisterEV + PackageBuyEV + LapsPayEV + x3Distribution (+ Recycle) +
// LevelIncomeEV / LevellapseIncomeEV / LevelLostIncomeEV. Each arrives over
// the WebSocket as an independent contract.on(...) callback, in no
// guaranteed order, so PackageBuyEV's handler could run before RegisterEV
// has created the member.
//
// Every event is buffered per txHash and the buffer is flushed in a fixed
// order once no new event has arrived for FLUSH_DELAY_MS:
//   1. RegisterEV    — creates the member everything else refers to
//   2. PackageBuyEV
//   3. everything else, in on-chain logIndex order. x3Distribution and
//      Recycle MUST stay in logIndex order: Recycle marks the third-slot
//      x3Distribution emitted right before it.

type QueuedHandler = () => Promise<void>

interface QueuedEvent {
  priority: number
  logIndex: number
  label: string
  handler: QueuedHandler
}

const PRIORITY: Record<string, number> = {
  RegisterEV: 1,
  PackageBuyEV: 2,
  x3Distribution: 3,
  Recycle: 3,
  LapsPayEV: 3,
  LevelIncomeEV: 3,
  LevellapseIncomeEV: 3,
  LevelLostIncomeEV: 3,
}

const pendingByTx = new Map<string, QueuedEvent[]>()
const flushTimers = new Map<string, NodeJS.Timeout>()

// Alchemy pushes the events of one tx within a few hundred ms of each other.
const FLUSH_DELAY_MS = 1500

async function flush(txHash: string): Promise<void> {
  const events = pendingByTx.get(txHash)
  pendingByTx.delete(txHash)
  flushTimers.delete(txHash)
  if (!events || events.length === 0) return

  events.sort((a, b) => a.priority - b.priority || a.logIndex - b.logIndex)

  for (const evt of events) {
    try {
      await evt.handler()
    } catch (err) {
      // The sync scheduler re-applies anything that failed here (the event has
      // no ContractLog row yet), so one failure doesn't block the rest of the tx.
      console.error(`[txEventQueue] ${evt.label} handler failed for tx ${txHash}:`, (err as Error).message)
    }
  }
}

/**
 * Queue an event handler to run in order alongside the other events of the
 * same transaction. Call this from each contract.on(...) callback instead of
 * running the handler immediately.
 */
export function queueTxEvent(txHash: string, label: string, logIndex: number, handler: QueuedHandler): void {
  const priority = PRIORITY[label] ?? 99

  const existing = pendingByTx.get(txHash) ?? []
  // The same log can be pushed twice after a WebSocket reconnect.
  if (existing.some((e) => e.logIndex === logIndex)) return
  existing.push({ priority, logIndex, label, handler })
  pendingByTx.set(txHash, existing)

  // Restart the timer on every new event, so the flush runs FLUSH_DELAY_MS
  // after the LAST event of this tx arrives.
  const existingTimer = flushTimers.get(txHash)
  if (existingTimer) clearTimeout(existingTimer)

  const timer = setTimeout(() => {
    flush(txHash).catch((err) => console.error(`[txEventQueue] flush failed for tx ${txHash}:`, err.message))
  }, FLUSH_DELAY_MS)

  flushTimers.set(txHash, timer)
}
