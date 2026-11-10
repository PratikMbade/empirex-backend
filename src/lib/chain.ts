// chain.ts — viem client, used by the API for SIWE signature checks and /health/deep.
// Contract reads and event listening use ethers, see src/contract/.
import { createPublicClient, defineChain, fallback, http, type Chain } from 'viem'
import { bsc, bscTestnet } from 'viem/chains'
import { config } from './config.js'

const KNOWN_CHAINS: Chain[] = [bsc, bscTestnet]

const chain =
  KNOWN_CHAINS.find((c) => c.id === config.CHAIN_ID) ??
  defineChain({
    id: config.CHAIN_ID,
    name: `chain-${config.CHAIN_ID}`,
    nativeCurrency: { name: 'Native', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [config.RPC_HTTP_URL] } },
  })

const rpc = (url: string) => http(url, { retryCount: config.RPC_HTTP_FALLBACK_URL ? 1 : 3, timeout: 20_000 })

export const publicClient = createPublicClient({
  chain,
  transport: config.RPC_HTTP_FALLBACK_URL ? fallback([rpc(config.RPC_HTTP_URL), rpc(config.RPC_HTTP_FALLBACK_URL)]) : rpc(config.RPC_HTTP_URL),
  // Batches concurrent reads into one call where the chain has Multicall3.
  batch: chain.contracts?.multicall3 ? { multicall: true } : undefined,
})
