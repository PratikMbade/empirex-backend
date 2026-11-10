// Package names and prices, matching PACKAGES in the frontend's src/content.ts.
// The contract's Rank_PackageDetails(1..12) is the source of truth for prices; these
// are used only while the owner hasn't called SetRankData yet (Rank_PackageDetails = 0).
export const PACKAGES = [
  { name: 'Soldier', price: 2 },
  { name: 'Warrior', price: 4 },
  { name: 'Star', price: 8 },
  { name: 'Legend', price: 16 },
  { name: 'Champion', price: 32 },
  { name: 'Master', price: 64 },
  { name: 'Lord', price: 128 },
  { name: 'Prince', price: 256 },
  { name: 'Crown', price: 512 },
  { name: 'Royal', price: 1024 },
  { name: 'King', price: 2048 },
  { name: 'Emperor', price: 4096 },
] as const

export const PACKAGE_NAMES = PACKAGES.map((p) => p.name)

export const PACKAGE_COUNT = PACKAGES.length

export const packageName = (level: number) => PACKAGES[level - 1]?.name ?? `Package ${level}`

/** Planned price in whole tokens (USDT) for a level. */
export const defaultPackagePrice = (level: number) => PACKAGES[level - 1]?.price ?? 0
