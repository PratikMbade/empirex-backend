// src/utils/processEvent.ts
//
// Shared by every event service. The live WebSocket listener and the sync
// scheduler both call the same services, sometimes for the same log at the
// same moment, and WebSocket reconnects can redeliver logs. So each log is
// applied exactly once:
//   - if a ContractLog row exists for (txHash, logIndex), it's a no-op
//   - otherwise the service's writes and the ContractLog row are stored in ONE
//     DB transaction; if a concurrent call wins the race, ours fails with
//     P2002 and rolls back completely.
import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'

export type Tx = Prisma.TransactionClient

/** Where a log sits on chain, plus its decoded args for the audit table. */
export interface EventMeta {
  eventName: string
  txHash: string
  logIndex: number
  blockNumber: number
  /** Event `time` arg (seconds). */
  timestamp: number
  args: Record<string, unknown>
}

/** Location fields stored on every row derived from a log. */
export const at = (meta: EventMeta) => ({
  blockNumber: BigInt(meta.blockNumber),
  txHash: meta.txHash.toLowerCase(),
  logIndex: meta.logIndex,
})

const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === 'P2002'

const jsonArgs = (args: unknown) =>
  JSON.parse(
    JSON.stringify(args, (_, v) => {
      if (typeof v === 'bigint') return v.toString()
      // ethers v5 BigNumber serializes as { type: 'BigNumber', hex }
      if (v && typeof v === 'object' && v.type === 'BigNumber' && typeof v.hex === 'string') return BigInt(v.hex).toString()
      return v
    }),
  )

/** Returns true when the log was applied now, false when it was already stored. */
export async function processEvent(meta: EventMeta, apply: (tx: Tx) => Promise<void>): Promise<boolean> {
  const txHash = meta.txHash.toLowerCase()
  const done = await prisma.contractLog.findUnique({ where: { txHash_logIndex: { txHash, logIndex: meta.logIndex } } })
  if (done) {
    console.log(`ℹ️  ${meta.eventName} already recorded: ${txHash}#${meta.logIndex}`)
    return false
  }

  try {
    await prisma.$transaction(async (tx) => {
      await apply(tx)
      await tx.contractLog.create({
        data: {
          blockNumber: BigInt(meta.blockNumber),
          blockTime: new Date(meta.timestamp * 1000),
          txHash,
          logIndex: meta.logIndex,
          eventName: meta.eventName,
          args: jsonArgs(meta.args),
        },
      })
    })
    return true
  } catch (err) {
    if (isUniqueViolation(err)) {
      console.log(`ℹ️  ${meta.eventName} already recorded (concurrent write): ${txHash}#${meta.logIndex}`)
      return false
    }
    throw err
  }
}
