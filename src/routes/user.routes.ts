// src/routes/user.routes.ts — mounted at /api
import { Router } from 'express'
import { getMe } from '../controller/userInfo.controller.js'
import { requireAuth } from '../middleware/authMiddleware.js'

const router = Router()

// GET /api/me
router.get('/me', requireAuth, getMe)

export default router
