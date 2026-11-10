// src/utils/reconnectSilent.ts
//
// Opens a WebSocket provider for one contract and reopens it whenever the
// socket closes or errors. `onReady` runs on every (re)connect, so each
// listener re-attaches its contract.on(...) handler after a drop.
import { ethers } from 'ethers'

export type ListenerInitFn = (provider: ethers.providers.WebSocketProvider, contract: ethers.Contract) => void

export function reconnectSilent({
  wssUrl,
  contractAddress,
  abi,
  label,
  onReady,
  reconnectDelay = 5000,
}: {
  wssUrl: string
  contractAddress: string
  abi: ethers.ContractInterface
  label: string
  onReady: ListenerInitFn
  reconnectDelay?: number
}) {
  let provider: ethers.providers.WebSocketProvider
  let reconnecting = false

  const connect = () => {
    reconnecting = false
    provider = new ethers.providers.WebSocketProvider(wssUrl)
    const contract = new ethers.Contract(contractAddress, abi, provider)

    provider._websocket.on('open', () => {
      console.log(`✅ ${label} WebSocket OPENED`)
      onReady(provider, contract)
    })

    provider._websocket.on('close', (code: number) => {
      console.warn(`❌ ${label} WebSocket CLOSED (code: ${code}). Reconnecting in ${reconnectDelay}ms...`)
      reconnect()
    })

    provider._websocket.on('error', (err: Error) => {
      console.error(`⚠️ ${label} WebSocket ERROR:`, err.message)
      reconnect()
    })
  }

  // 'error' is usually followed by 'close'; only schedule one reconnect for both.
  const reconnect = () => {
    if (reconnecting) return
    reconnecting = true
    try {
      provider.removeAllListeners()
      provider._websocket?.terminate?.()
    } catch (err) {
      console.warn(`⚠️ ${label} Terminate error:`, (err as Error).message)
    }

    setTimeout(() => {
      console.log(`🔁 Reconnecting ${label} WebSocket...`)
      connect()
    }, reconnectDelay)
  }

  connect()
}
