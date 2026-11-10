// prisma.ts — standalone client with no other side effects. Both index.ts (API)
// and worker.ts (blockchain) import it from here, never from each other.
import { PrismaClient } from '@prisma/client'
import { config } from './config.js'

export const prisma = new PrismaClient({
  datasources: { db: { url: config.DATABASE_URL } },
  log: ['warn', { level: 'error', emit: 'event' }],
})

// The live listener and the sync scheduler racing on the same log end in a
// unique-constraint violation that processEvent() already handles, so the
// engine-level log for it is noise.
prisma.$on('error', (e) => {
  if (/Unique constraint failed/i.test(e.message)) return
  console.error(e.message)
})
