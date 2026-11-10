// queries.ts — read models shared by the public and signed-in routes.
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { HttpError } from './http.js'

const sum = (value: Prisma.Decimal | null) => (value ?? new Prisma.Decimal(0)).toString()

export async function requireMember(address: string) {
  const member = await prisma.member.findUnique({ where: { address } })
  if (!member) throw new HttpError(404, `${address} is not a registered member`)
  return member
}

/** Referral downline size (every member whose sponsor chain reaches `address`). */
async function teamSize(address: string) {
  const [row] = await prisma.$queryRaw<{ count: bigint }[]>`
    WITH RECURSIVE team AS (
      SELECT address FROM "Member" WHERE sponsor = ${address} AND address <> sponsor
      UNION ALL
      SELECT m.address FROM "Member" m JOIN team t ON m.sponsor = t.address WHERE m.address <> m.sponsor
    )
    SELECT count(*)::bigint AS count FROM team`
  return Number(row?.count ?? 0)
}

export async function memberSummary(address: string) {
  const member = await requireMember(address)
  const tiers = await prisma.packageTier.findMany({ orderBy: { level: 'asc' } })
  const [directs, team, x3, level, levelLapse, x3Lost, levelLost, recycles] = await Promise.all([
    prisma.member.count({ where: { sponsor: address, NOT: { address } } }),
    teamSize(address),
    prisma.x3Payment.aggregate({ where: { receiver: address, recycled: false }, _sum: { amount: true } }),
    prisma.levelIncome.aggregate({ where: { receiver: address }, _sum: { amount: true } }),
    prisma.levelLapseIncome.aggregate({ where: { receiver: address }, _sum: { amount: true } }),
    prisma.x3Lost.aggregate({ where: { lostBy: address }, _sum: { amount: true } }),
    prisma.levelLost.aggregate({ where: { lostBy: address }, _sum: { amount: true } }),
    prisma.recycle.count({ where: { owner: address } }),
  ])
  const income = {
    x3: sum(x3._sum.amount),
    level: sum(level._sum.amount),
    levelLapse: sum(levelLapse._sum.amount),
  }
  const tier = tiers.find((t) => t.level === member.highestPackage)
  return {
    address: member.address,
    memberId: member.regId,
    sponsor: member.isRoot ? null : member.sponsor,
    isRoot: member.isRoot,
    registeredAt: member.registeredAt,
    package: tier ? { level: tier.level, name: tier.name, price: tier.price.toString() } : null,
    nextPackage: tiers.find((t) => t.level === member.highestPackage + 1) ?? null,
    qualifiedDirects: member.qualifiedDirects,
    directCount: directs,
    teamSize: team,
    recycles,
    income: {
      ...income,
      total: new Prisma.Decimal(income.x3).plus(income.level).plus(income.levelLapse).toString(),
    },
    lost: { x3: sum(x3Lost._sum.amount), level: sum(levelLost._sum.amount) },
  }
}

// ─── Trees, in the dashboard's TreeMember shape (src/dashboard/data/trees.ts) ─

interface TreeMember {
  address: string
  sponsor: string
  memberId: number
  package: { level: number; name: string; price: number } | null
  generation: number
  children: (TreeMember | null)[]
}

async function treeNodes(addresses: string[]) {
  const [members, tiers] = await Promise.all([
    prisma.member.findMany({ where: { address: { in: addresses } } }),
    prisma.packageTier.findMany(),
  ])
  const tierByLevel = new Map(tiers.map((t) => [t.level, t]))
  return new Map(
    members.map((m) => {
      const tier = tierByLevel.get(m.highestPackage)
      return [
        m.address,
        {
          address: m.address,
          sponsor: m.sponsor,
          memberId: m.regId,
          package: tier ? { level: tier.level, name: tier.name, price: Number(tier.price) } : null,
        },
      ] as const
    }),
  )
}

/** Binary generation tree (B_Matrix_L12_Details), `depth` generations below `root`. Children are [left, right]. */
export async function generationTree(root: string, depth: number): Promise<TreeMember> {
  await requireMember(root)
  const childrenOf = new Map<string, (string | null)[]>()
  let frontier = [root]
  const all = [root]
  for (let level = 0; level < depth && frontier.length; level++) {
    const rows = await prisma.member.findMany({
      where: { genParent: { in: frontier } },
      select: { address: true, genParent: true, genSide: true },
    })
    for (const parent of frontier) childrenOf.set(parent, [null, null])
    for (const row of rows) childrenOf.get(row.genParent!)![row.genSide === 'LEFT' ? 0 : 1] = row.address
    frontier = rows.map((r) => r.address)
    all.push(...frontier)
  }
  const nodes = await treeNodes(all)
  const build = (address: string, generation: number): TreeMember => ({
    ...nodes.get(address)!,
    generation,
    children: generation < depth ? (childrenOf.get(address) ?? [null, null]).map((c) => (c ? build(c, generation + 1) : null)) : [],
  })
  return build(root, 0)
}

/** One cycle of a member's x3 matrix for a package: the owner and its three slots. */
export async function x3Tree(owner: string, pkg: number, cycle?: number) {
  await requireMember(owner)
  const cycles = await prisma.x3Matrix.findMany({ where: { owner, package: pkg }, orderBy: { cycle: 'asc' } })
  const matrix = cycle === undefined ? cycles.at(-1) : cycles.find((c) => c.cycle === cycle)
  if (cycle !== undefined && !matrix) throw new HttpError(404, `no cycle ${cycle} for package ${pkg}`)
  const slots = [matrix?.slot1 ?? null, matrix?.slot2 ?? null, matrix?.slot3 ?? null]
  const nodes = await treeNodes([owner, ...slots.filter((s): s is string => s !== null)])
  return {
    package: pkg,
    cycle: matrix?.cycle ?? null,
    cycles: cycles.map((c) => c.cycle),
    tree: {
      ...nodes.get(owner)!,
      generation: 0,
      children: slots.map((s) => (s ? { ...nodes.get(s)!, generation: 1, children: [] } : null)),
    } satisfies TreeMember,
  }
}
