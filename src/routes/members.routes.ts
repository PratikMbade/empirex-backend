// src/routes/members.routes.ts — mounted at /api/members
import { Router } from 'express'
import { getIncome, getLostIncome, getRecycles } from '../controller/income.controller.js'
import { getDirectTeam, getMemberSummary } from '../controller/member.controller.js'
import { getUserPackages } from '../controller/packagebuy.controller.js'
import { getTeam, getTeamOverview } from '../controller/team.controller.js'

const router = Router()

router.get('/:address', getMemberSummary)
router.get('/:address/packages', getUserPackages)
router.get('/:address/direct-team', getDirectTeam)
router.get('/:address/team', getTeam) // ?minLevel=&maxLevel=&page=&pageSize=
router.get('/:address/team-overview', getTeamOverview)
router.get('/:address/income/:stream', getIncome) // x3 | level | level-lapse
router.get('/:address/lost/:stream', getLostIncome) // x3 | level
router.get('/:address/recycles', getRecycles)

export default router
