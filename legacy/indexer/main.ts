// main.ts — the indexer process. Run exactly one instance.
//
// All writes go through syncToHead(), which reads logs in block order. The
// WebSocket subscription only decides when to run it, so live events and
// catch-up after downtime share one code path and can't race each other.
import { contract, wsClient } from '../lib/chain.js'
import { config } from '../lib/config.js'
import { prisma } from '../lib/prisma.js'
import { syncPackageTiers, syncRootMember } from './bootstrap.js'
import { syncToHead } from './sync.js'

let running = false
let rerun = false
/** Highest block with a contract log seen over the WebSocket and not yet indexed. */
let pendingBlock: bigint | null = null

async function run(reason: string) {
  if (running) {
    rerun = true
    return
  }
  running = true
  try {
    do {
      rerun = false
      const stored = await syncToHead()
      if (stored) console.log(`[indexer] ${stored} new logs (${reason})`)
    } while (rerun)
    pendingBlock = null
  } catch (err) {
    console.error(`[indexer] sync failed, retrying on the next tick: ${(err as Error).message}`)
  } finally {
    running = false
  }
}

function listen() {
  if (!wsClient) {
    console.log(`[indexer] no RPC_WS_URL; polling every ${config.POLL_INTERVAL_MS / 1000}s`)
    return
  }
  wsClient.watchContractEvent({
    ...contract,
    onLogs: (logs) => {
      for (const log of logs) {
        console.log(`[live] ${log.eventName} block ${log.blockNumber}`)
        if (log.blockNumber !== null && (pendingBlock === null || log.blockNumber > pendingBlock)) pendingBlock = log.blockNumber
      }
    },
    onError: (err) => console.warn(`[live] contract subscription error: ${err.message}`),
  })
  // Index a live event as soon as it has CONFIRMATIONS blocks on top of it.
  wsClient.watchBlockNumber({
    onBlockNumber: (head) => {
      if (pendingBlock !== null && head - BigInt(config.CONFIRMATIONS) >= pendingBlock) void run('live event')
    },
    onError: (err) => console.warn(`[live] block subscription error: ${err.message}`),
  })
  console.log('[indexer] listening for contract events over WebSocket')
}

async function main() {
  await prisma.$connect()
  console.log(`[indexer] contract ${config.CONTRACT_ADDRESS} on chain ${config.CHAIN_ID}, ${config.CONFIRMATIONS} confirmations`)
  await syncPackageTiers()
  while (!(await syncRootMember())) await new Promise((r) => setTimeout(r, config.POLL_INTERVAL_MS))

  listen()
  await run('startup')
  // Fallback for anything the WebSocket missed, and the only trigger without one.
  setInterval(() => void run('poll'), config.POLL_INTERVAL_MS)
}

main().catch((err) => {
  console.error('[indexer] fatal:', err)
  process.exit(1)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
}
