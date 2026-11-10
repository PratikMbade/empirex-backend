// src/utils/userMethod.ts
import type { Tx } from './processEvent.js'

/** The member row, or null when the address isn't registered in the DB yet. */
export async function isUserExist(tx: Tx, userAddress: string) {
  return tx.member.findUnique({ where: { address: userAddress.toLowerCase() } })
}

/** The member row; throws when it isn't indexed yet so the event is retried by the sync scheduler. */
export async function requireUser(tx: Tx, userAddress: string) {
  const member = await isUserExist(tx, userAddress)
  if (!member) throw new Error(`User ${userAddress} not found in DB`)
  return member
}
