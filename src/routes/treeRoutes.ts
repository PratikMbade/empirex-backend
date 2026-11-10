// src/routes/treeRoutes.ts — mounted at /api/tree
import { Router } from 'express'
import { getDirectTree } from '../controller/directTree.controller.js'
import { getGenerationTree } from '../controller/generationTree.controller.js'
import { getX3Tree } from '../controller/x3Tree.controller.js'

const router = Router()

router.get('/generation/:address', getGenerationTree) // ?depth=3
router.get('/direct/:address', getDirectTree) // ?page=1&pageSize=6
router.get('/x3/:address', getX3Tree) // ?package=1&cycle=

export default router
