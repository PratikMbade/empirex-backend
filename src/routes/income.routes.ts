// src/routes/income.routes.ts — mounted at /api/income
import { Router } from 'express'
import {
  getLevelLapseRewards,
  getLevelMissed,
  getLevelRewards,
  getX3Missed,
  getX3Rewards,
} from '../controller/rewards.controller.js'
import { requireAuth, requireRegistered } from '../middleware/authMiddleware.js'

const router = Router()
router.use(requireAuth, requireRegistered)

router.get('/x3', getX3Rewards)
router.get('/level', getLevelRewards)
router.get('/level-lapse', getLevelLapseRewards)
router.get('/lost', getX3Missed)
router.get('/level-lost', getLevelMissed)

export default router
