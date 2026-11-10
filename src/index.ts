// src/index.ts — API server only, no blockchain side effects (those live in worker.ts).
// Stateless, so it can run as several processes beside one worker.
import { toNodeHandler } from 'better-auth/node'
import compression from 'compression'
import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { auth } from './lib/auth.js'
import { config } from './lib/config.js'
import { prisma } from './lib/prisma.js'
import healthRoutes from './routes/health.routes.js'
import incomeRoutes from './routes/income.routes.js'
import memberRoutes from './routes/members.routes.js'
import packageRoutes from './routes/packagesRoutes.js'
import registrationRoutes from './routes/registration.routes.js'
import treeRoutes from './routes/treeRoutes.js'
import userRoutes from './routes/user.routes.js'
import { HttpError } from './utils/http.js'

const app = express()
app.set('trust proxy', 1)

// ─── security & compression ───────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }))
app.use(compression())

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, callback) => callback(null, !origin || config.CORS_ORIGINS.includes(origin)),
    credentials: true,
  }),
)

app.use('/health', healthRoutes)

// ─── better-auth BEFORE express.json (it reads the raw body itself) ───────────
app.use('/api/auth', rateLimit({ windowMs: 15 * 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }))
app.all('/api/auth/*splat', toNodeHandler(auth))

// ─── body parsing + rate limiting ─────────────────────────────────────────────
app.use(express.json({ limit: '100kb' }))
app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }))

// ─── routes ───────────────────────────────────────────────────────────────────
app.use('/api', userRoutes)
app.use('/api/register', registrationRoutes)
app.use('/api/packages', packageRoutes)
app.use('/api/income', incomeRoutes)
app.use('/api/members', memberRoutes)
app.use('/api/tree', treeRoutes)

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'not found' })
})

// ─── global error handler ─────────────────────────────────────────────────────
const onError: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message })
    return
  }
  console.error('[api]', err)
  res.status(500).json({ error: 'internal server error' })
}
app.use(onError)

// ─── start ────────────────────────────────────────────────────────────────────
const server = app.listen(config.PORT, () => console.log(`🚀 [API] PID ${process.pid} listening on :${config.PORT}`))

// ─── graceful shutdown ────────────────────────────────────────────────────────
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(async () => {
      await prisma.$disconnect()
      process.exit(0)
    })
    setTimeout(() => process.exit(1), 5_000).unref()
  })
}

export default app
