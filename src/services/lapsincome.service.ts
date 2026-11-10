// src/services/lapsincome.service.ts
// LapsPayEV(address indexed from, address indexed to, uint256 indexed amount, uint256 package, uint256 time, uint256 lvlpay, address[] lapAdd)
//   Emitted for every x3 placement. from = buyer, to = who got the x3 slot.
//   When `to` is not the buyer's sponsor, the slot lapsed: every member passed
//   over on the way up lost it (X3Lost, one row per member).
//
// lapAdd is the exact list of members the contract charged x3Lost to, so it's stored as is.
// lvlpay (depth) is how many sponsor steps the contract walked, not how many members lost.
import { lower, toDate } from '../lib/format.js'
import { at, processEvent, type EventMeta, type Tx } from '../utils/processEvent.js'
import { requireUser } from '../utils/userMethod.js'

export const lapsIncomeService = async (
  fromUserAddress: string,
  toUserAddress: string,
  amount: string,
  packageNumber: number,
  depth: number,
  timestamp: number,
  lapsedAddresses: string[],
  meta: EventMeta,
) => {
  const buyer = lower(fromUserAddress)
  const receiver = lower(toUserAddress)
  const eventList = lapsedAddresses.map(lower)
  const time = toDate(BigInt(timestamp))
  let lostCount = 0

  const applied = await processEvent(meta, async (tx) => {
    const buyerMember = await requireUser(tx, buyer)
    const lapsed = receiver !== buyerMember.sponsor

    await tx.x3Routing.create({
      data: { receiver, buyer, package: packageNumber, amount, depth, lapsed, routedAt: time, ...at(meta) },
    })
    if (!lapsed) return

    const lostBy = eventList
    lostCount = lostBy.length

    if (lostBy.length) {
      await tx.x3Lost.createMany({
        data: lostBy.map((address, position) => ({
          lostBy: address,
          buyer,
          receiver,
          package: packageNumber,
          amount,
          position,
          lostAt: time,
          ...at(meta),
        })),
      })
    }
  })

  if (applied) {
    console.log(
      lostCount
        ? `📉 LapsPayEV: ${lostCount} member(s) lapsed → ${receiver} PKG${packageNumber} depth ${depth} ${amount}`
        : `✅ LapsPayEV: ${buyer} → sponsor ${receiver} PKG${packageNumber}`,
    )
  }
  return applied
}
