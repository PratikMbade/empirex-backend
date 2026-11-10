// src/services/x3Matrix.service.ts
//
// Rebuilds the X3Matrix mirror (x3MatrixDetails[owner][package][cycle]) for one
// owner/package from the stored X3Payment and Recycle rows, sorted in chain
// order. Rebuilding instead of filling slots incrementally keeps the matrix
// correct even when a live event is stored before an older one that the
// WebSocket missed and the sync scheduler picks up later.
import type { Tx } from '../utils/processEvent.js'

type Step =
  | { kind: 'pay'; blockNumber: bigint; logIndex: number; buyer: string }
  | { kind: 'recycle'; blockNumber: bigint; logIndex: number; newCycle: number }

export async function rebuildX3Matrix(tx: Tx, owner: string, pkg: number) {
  const [payments, recycles] = await Promise.all([
    // DirectTeamS3 never seats a member in their own matrix (root recycling into itself).
    tx.x3Payment.findMany({ where: { receiver: owner, package: pkg, NOT: { buyer: owner } } }),
    tx.recycle.findMany({ where: { owner, package: pkg } }),
  ])
  const steps: Step[] = [
    ...payments.map((p) => ({ kind: 'pay' as const, blockNumber: p.blockNumber, logIndex: p.logIndex, buyer: p.buyer })),
    ...recycles.map((r) => ({ kind: 'recycle' as const, blockNumber: r.blockNumber, logIndex: r.logIndex, newCycle: r.newCycle })),
  ].sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1))

  const cycles = new Map<number, (string | null)[]>()
  let cycle = 1
  for (const step of steps) {
    if (step.kind === 'recycle') {
      cycle = step.newCycle
      if (!cycles.has(cycle)) cycles.set(cycle, [])
      continue
    }
    const slots = cycles.get(cycle) ?? []
    if (slots.length >= 3) {
      // A newer payment stored before the Recycle that precedes it on chain (the
      // live listener got ahead of the sync). Don't throw: that would also block
      // the missing Recycle's own third-slot payment. The next rebuild, once the
      // Recycle is stored, places this buyer in the right cycle.
      console.warn(`⚠️  [x3] ${owner} P${pkg} cycle ${cycle} full and not recycled yet; ${step.buyer} placed after its Recycle arrives`)
      continue
    }
    slots.push(step.buyer)
    cycles.set(cycle, slots)
  }

  for (const [c, slots] of cycles) {
    const data = { slot1: slots[0] ?? null, slot2: slots[1] ?? null, slot3: slots[2] ?? null }
    await tx.x3Matrix.upsert({
      where: { owner_package_cycle: { owner, package: pkg, cycle: c } },
      create: { owner, package: pkg, cycle: c, ...data },
      update: data,
    })
  }
}
