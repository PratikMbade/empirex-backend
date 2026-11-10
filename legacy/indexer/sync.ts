// sync.ts — reads contract logs block range by block range and applies them in chain order.
import { contract, publicClient } from '../lib/chain.js'
import { config } from '../lib/config.js'
import { lower } from '../lib/format.js'
import { prisma } from '../lib/prisma.js'
import { applyLog, prefetch, type AnyLog } from './handlers.js'

const STATE_ID = 'empirex'

export async function getLastIndexedBlock() {
  const state = await prisma.indexerState.findUnique({ where: { id: STATE_ID } })
  return state?.lastBlock ?? config.CONTRACT_DEPLOY_BLOCK - 1n
}

/** getLogs with range splitting: RPC providers reject wide or heavy ranges with assorted errors. */
async function getLogs(fromBlock: bigint, toBlock: bigint, depth = 0): Promise<AnyLog[]> {
  try {
    const logs = await publicClient.getContractEvents({ ...contract, fromBlock, toBlock, strict: true })
    return logs as AnyLog[]
  } catch (err) {
    if (fromBlock >= toBlock || depth >= 10) throw err
    const mid = (fromBlock + toBlock) / 2n
    console.warn(`[sync] getLogs ${fromBlock}-${toBlock} failed (${(err as Error).message.split('\n')[0]}); splitting`)
    return [...(await getLogs(fromBlock, mid, depth + 1)), ...(await getLogs(mid + 1n, toBlock, depth + 1))]
  }
}

const blockTimes = new Map<bigint, Date>()
async function blockTime(blockNumber: bigint) {
  let time = blockTimes.get(blockNumber)
  if (!time) {
    const block = await publicClient.getBlock({ blockNumber })
    time = new Date(Number(block.timestamp) * 1000)
    if (blockTimes.size > 5_000) blockTimes.clear()
    blockTimes.set(blockNumber, time)
  }
  return time
}

const jsonArgs = (args: unknown) =>
  JSON.parse(JSON.stringify(args, (_, value) => (typeof value === 'bigint' ? value.toString() : value)))

async function processLog(log: AnyLog) {
  const txHash = lower(log.transactionHash)
  const done = await prisma.contractLog.findUnique({ where: { txHash_logIndex: { txHash, logIndex: log.logIndex } } })
  if (done) return false

  const args = log.args as Record<string, unknown>
  const [pre, time] = await Promise.all([
    prefetch(log),
    typeof args.time === 'bigint' ? new Date(Number(args.time) * 1000) : blockTime(log.blockNumber),
  ])

  await prisma.$transaction(async (tx) => {
    await applyLog(tx, log, pre)
    await tx.contractLog.create({
      data: { blockNumber: log.blockNumber, blockTime: time, txHash, logIndex: log.logIndex, eventName: log.eventName, args: jsonArgs(log.args) },
    })
  })
  return true
}

/** Indexes everything up to head - CONFIRMATIONS. Returns the number of new logs stored. */
export async function syncToHead() {
  const head = await publicClient.getBlockNumber()
  const target = head - BigInt(config.CONFIRMATIONS)
  let from = (await getLastIndexedBlock()) + 1n
  let stored = 0

  while (from <= target) {
    const to = from + BigInt(config.LOG_BATCH_BLOCKS) - 1n < target ? from + BigInt(config.LOG_BATCH_BLOCKS) - 1n : target
    const logs = await getLogs(from, to)
    logs.sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1))

    for (const log of logs) {
      try {
        if (await processLog(log)) stored++
      } catch (err) {
        // Stop here without moving the checkpoint, so nothing after this log is skipped.
        throw new Error(`log ${log.eventName} ${log.transactionHash}#${log.logIndex} (block ${log.blockNumber}): ${(err as Error).message}`)
      }
    }

    await prisma.indexerState.upsert({
      where: { id: STATE_ID },
      create: { id: STATE_ID, lastBlock: to },
      update: { lastBlock: to },
    })
    if (logs.length) console.log(`[sync] blocks ${from}-${to}: ${logs.length} logs`)
    from = to + 1n
  }
  return stored
}
