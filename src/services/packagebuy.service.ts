// src/services/packagebuy.service.ts
// PackageBuyEV(address indexed user, uint256 indexed package, uint256 time, uint256 currentId)
import { lower, toDate } from '../lib/format.js'
import { at, processEvent, type EventMeta } from '../utils/processEvent.js'
import { requireUser } from '../utils/userMethod.js'

export const packageBuyService = async (
  userAddress: string,
  packageNumber: number,
  packageContractBuyId: number,
  timestamp: number,
  meta: EventMeta,
) => {
  const address = lower(userAddress)

  const applied = await processEvent(meta, async (tx) => {
    const member = await requireUser(tx, address)
    const tier = await tx.packageTier.findUnique({ where: { level: packageNumber } })
    if (!tier) throw new Error(`Invalid package number: ${packageNumber} (PackageTier not bootstrapped)`)

    await tx.packagePurchase.create({
      data: {
        memberAddress: address,
        package: packageNumber,
        packageBuyId: packageContractBuyId,
        price: tier.price,
        purchasedAt: toDate(BigInt(timestamp)),
        ...at(meta),
      },
    })
    if (packageNumber > member.highestPackage) {
      await tx.member.update({ where: { address }, data: { highestPackage: packageNumber } })
    }
    // Mirrors register[referrer]._eTeamCount += 1 when a direct reaches package 4.
    if (packageNumber === 4 && !member.isRoot) {
      await tx.member.update({ where: { address: member.sponsor }, data: { qualifiedDirects: { increment: 1 } } })
    }
  })

  if (applied) console.log(`✅ Package ${packageNumber} recorded for ${address}`)
  return applied
}
