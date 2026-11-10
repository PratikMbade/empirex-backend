// src/services/generationtree.service.ts
//
// The binary generation tree has no placement event, so a member's position is
// read from B_Matrix_L12_Details. Placement is written once and never changes, so the
// latest state is correct even while catching up on old blocks.
import { contract } from '../contract/index.js'
import { lower } from '../lib/format.js'
import { prisma } from '../lib/prisma.js'

export interface GenPlacement {
  genParent: string
  genSide: 'LEFT' | 'RIGHT'
}

/** The member's parent and side in the generation tree, or null for the root. RPC only, no DB. */
export async function readGenPlacement(userAddress: string): Promise<GenPlacement | null> {
  const genStr = await contract.B_Matrix_L12_Details(userAddress)
  const upline = genStr.upline as string
  if (lower(upline) === lower(userAddress)) return null

  const uplineGenStr = await contract.B_Matrix_L12_Details(upline)
  const left = lower(uplineGenStr.left as string)
  const right = lower(uplineGenStr.right as string)
  const user = lower(userAddress)
  const side = left === user ? 'LEFT' : right === user ? 'RIGHT' : null
  if (!side) throw new Error(`${userAddress} is neither left nor right child of ${upline}`)
  return { genParent: lower(upline), genSide: side }
}

/** Fills in genParent/genSide for a member registered without them (an RPC read failed at the time). */
export const generationTreeService = async (userAddress: string) => {
  const address = lower(userAddress)
  const member = await prisma.member.findUnique({ where: { address } })
  if (!member) throw new Error(`User ${userAddress} not found in DB`)
  if (member.genParent || member.isRoot) return

  const placement = await readGenPlacement(address)
  if (!placement) return
  await prisma.member.update({
    where: { address },
    data: { ...placement, genPlacedAt: member.registeredAt },
  })
  console.log(`✅ Generation tree: ${address} → ${placement.genSide} of ${placement.genParent}`)
}
