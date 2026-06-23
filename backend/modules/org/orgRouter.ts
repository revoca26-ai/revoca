import { Router } from "express"
import { createOrg } from "./orgController.js"
import requireClerkAuth from "../../middlewares/requireClerkAuth.js"

const router = Router()

router.post('/create', requireClerkAuth, createOrg)

export default router