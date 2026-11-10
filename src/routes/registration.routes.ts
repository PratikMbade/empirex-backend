// src/routes/registration.routes.ts — mounted at /api/register
import { Router } from 'express'
import {
  getDefaultSponsor,
  getRegisterInfo,
  registrationFallback,
  validateReferral,
} from '../controller/registration.controller.js'
import { requireAuth } from '../middleware/authMiddleware.js'

const router = Router()

router.get('/info', requireAuth, getRegisterInfo)
router.get('/validate/:referral', validateReferral)
router.get('/default-sponsor', getDefaultSponsor)
router.post('/fallback', requireAuth, registrationFallback)

export default router
