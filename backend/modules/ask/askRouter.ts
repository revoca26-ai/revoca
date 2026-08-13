import { Router } from 'express'
import requireAuth from '../../middlewares/auth.js'
import { validateCreateAsk } from './askValidation.js'
import { createAsk } from './askController.js'

const askRouter = Router()

// order matters: auth → Zod → controller
askRouter.post('/', requireAuth, validateCreateAsk, createAsk)


export default askRouter