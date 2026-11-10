import { formatUnits } from 'viem'
import { config } from './config.js'

export const lower = (address: string) => address.toLowerCase()

const EMPIREX_SUFFIX_LENGTH = 8
/** EMX + the wallet's last 8 characters. Case-insensitive on input; only hex can match, so it's safe to use in a query. */
export const EMPIREX_ID_RE = new RegExp(`^EMX[0-9a-f]{${EMPIREX_SUFFIX_LENGTH}}$`, 'i')

/** Not guaranteed unique: two wallets can share their last 8 characters. Look members up with memberByEmpirexId. */
export const empirexId = (address: string) => `EMX${address.slice(-EMPIREX_SUFFIX_LENGTH).toUpperCase()}`

/** Lowercase address ending for a value that already passed EMPIREX_ID_RE. */
export const empirexSuffix = (id: string) => id.slice(-EMPIREX_SUFFIX_LENGTH).toLowerCase()

/** Token amount in wei → exact decimal string in token units. */
export const toToken = (wei: bigint) => formatUnits(wei, config.TOKEN_DECIMALS)

export const toDate = (seconds: bigint) => new Date(Number(seconds) * 1000)
