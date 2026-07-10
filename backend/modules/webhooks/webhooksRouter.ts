import { Router } from 'express'
import { slackWebhook } from './webhooksController.js'
// create instance of Router
const webhooksRouter = Router()

// ROUTES FOR WEBHOOKS
webhooksRouter.post('/slack', slackWebhook)

// exporting the webhooksRouter
export default webhooksRouter