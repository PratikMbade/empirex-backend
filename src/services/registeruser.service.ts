// src/services/registeruser.service.ts
// RegisterEV(address indexed user, address indexed referral, uint256 indexed time, uint256 id)
import { lower, toDate } from '../lib/format.js'
import { at, processEvent, type EventMeta } from '../utils/processEvent.js'
import { requireUser } from '../utils/userMethod.js'
import { readGenPlacement, type GenPlacement } from './generationtree.service.js'

export const registerUserService = async (
  userAddress: string,
  referralAddress: string,
  contractRegId: number,
  timestamp: number,
  meta: EventMeta,
) => {
  const address = lower(userAddress)
  const sponsor = lower(referralAddress)

  // RPC read stays outside the DB transaction. If it fails the member is still
  // registered; the sync scheduler's reconcileGenerationTree fills it in later.
  let placement: GenPlacement | null = null
  try {
    placement = await readGenPlacement(address)
  } catch (err) {
    console.warn(`⚠️  B_Matrix_L12_Details read failed for ${address}, will reconcile later:`, (err as Error).message)
  }

  const applied = await processEvent(meta, async (tx) => {
    await requireUser(tx, sponsor) // referral must exist
    const data = {
      regId: contractRegId,
      sponsor,
      registeredAt: toDate(BigInt(timestamp)),
      regTxHash: at(meta).txHash,
      genParent: placement?.genParent ?? null,
      genSide: placement?.genSide ?? null,
      genPlacedAt: placement ? toDate(BigInt(timestamp)) : null,
    }
    await tx.member.upsert({ where: { address }, create: { address, ...data }, update: data })
  })

  if (applied) console.log(`✅ Registered: ${address} → #${contractRegId} (sponsor ${sponsor})`)
  return applied
}
