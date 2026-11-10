// bootstrap.ts — state the contract never announces with an event, read directly on start.
import { contract, publicClient, ZERO_ADDRESS } from '../lib/chain.js'
import { lower, toDate, toToken } from '../lib/format.js'
import { PACKAGE_COUNT, packageName } from '../lib/packages.js'
import { prisma } from '../lib/prisma.js'

/** Package prices from Rank_PackageDetails(1..12). Re-read on every start in case the owner called SetRankData. */
export async function syncPackageTiers() {
  const prices = await Promise.all(
    Array.from({ length: PACKAGE_COUNT }, (_, i) =>
      publicClient.readContract({ ...contract, functionName: 'Rank_PackageDetails', args: [BigInt(i + 1)] }),
    ),
  )
  await prisma.$transaction(
    prices.map((wei, i) =>
      prisma.packageTier.upsert({
        where: { level: i + 1 },
        create: { level: i + 1, name: packageName(i + 1), price: toToken(wei) },
        update: { name: packageName(i + 1), price: toToken(wei) },
      }),
    ),
  )
  console.log(`[bootstrap] package prices: ${prices.map(toToken).join(', ')}`)
}

/**
 * SetFirstUser creates the root member without a RegisterEV, so it is read
 * from the contract. Every other member's sponsor chain ends here.
 */
export async function syncRootMember() {
  const root = await publicClient.readContract({ ...contract, functionName: 'First_User_Address' })
  if (root === ZERO_ADDRESS) {
    console.warn('[bootstrap] First_User_Address is not set on the contract yet; members cannot be indexed until it is')
    return false
  }
  const [, time, regId] = await publicClient.readContract({ ...contract, functionName: 'register', args: [root] })
  const address = lower(root)
  await prisma.member.upsert({
    where: { address },
    // initialset(12, root) gives the root every package.
    create: { address, regId: Number(regId), sponsor: address, isRoot: true, registeredAt: toDate(time), highestPackage: PACKAGE_COUNT },
    update: { isRoot: true },
  })
  console.log(`[bootstrap] root member ${address} (#${regId})`)
  return true
}
