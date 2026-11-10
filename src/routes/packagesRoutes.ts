// src/routes/packagesRoutes.ts — mounted at /api/packages
import { Router } from 'express'
import { buyPackage, buyPackageFor, getMyPackages, getPackages } from '../controller/packagebuy.controller.js'
import { requireAuth, requireRegistered } from '../middleware/authMiddleware.js'

const router = Router()

// GET  /api/packages       — the 12 packages with prices (public)
router.get('/', getPackages)

// GET  /api/packages/mine  — the signed-in member's packages
router.get('/mine', requireAuth, requireRegistered, getMyPackages)

// POST /api/packages/buy   — record a purchase right after it's mined (fallback if the event was missed)
router.post('/buy', requireAuth, requireRegistered, buyPackage)

// POST /api/packages/buy-for — the same, when a member paid for another member's rank
router.post('/buy-for', requireAuth, requireRegistered, buyPackageFor)

export default router
