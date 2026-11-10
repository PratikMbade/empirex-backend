# EmpireX backend

Listens to the EmpireX contract (`../contract/empirex.sol`, contract `xEcosystem`), stores every event in Postgres through Prisma, and serves the dashboard over an HTTP API with Sign-In with Ethereum.

## Processes

| Process | Command | Runs |
|---|---|---|
| Worker (`src/worker.ts`) | `npm run dev:worker` | Exactly one instance |
| API (`src/index.ts`) | `npm run dev:api` | As many as you like |

## Layout

Same structure as the FutureRide backend.

| Folder | What's in it |
|---|---|
| `src/contract/` | `empirex-abi.json`, the ethers contract (`index.ts`), one WebSocket listener per event (`event-listener.ts`), and the shared arg parsing (`event-handlers.ts`) |
| `src/services/` | One service per event, the catch-up `syncService.ts`, and `bootstrap.service.ts` for state with no event |
| `src/utils/` | `reconnectSilent` (WebSocket reconnect), `txEventQueue` (orders the events of one tx), `processEvent` (exactly-once writes) |
| `src/controller/`, `src/routes/`, `src/middleware/` | The HTTP API |

**How the worker works.** Each event has its own listener (`reconnectSilent` + `contract.on`). The events of one transaction are buffered by `txEventQueue` and run in order: `RegisterEV` first, then `PackageBuyEV`, then the rest in `logIndex` order. The sync scheduler runs every `POLL_INTERVAL_MS`. It reads all logs from the `IndexerState` checkpoint up to `head - CONFIRMATIONS` and runs them through the same services, in block and log order. That catches anything the sockets missed. If a log fails, sync stops at it and doesn't move the checkpoint, so it is retried on the next tick rather than skipped.

Every service writes its rows and the log's `ContractLog` row in one DB transaction, and `(txHash, logIndex)` is unique. The live path and the sync can therefore both see the same log, and a replay never duplicates anything. `X3Matrix` is rebuilt from the stored payments and recycles in chain order, so a live event that arrives ahead of a missed older one can't leave a slot in the wrong place.

**Events with a listener:** `RegisterEV`, `PackageBuyEV`, `x3Distribution`, `Recycle`, `LapsPayEV`, `LevelIncomeEV`, `LevellapseIncomeEV`, `LevelLostIncomeEV`. `DirectPayEV`, `GenerationPayEV` and `PackageBuy` are in the ABI, but the contract never emits them (those `emit` lines are commented out), so they have no listener.

The previous viem indexer and API are kept in `legacy/` for reference. They aren't built or run.

## Setup

```bash
cp .env.example .env    # then fill it in
npm install
npm run db:deploy       # create the tables (npm run db:migrate while developing)
npm run dev:worker
npm run dev:api
```

Production: `npm run build`, then `pm2 start ecosystem.config.cjs`.

If the contract changes, run `npm run abi` to regenerate `src/contract/empirex-abi.json`, or paste the new ABI there. Note that the contract only compiles with `viaIR` (stack too deep otherwise).

## What is stored

| Event | Table | Notes |
|---|---|---|
| `RegisterEV` | `Member` | Binary tree position is read from `B_Matrix_L12_Details`, since no event announces it. The root comes from `First_User_Address()`, since `SetFirstUser` emits nothing. |
| `PackageBuyEV` | `PackagePurchase` | Prices come from `Rank_PackageDetails(1..12)`, re-read on every worker start. |
| `x3Distribution` | `X3Payment`, `X3Matrix` | Third-slot fills are **not paid**: the contract keeps them and recycles the owner. Those rows have `recycled = true` and are excluded from income. |
| `Recycle` | `Recycle`, `X3Matrix` | Opens the owner's next cycle. |
| `LapsPayEV` | `X3Routing`, `X3Lost` | See the note below. |
| `LevelIncomeEV` | `LevelIncome` | |
| `LevellapseIncomeEV` | `LevelLapseIncome` | |
| `LevelLostIncomeEV` | `LevelLost` | One row per skipped address. |
| everything | `ContractLog` | Raw decoded args, kept for audit and replays. |

**`LapsPayEV.lapAdd` is the source for `X3Lost`.** It lists exactly the members the contract charged `x3Lost` to. `lvlpay` is the number of sponsor steps walked, not the number of members who lost, so it must not be used to build that list.

## API

All amounts are token units as decimal strings, and all addresses are lowercase.

| Route | Returns |
|---|---|
| `GET /health`, `GET /health/deep` | Liveness; database, RPC and sync lag |
| `GET /api/packages` | The 12 packages with on-chain prices |
| `GET /api/income/x3`, `/level`, `/level-lapse`, `/lost`, `/level-lost` | Signed in + registered, `?page=&limit=&search=&package=&level=`: the Rewards tab's tables as `{ total, totalPages, records }` |
| `GET /api/packages/mine` | Signed in + registered: `{ highestPackage, purchases[] }` |
| `POST /api/packages/buy` | Signed in + registered, `{ packageNumber, transactionHash }`: stores a just-mined `BuyRankUser` purchase (and the rest of that tx's events) without waiting for the worker. Rejected unless the tx holds your `PackageBuyEV` for that package |
| `GET /api/me` | The signed-in wallet's summary, or `{ registered: false }` |
| `GET /api/register/info` | Signed in: `{ isRegistered, userAddress, memberId, sponsor }` (used by /login, /register and the dashboard gate) |
| `GET /api/register/validate/:referral` | Sponsor lookup by EmpireX ID (`EMXB2D6342D`: `EMX` + the wallet's last 8 characters) or address. 409 when two members share the ID |
| `GET /api/register/default-sponsor` | The root member, for sign-ups without a referral |
| `POST /api/register/fallback` | Signed in, `{ transactionHash }`: stores a just-mined registration from its receipt without waiting for the worker |
| `GET /api/members/:address` | Summary: package, directs, team size, income and lost totals, recycles |
| `GET /api/members/:address/packages` | Purchases |
| `GET /api/members/:address/direct-team` | Paginated direct referrals |
| `GET /api/members/:address/team?minLevel=&maxLevel=&search=&depth=&sort=` | Whole referral downline, paginated, with depth, direct count and total rewards. `depth=1` = directs only; `sort=level` (default, lowest package first) or `newest` |
| `GET /api/members/:address/team-overview` | Team size and member count per package level |
| `GET /api/members/:address/income/:stream` | `x3`, `level` or `level-lapse`, paginated |
| `GET /api/members/:address/lost/:stream` | `x3` or `level`, paginated |
| `GET /api/members/:address/recycles` | Paginated |
| `GET /api/tree/generation/:address?depth=3` | Binary generation tree, `children: [left, right]` |
| `GET /api/tree/direct/:address?page=1&pageSize=6` | One page of direct referrals as a tree (member + directs as children), with `total`/`totalPages` |
| `GET /api/tree/x3/:address?package=1&cycle=` | One x3 matrix cycle (the first, recycle 0, by default): owner plus 3 slots |
| `/api/auth/*` | better-auth. SIWE: `POST /api/auth/siwe/nonce` with `{}`, then `POST /api/auth/siwe/verify` with `{ message, signature }` |

Paginated routes take `?page=1&pageSize=20` (max 100). Both tree routes return the dashboard's `TreeMember` shape (`src/dashboard/data/trees.ts`).
