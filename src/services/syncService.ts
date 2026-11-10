// src/services/syncService.ts
//
// Catch-up poller next to the live listeners (contract/event-listener.ts).
// Reads every contract log from the last checkpoint up to head - CONFIRMATIONS
// and applies it through the same handlers as the live path. Anything a
// listener missed (socket down, worker restarting) or failed on ends up here.
//
// Unlike FutureRide's per-event-type phases, a batch is applied in strict
// (block, logIndex) order: the x3 matrix and Recycle depend on chain order.
// A log that fails stops the batch WITHOUT moving the checkpoint, so it is
// retried next tick instead of being skipped forever.
import type { ethers } from 'ethers'
import { contract, provider } from '../contract/index.js'
import { eventHandlers, isListenedEvent } from '../contract/event-handlers.js'
import { config } from '../lib/config.js'
import { prisma } from '../lib/prisma.js'
import { generationTreeService } from './generationtree.service.js'

const STATE_ID = 'empirex'
const BATCH_SIZE = config.LOG_BATCH_BLOCKS
// Stay behind the head so this poller trails the live listener instead of
// racing it on fresh blocks, and short reorgs never reach the DB from here.
const CONFIRMATION_LAG = config.CONFIRMATIONS

// ─── safe queryFilter — splits the range when the RPC rejects it ──────────────
async function safeQueryFilter(fromBlock: number, toBlock: number, depth = 0): Promise<ethers.Event[]> {
  try {
    return await contract.queryFilter('*', fromBlock, toBlock)
  } catch (err) {
    if (fromBlock < toBlock && depth < 10) {
      const mid = Math.floor((fromBlock + toBlock) / 2)
      console.warn(`⚠️  [Sync] Range rejected (${fromBlock}-${toBlock}, depth ${depth}) — splitting at ${mid}`)
      const firstHalf = await safeQueryFilter(fromBlock, mid, depth + 1)
      const secondHalf = await safeQueryFilter(mid + 1, toBlock, depth + 1)
      return [...firstHalf, ...secondHalf]
    }
    throw err
  }
}

// ─── checkpoint helpers (IndexerState) ────────────────────────────────────────
async function getLastSyncedBlock(): Promise<number> {
  const state = await prisma.indexerState.findUnique({ where: { id: STATE_ID } })
  if (state) return Number(state.lastBlock)
  const deployBlock = Number(config.CONTRACT_DEPLOY_BLOCK)
  console.log(`ℹ️  No sync checkpoint — starting from block ${deployBlock}`)
  return deployBlock - 1
}

async function saveLastSyncedBlock(block: number): Promise<void> {
  await prisma.indexerState.upsert({
    where: { id: STATE_ID },
    create: { id: STATE_ID, lastBlock: BigInt(block) },
    update: { lastBlock: BigInt(block) },
  })
}

// ─── one batch, in chain order ────────────────────────────────────────────────
async function processBatch(fromBlock: number, toBlock: number): Promise<number> {
  const events = (await safeQueryFilter(fromBlock, toBlock))
    .filter((e) => isListenedEvent(e.event))
    .sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex)
  if (events.length === 0) return 0

  console.log(`⏳ [Sync] Batch ${fromBlock}–${toBlock}: ${events.length} events`)
  let stored = 0
  for (const e of events) {
    try {
      if (await eventHandlers[e.event as keyof typeof eventHandlers](e)) stored++
    } catch (err) {
      throw new Error(`${e.event} ${e.transactionHash}#${e.logIndex} (block ${e.blockNumber}): ${(err as Error).message}`)
    }
  }
  return stored
}

// ─── reconcile members registered without a generation-tree position ──────────
// registerUserService still stores the member when its B_Matrix_L12_Details read
// fails; sweep for those and self-heal on every tick.
async function reconcileGenerationTree(): Promise<void> {
  const missing = await prisma.member.findMany({
    where: { isRoot: false, genParent: null },
    select: { address: true },
  })
  if (missing.length === 0) return

  let healed = 0
  for (const m of missing) {
    try {
      await generationTreeService(m.address)
      healed++
    } catch (err) {
      console.warn(`⚠️  [Sync] GenerationTree reconcile failed ${m.address}:`, (err as Error).message)
    }
  }
  console.log(`   GenerationTree reconcile: ${healed}/${missing.length} healed`)
}

// ─── main sync runner ─────────────────────────────────────────────────────────
let isSyncing = false

export async function runSync(): Promise<void> {
  if (isSyncing) {
    console.log('⏭️  [Sync] Already running — skipping tick')
    return
  }
  isSyncing = true

  try {
    const [lastSynced, chainHead] = await Promise.all([getLastSyncedBlock(), provider.getBlockNumber()])
    const currentBlock = chainHead - CONFIRMATION_LAG

    if (lastSynced >= currentBlock) {
      console.log(`✅ [Sync] Up to date at block ${lastSynced} (head ${chainHead})`)
    } else {
      const gap = currentBlock - lastSynced
      if (gap > BATCH_SIZE) console.log(`🔄 [Sync] ${gap} blocks behind → ${Math.ceil(gap / BATCH_SIZE)} batch(es)`)

      let from = lastSynced + 1
      let stored = 0
      while (from <= currentBlock) {
        const to = Math.min(from + BATCH_SIZE - 1, currentBlock)
        stored += await processBatch(from, to)
        await saveLastSyncedBlock(to)
        from = to + 1
        // eases rate-limit pressure on the RPC during long catch-ups
        if (from <= currentBlock) await new Promise((r) => setTimeout(r, 250))
      }
      console.log(`✅ [Sync] Complete — DB at block ${currentBlock}${stored ? `, ${stored} new events stored` : ''}`)
    }

    await reconcileGenerationTree()
  } catch (err) {
    console.error('❌ [Sync] runSync error (retrying next tick):', (err as Error).message)
  } finally {
    isSyncing = false
  }
}

// ─── scheduler ────────────────────────────────────────────────────────────────
export function startSyncScheduler(intervalMs = config.POLL_INTERVAL_MS): void {
  console.log(`🕐 [Sync] Scheduler started — every ${intervalMs / 1000}s`)
  runSync().catch((err) => console.error('❌ [Sync] startup error:', err.message))
  setInterval(() => {
    runSync().catch((err) => console.error('❌ [Sync] interval error:', err.message))
  }, intervalMs)
}
