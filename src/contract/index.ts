// src/contract/index.ts — read-only EmpireX contract over HTTP (for view calls and log queries).
import { ethers } from 'ethers'
import { config } from '../lib/config.js'
import { FailoverProvider } from './failover-provider.js'
import contractAbi from './empirex-abi.json' with { type: 'json' }

export { contractAbi }

export const provider = config.RPC_HTTP_FALLBACK_URL
  ? new FailoverProvider(config.RPC_HTTP_URL, config.RPC_HTTP_FALLBACK_URL, config.CHAIN_ID)
  : new ethers.providers.StaticJsonRpcProvider(config.RPC_HTTP_URL, config.CHAIN_ID)

export const contract = new ethers.Contract(config.CONTRACT_ADDRESS, contractAbi, provider)

export const ZERO_ADDRESS = ethers.constants.AddressZero
