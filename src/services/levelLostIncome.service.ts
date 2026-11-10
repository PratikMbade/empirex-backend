// src/services/levelLostIncome.service.ts
// LevelLostIncomeEV(address indexed from, address[] to, uint256 amount, uint256 lvl, uint256 time, uint256 package)
//   Emitted next to LevellapseIncomeEV. `to[]` is every upline passed over at
//   this level; each one lost the cut, so one LevelLost row per address.
import { lower, toDate } from '../lib/format.js'
import { at, processEvent, type EventMeta } from '../utils/processEvent.js'

export const levelLostIncomeService = async (
  fromUserAddress: string,
  lostAddresses: string[],
  amount: string,
  level: number,
  packageNumber: number,
  timestamp: number,
  meta: EventMeta,
) => {
  const applied = await processEvent(meta, async (tx) => {
    if (!lostAddresses.length) return
    const shared = {
      buyer: lower(fromUserAddress),
      package: packageNumber,
      generation: level,
      amount,
      lostAt: toDate(BigInt(timestamp)),
      ...at(meta),
    }
    await tx.levelLost.createMany({
      data: lostAddresses.map((address, position) => ({ lostBy: lower(address), position, ...shared })),
    })
  })

  if (applied && lostAddresses.length) {
    console.log(`📉 LevelLostIncomeEV: [${lostAddresses.join(', ')}] lost LVL${level} PKG${packageNumber} ${amount}`)
  }
  return applied
}
