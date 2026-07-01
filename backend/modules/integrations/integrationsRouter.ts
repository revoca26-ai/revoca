import { Router } from 'express'
import { getIntegrations, connectIntegration, googleCallback, slackCallback, githubCallback, deleteIntegration } from './integrationsController.js'

// create instance of Router
const integrationsRouter = Router()

// ROUTES FOR INTEGRATIONS
integrationsRouter.get('/', getIntegrations) 
integrationsRouter.post('/:provider/connect', connectIntegration)
integrationsRouter.get('/google/callback', googleCallback)
integrationsRouter.get('/slack/callback', slackCallback)
integrationsRouter.get('/github/callback', githubCallback)
integrationsRouter.delete('/:provider', deleteIntegration)

// exporting the integrationsRouter
export { integrationsRouter }