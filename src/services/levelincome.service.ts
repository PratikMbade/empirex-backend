// src/services/levelincome.service.ts
// LevelIncomeEV(address indexed from, address indexed to, uint256 indexed amount, uint256 lvl, uint256 time, uint256 package)
//   The upline `lvl` generations above the buyer was eligible and got the level cut.
import { lower, toDate } from '../lib/format.js'
import { at, processEvent, type EventMeta } from '../utils/processEvent.js'

export const levelIncomeService = async (
  fromUserAddress: string,
  toUserAddress: string,
  amount: string,
  level: number,
  packageNumber: number,
  timestamp: number,
  meta: EventMeta,
) => {
  const applied = await processEvent(meta, async (tx) => {
    await tx.levelIncome.create({
      data: {
        receiver: lower(toUserAddress),
        buyer: lower(fromUserAddress),
        package: packageNumber,
        generation: level,
        amount,
        paidAt: toDate(BigInt(timestamp)),
        ...at(meta),
      },
    })
  })

  if (applied) console.log(`✅ LevelIncomeEV: ${fromUserAddress} → ${toUserAddress} LVL${level} PKG${packageNumber} ${amount}`)
  return applied
}
