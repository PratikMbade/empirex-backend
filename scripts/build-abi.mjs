// Compiles ../contract/empirex.sol and writes its ABI to src/contract/empirex-abi.json.
// Run after the contract changes: npm run abi
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import solc from 'solc'

const source = readFileSync(fileURLToPath(new URL('../../contract/empirex.sol', import.meta.url)), 'utf8')
const output = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: 'Solidity',
      sources: { 'empirex.sol': { content: source } },
      settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi'] } } },
    }),
  ),
)
const errors = (output.errors ?? []).filter((e) => e.severity === 'error')
if (errors.length) {
  console.error(errors.map((e) => e.formattedMessage).join('\n'))
  process.exit(1)
}
const abi = output.contracts['empirex.sol'].xEcosystem.abi
writeFileSync(fileURLToPath(new URL('../src/contract/empirex-abi.json', import.meta.url)), JSON.stringify(abi, null, 2) + '\n')
console.log(`ABI written: ${abi.filter((x) => x.type === 'event').map((x) => x.name).join(', ')}`)
