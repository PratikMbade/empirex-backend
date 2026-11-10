// config.ts — every environment variable, validated once at startup.
import 'dotenv/config'
import { z } from 'zod'

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'must be a 0x-prefixed 20-byte address')
const list = z
  .string()
  .default('')
  .transform((value) => value.split(',').map((item) => item.trim()).filter(Boolean))

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),

  // Chain
  CHAIN_ID: z.coerce.number().int().default(56),
  RPC_HTTP_URL: z.string().url(),
  /** Optional HTTPS backup used when RPC_HTTP_URL is unavailable. */
  RPC_HTTP_FALLBACK_URL: z.string().url().optional(),
  /** Optional. Without it the indexer only polls. */
  RPC_WS_URL: z.string().url().optional(),
  CONTRACT_ADDRESS: address,
  CONTRACT_DEPLOY_BLOCK: z.coerce.bigint(),
  TOKEN_DECIMALS: z.coerce.number().int().default(18),

  // Indexer
  /** Blocks to stay behind the head, so short reorgs never reach the database. */
  CONFIRMATIONS: z.coerce.number().int().min(0).default(3),
  LOG_BATCH_BLOCKS: z.coerce.number().int().min(1).default(500),
  POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(30_000),

  // API
  PORT: z.coerce.number().int().default(4000),
  CORS_ORIGINS: list,
  BETTER_AUTH_URL: z.string().url().default('http://localhost:4000'),
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  /** Host the SIWE message is signed for, e.g. empirex.io */
  SIWE_DOMAIN: z.string().default('localhost:5173'),
  /** Set in production to share the session cookie across subdomains, e.g. .empirex.io */
  COOKIE_DOMAIN: z.string().optional(),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid environment:\n' + parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n'))
  process.exit(1)
}

export const config = {
  ...parsed.data,
  CONTRACT_ADDRESS: parsed.data.CONTRACT_ADDRESS.toLowerCase() as `0x${string}`,
}
