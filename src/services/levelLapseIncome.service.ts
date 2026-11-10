// src/services/levelLapseIncome.service.ts
// LevellapseIncomeEV(address indexed from, address indexed to, uint256 indexed amount, uint256 lvl, uint256 time, uint256 package)
//   A level cut skipped ineligible uplines and was paid further up (or to the
//   owner). `lvl` here is how far above the buyer the receiver sits.
import { lower, toDate } from '../lib/format.js'
import { at, processEvent, type EventMeta } from '../utils/processEvent.js'

export const levelLapseIncomeService = async (
  fromUserAddress: string,
  toUserAddress: string,
  amount: string,
  depth: number,
  packageNumber: number,
  timestamp: number,
  meta: EventMeta,
) => {
  const applied = await processEvent(meta, async (tx) => {
    await tx.levelLapseIncome.create({
      data: {
        receiver: lower(toUserAddress),
        buyer: lower(fromUserAddress),
        package: packageNumber,
        depth,
        amount,
        paidAt: toDate(BigInt(timestamp)),
        ...at(meta),
      },
    })
  })

  if (applied) console.log(`✅ LevellapseIncomeEV: ${fromUserAddress} → ${toUserAddress} depth ${depth} PKG${packageNumber} ${amount}`)
  return applied
}
