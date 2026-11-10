// src/services/bootstrap.service.ts — state the contract never announces with an event, read on worker start.
import { contract, ZERO_ADDRESS } from '../contract/index.js'
import { lower, toDate, toToken } from '../lib/format.js'
import { defaultPackagePrice, PACKAGE_COUNT, packageName } from '../lib/packages.js'
import { prisma } from '../lib/prisma.js'

/**
 * Package prices from Rank_PackageDetails(1..12). Re-read on every start in case the
 * owner called SetRankData. Until SetRankData is called the contract returns 0, so the
 * planned prices from lib/packages.ts are stored instead.
 */
export async function syncPackageTiers() {
  const onChain: bigint[] = await Promise.all(
    Array.from({ length: PACKAGE_COUNT }, async (_, i) => BigInt((await contract.Rank_PackageDetails(i + 1)).toString())),
  )
  const unset = onChain.every((wei) => wei === 0n)
  const prices = onChain.map((wei, i) => (unset ? String(defaultPackagePrice(i + 1)) : toToken(wei)))
  await prisma.$transaction(
    prices.map((price, i) =>
      prisma.packageTier.upsert({
        where: { level: i + 1 },
        create: { level: i + 1, name: packageName(i + 1), price },
        update: { name: packageName(i + 1), price },
      }),
    ),
  )
  if (unset) {
    console.warn(`⚠️  [Bootstrap] Rank_PackageDetails is 0 on the contract (SetRankData not called); using planned prices: ${prices.join(', ')}`)
  } else {
    console.log(`✅ [Bootstrap] package prices: ${prices.join(', ')}`)
  }
}

/**
 * SetFirstUser creates the root member without a RegisterEV, so it is read
 * from the contract. Every other member's sponsor chain ends here.
 */
export async function syncRootMember() {
  const root: string = await contract.First_User_Address()
  if (root === ZERO_ADDRESS) {
    console.warn('⚠️  [Bootstrap] First_User_Address is not set on the contract yet; members cannot be indexed until it is')
    return false
  }
  const reg = await contract.register(root)
  const regId = Number(reg._regId)
  const address = lower(root)
  await prisma.member.upsert({
    where: { address },
    // initialset(12, root) gives the root every package.
    create: { address, regId, sponsor: address, isRoot: true, registeredAt: toDate(BigInt(reg._time.toString())), highestPackage: PACKAGE_COUNT },
    update: { isRoot: true },
  })
  console.log(`✅ [Bootstrap] root member ${address} (#${regId})`)
  return true
}
