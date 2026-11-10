// auth.ts — Sign-In with Ethereum sessions via better-auth.
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { siwe } from 'better-auth/plugins'
import { generateSiweNonce } from 'viem/siwe'
import { publicClient } from './chain.js'
import { config } from './config.js'
import { prisma } from './prisma.js'

if (!config.BETTER_AUTH_SECRET) {
  console.error('BETTER_AUTH_SECRET is required for the API (at least 32 characters)')
  process.exit(1)
}

const isProd = config.NODE_ENV === 'production'

export const auth = betterAuth({
  baseURL: config.BETTER_AUTH_URL,
  secret: config.BETTER_AUTH_SECRET,
  trustedOrigins: config.CORS_ORIGINS,
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  advanced: {
    cookiePrefix: 'empirex',
    ...(config.COOKIE_DOMAIN ? { crossSubDomainCookies: { enabled: true, domain: config.COOKIE_DOMAIN } } : {}),
    defaultCookieAttributes: { secure: isProd, httpOnly: true, sameSite: isProd ? 'none' : 'lax', path: '/' },
  },
  plugins: [
    siwe({
      domain: config.SIWE_DOMAIN,
      anonymous: true,
      getNonce: async () => generateSiweNonce(),
      // viem checks EOA signatures and, through the RPC, smart-contract wallets (EIP-1271).
      verifyMessage: async ({ message, signature, address }) => {
        try {
          return await publicClient.verifySiweMessage({
            message,
            signature: signature as `0x${string}`,
            address: address as `0x${string}`,
            domain: config.SIWE_DOMAIN,
          })
        } catch {
          return false
        }
      },
    }),
  ],
})

/** The signed-in wallet for a request, or null. */
export async function sessionWallet(headers: Record<string, string | string[] | undefined>) {
  const session = await auth.api.getSession({ headers: new Headers(headers as Record<string, string>) })
  if (!session) return null
  const wallet = await prisma.walletAddress.findFirst({
    where: { userId: session.user.id },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  })
  return wallet ? wallet.address.toLowerCase() : null
}
