import { Router } from 'express'

// create instance of Router
const webhooksRouter = Router()

// ROUTES FOR WEBHOOKS
webhooksRouter.post('/slack', slackWebhook)

// exporting the webhooksRouter
export default webhooksRouter