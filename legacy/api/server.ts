// server.ts — the HTTP API. Stateless, so it can run as several processes beside one indexer.
import { toNodeHandler } from 'better-auth/node'
import compression from 'compression'
import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { auth } from '../lib/auth.js'
import { config } from '../lib/config.js'
import { prisma } from '../lib/prisma.js'
import { HttpError } from './http.js'
import { healthRouter } from './routes/health.js'
import { meRouter } from './routes/me.js'
import { membersRouter } from './routes/members.js'

const app = express()
app.set('trust proxy', 1)
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }))
app.use(compression())
app.use(
  cors({
    origin: (origin, callback) => callback(null, !origin || config.CORS_ORIGINS.includes(origin)),
    credentials: true,
  }),
)

app.use('/health', healthRouter)

// better-auth reads the raw body itself, so it is mounted before express.json().
app.use('/api/auth', rateLimit({ windowMs: 15 * 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }))
app.all('/api/auth/*splat', toNodeHandler(auth))

app.use(express.json({ limit: '100kb' }))
app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }))
app.use('/api', meRouter)
app.use('/api', membersRouter)

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'not found' })
})

const onError: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message })
    return
  }
  console.error('[api]', err)
  res.status(500).json({ error: 'internal server error' })
}
app.use(onError)

const server = app.listen(config.PORT, () => console.log(`[api] listening on :${config.PORT}`))

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(async () => {
      await prisma.$disconnect()
      process.exit(0)
    })
    setTimeout(() => process.exit(1), 5_000).unref()
  })
}
