import { Router } from 'express'
import { publicClient } from '../../lib/chain.js'
import { config } from '../../lib/config.js'
import { prisma } from '../../lib/prisma.js'

export const healthRouter = Router()

healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok', uptime: Math.floor(process.uptime()) })
})

/** Database, RPC and how far the indexer trails the chain. Returns 503 when something is down. */
healthRouter.get('/deep', async (_req, res) => {
  const [db, head, state] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    publicClient.getBlockNumber(),
    prisma.indexerState.findFirst(),
  ])
  const chainHead = head.status === 'fulfilled' ? head.value : null
  const indexed = state.status === 'fulfilled' ? (state.value?.lastBlock ?? null) : null
  const lag = chainHead !== null && indexed !== null ? Number(chainHead - indexed) : null
  const ok = db.status === 'fulfilled' && chainHead !== null && lag !== null
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'error',
    database: db.status === 'fulfilled' ? 'ok' : 'error',
    rpc: chainHead !== null ? 'ok' : 'error',
    chainHead: chainHead?.toString() ?? null,
    indexedBlock: indexed?.toString() ?? null,
    blocksBehind: lag,
    confirmations: config.CONFIRMATIONS,
  })
})
