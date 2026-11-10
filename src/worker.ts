// src/worker.ts — blockchain worker: live event listeners + catch-up sync scheduler.
//
// Must run as exactly ONE process (PM2 fork mode). Two workers would open two
// sets of WebSocket listeners; writes are idempotent, but it doubles RPC load.
import {
  lapsIncomeEventListener,
  levelIncomeEventListener,
  levelLapseIncomeEventListener,
  levelLostIncomeEventListener,
  packageBuyEventListener,
  recycleEventListener,
  registrationEventListener,
  x3DistributionEventListener,
} from './contract/event-listener.js'
import { config } from './lib/config.js'
import { prisma } from './lib/prisma.js'
import { syncPackageTiers, syncRootMember } from './services/bootstrap.service.js'
import { startSyncScheduler } from './services/syncService.js'

async function main() {
  console.log(`🔗 [Worker] Blockchain worker starting — contract ${config.CONTRACT_ADDRESS} on chain ${config.CHAIN_ID}`)

  await prisma.$connect()
  console.log('✅ [Worker] Prisma connected')

  // state with no event: package prices and the root member
  await syncPackageTiers()
  while (!(await syncRootMember())) await new Promise((r) => setTimeout(r, config.POLL_INTERVAL_MS))

  // start all event listeners
  if (config.RPC_WS_URL) {
    registrationEventListener()
    packageBuyEventListener()
    x3DistributionEventListener()
    recycleEventListener()
    lapsIncomeEventListener()
    levelIncomeEventListener()
    levelLapseIncomeEventListener()
    levelLostIncomeEventListener()
  } else {
    console.warn('⚠️  [Worker] RPC_WS_URL not set — no live listeners, sync scheduler only')
  }

  // catch-up sync — every POLL_INTERVAL_MS
  startSyncScheduler(config.POLL_INTERVAL_MS)

  console.log('✅ [Worker] All listeners + sync scheduler running')
}

main().catch((err) => {
  console.error('❌ [Worker] Fatal startup error:', err)
  process.exit(1)
})

// graceful shutdown
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
}
