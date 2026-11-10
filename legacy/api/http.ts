import type { Request } from 'express'
import { z } from 'zod'

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export function addressParam(req: Request, name = 'address') {
  const value = String(req.params[name] ?? '').toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(value)) throw new HttpError(400, `${name} must be a wallet address`)
  return value
}

const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export function pagination(req: Request) {
  const parsed = pageQuery.safeParse(req.query)
  if (!parsed.success) throw new HttpError(400, 'page must be ≥ 1 and pageSize between 1 and 100')
  const { page, pageSize } = parsed.data
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize }
}

export const paged = <T>(rows: T[], total: number, page: number, pageSize: number) => ({
  page,
  pageSize,
  total,
  totalPages: Math.max(1, Math.ceil(total / pageSize)),
  rows,
})

/** Makes Prisma rows JSON-safe: BigInt → string. Decimal already serializes as a string. */
export const json = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v)))
