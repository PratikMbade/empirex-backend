// failover-provider.ts — an ethers HTTP provider that moves to a backup RPC when the primary is unavailable.
import { ethers } from 'ethers'

const REQUEST_TIMEOUT_MS = 15_000
/** How long to stay on the backup after a failure, so every call doesn't wait on a dead RPC first. */
const COOL_DOWN_MS = 30_000

function primaryUnavailable(err: unknown) {
  // ethers wraps the node's JSON-RPC error, so its code is on the inner error.
  const { error, status } = err as { error?: { code?: unknown }; status?: unknown }
  const rpcCode = error?.code
  // A numeric code is the node's own answer (a revert, a log range too wide): the backup would say the same.
  if (typeof rpcCode === 'number') return rpcCode === 429 || rpcCode === -32005
  if (typeof status === 'number') return status === 401 || status === 403 || status === 429 || status >= 500
  return true // Connection failure or timeout.
}

export class FailoverProvider extends ethers.providers.StaticJsonRpcProvider {
  private readonly backup: ethers.providers.StaticJsonRpcProvider
  private primaryDownUntil = 0

  constructor(primaryUrl: string, backupUrl: string, chainId: number) {
    // throttleLimit 1: on a 429, go to the backup now instead of ethers' retries with backoff.
    super({ url: primaryUrl, timeout: REQUEST_TIMEOUT_MS, throttleLimit: 1 }, chainId)
    this.backup = new ethers.providers.StaticJsonRpcProvider({ url: backupUrl, timeout: REQUEST_TIMEOUT_MS }, chainId)
  }

  override async send(method: string, params: unknown[]): Promise<unknown> {
    if (Date.now() < this.primaryDownUntil) return this.backup.send(method, params)
    try {
      return await super.send(method, params)
    } catch (err) {
      if (!primaryUnavailable(err)) throw err
      this.primaryDownUntil = Date.now() + COOL_DOWN_MS
      // Only the method: ethers errors include the URL, which contains the API key.
      console.warn(`⚠️  [RPC] Primary failed on ${method}; using the backup for ${COOL_DOWN_MS / 1000}s`)
      return this.backup.send(method, params)
    }
  }
}
