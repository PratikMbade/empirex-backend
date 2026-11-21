// export-package1-buyers.mjs — CSV of everyone who bought a package (package 1, the $2 one, by default),
// oldest purchase first. Read-only: it only runs SELECTs. Columns: serial_number, wallet_address, purchased_at_ist
// (when they bought that package, in IST).
//
// Run from the backend folder (it reads DATABASE_URL from .env):
//   node --env-file=.env scripts/export-package1-buyers.mjs
//     → package 1 buyers up to today 11:00 PM IST, saved to package1_buyers_<date>.csv
//   node --env-file=.env scripts/export-package1-buyers.mjs --package 2 --only
//     → members whose highest package is 2 (they bought 2 and nothing above it), saved to package2_only_<date>.csv
// Options:
//   --package N   which package (1–12). Default 1.
//   --only        keep only members who have no package above N at the cutoff.
//   --until "2026-11-22 23:00"   cutoff, read as IST. Default: today 11:00 PM IST.
//   --out my-file.csv            file name.
import { writeFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

const IST_OFFSET_MINUTES = 330 // UTC+5:30, no daylight saving

function arg(name) {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}

/** Today's date in IST as YYYY-MM-DD. */
function todayIst() {
  return new Date(Date.now() + IST_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10)
}

/** "YYYY-MM-DD HH:MM" read as IST → a Date. */
function parseIst(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(text.trim())
  if (!m) throw new Error(`--until must look like "2026-11-22 23:00" (IST), got "${text}"`)
  const [, y, mo, d, h, mi] = m.map(Number)
  return new Date(Date.UTC(y, mo - 1, d, h, mi) - IST_OFFSET_MINUTES * 60_000)
}

/** A Date shown in IST as "YYYY-MM-DD HH:MM:SS". */
function formatIst(date) {
  return new Date(date.getTime() + IST_OFFSET_MINUTES * 60_000).toISOString().slice(0, 19).replace('T', ' ')
}

const pkg = Number(arg('--package') ?? 1)
if (!Number.isInteger(pkg) || pkg < 1 || pkg > 12) throw new Error(`--package must be a number from 1 to 12, got "${arg('--package')}"`)
const only = process.argv.includes('--only')
const untilText = arg('--until') ?? `${todayIst()} 23:00`
const until = parseIst(untilText)
const out = arg('--out') ?? `package${pkg}_${only ? 'only' : 'buyers'}_${untilText.slice(0, 10)}.csv`
const who = only ? `Members whose highest package is ${pkg}` : `Package ${pkg} buyers`

const prisma = new PrismaClient()
try {
  let rows = await prisma.packagePurchase.findMany({
    where: { package: pkg, purchasedAt: { lte: until } },
    orderBy: [{ purchasedAt: 'asc' }, { blockNumber: 'asc' }, { logIndex: 'asc' }],
    select: { memberAddress: true, purchasedAt: true },
  })

  if (only) {
    // Drop anyone who had already bought a higher package by the cutoff.
    const higher = await prisma.packagePurchase.findMany({
      where: { package: { gt: pkg }, purchasedAt: { lte: until } },
      select: { memberAddress: true },
      distinct: ['memberAddress'],
    })
    const upgraded = new Set(higher.map((h) => h.memberAddress))
    rows = rows.filter((row) => !upgraded.has(row.memberAddress))
  }

  const lines = ['serial_number,wallet_address,purchased_at_ist']
  rows.forEach((row, i) => lines.push(`${i + 1},${row.memberAddress},${formatIst(row.purchasedAt)}`))
  writeFileSync(out, `${lines.join('\n')}\n`)

  console.log(`${who}, up to ${untilText} IST: ${rows.length}`)
  if (rows.length > 0) console.log(`First: ${formatIst(rows[0].purchasedAt)} IST   Last: ${formatIst(rows.at(-1).purchasedAt)} IST`)
  console.log(`Saved to ${out}`)
} catch (err) {
  // Prisma's own errors are very long; show just the reason.
  console.error(`Export failed: ${String(err?.message ?? err).trim().split('\n').filter(Boolean).at(-1)}`)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
