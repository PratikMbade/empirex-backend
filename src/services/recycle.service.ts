// src/services/recycle.service.ts
// Recycle(address indexed recycleuser, address indexed recycleBy, uint256 time, uint256 chain, uint256 package)
//   recycleuser = matrix owner, recycleBy = buyer who filled the third slot, chain = owner's new cycle.
import { lower, toDate } from '../lib/format.js'
import { at, processEvent, type EventMeta } from '../utils/processEvent.js'
import { rebuildX3Matrix } from './x3Matrix.service.js'

export const recycleService = async (
  ownerAddress: string,
  triggeredByAddress: string,
  newCycle: number,
  packageNumber: number,
  timestamp: number,
  meta: EventMeta,
) => {
  const owner = lower(ownerAddress)
  const triggeredBy = lower(triggeredByAddress)
  const loc = at(meta)

  const applied = await processEvent(meta, async (tx) => {
    // The third-slot x3Distribution is emitted right before Recycle. The contract
    // keeps that payment instead of sending it to the owner, so it is not income.
    const thirdSlot = await tx.x3Payment.findUnique({
      where: { txHash_logIndex: { txHash: loc.txHash, logIndex: loc.logIndex - 1 } },
    })
    if (!thirdSlot || thirdSlot.receiver !== owner || thirdSlot.buyer !== triggeredBy || thirdSlot.package !== packageNumber) {
      throw new Error(`Recycle at ${loc.txHash}#${loc.logIndex} has no matching third-slot x3Distribution before it`)
    }

    await tx.recycle.create({
      data: { owner, triggeredBy, package: packageNumber, newCycle, recycledAt: toDate(BigInt(timestamp)), ...loc },
    })
    await tx.x3Payment.update({ where: { id: thirdSlot.id }, data: { recycled: true } })
    await rebuildX3Matrix(tx, owner, packageNumber)
  })

  if (applied) console.log(`♻️  Recycle: ${owner} PKG${packageNumber} → cycle ${newCycle} (by ${triggeredBy})`)
  return applied
}
