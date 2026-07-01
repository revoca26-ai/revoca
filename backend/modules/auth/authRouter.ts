import { Router } from 'express'
import { raw } from 'express'
import { handleWebhook } from './authController.js'

const authRouter = Router()

authRouter.post('/webhook', raw({ type: 'application/json' }), handleWebhook)

export default authRouter