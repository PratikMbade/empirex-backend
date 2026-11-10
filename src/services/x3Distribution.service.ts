// src/services/x3Distribution.service.ts
// x3Distribution(address indexed from, address indexed to, uint256 package, uint256 chain, uint256 time, uint256 amount)
//   from = buyer, to = matrix owner whose slot the buyer took (50% of the fee).
//   A third-slot fill is not paid out: the Recycle right after it marks this row recycled.
import { lower, toDate } from '../lib/format.js'
import { at, processEvent, type EventMeta } from '../utils/processEvent.js'
import { rebuildX3Matrix } from './x3Matrix.service.js'

export const x3DistributionService = async (
  fromUserAddress: string,
  toUserAddress: string,
  packageNumber: number,
  buyerChain: number,
  amount: string,
  timestamp: number,
  meta: EventMeta,
) => {
  const buyer = lower(fromUserAddress)
  const receiver = lower(toUserAddress)

  const applied = await processEvent(meta, async (tx) => {
    await tx.x3Payment.create({
      data: { receiver, buyer, package: packageNumber, amount, buyerChain, paidAt: toDate(BigInt(timestamp)), ...at(meta) },
    })
    await rebuildX3Matrix(tx, receiver, packageNumber)
  })

  if (applied) console.log(`✅ x3Distribution: ${buyer} → ${receiver} PKG${packageNumber} ${amount}`)
  return applied
}
