import { Router } from 'express'
import { getIntegrations, connectIntegration, googleCallback, slackCallback, githubCallback, deleteIntegration } from './integrationsController.js'
import requireAuth from '../../middlewares/auth.js'

// create instance of Router
const integrationsRouter = Router()

// ROUTES FOR INTEGRATIONS
integrationsRouter.get('/', requireAuth, getIntegrations) 
integrationsRouter.post('/:provider/connect', requireAuth, connectIntegration)
// no auth required for callbacks
integrationsRouter.get('/google/callback', googleCallback)
integrationsRouter.get('/slack/callback', slackCallback)
integrationsRouter.get('/github/callback', githubCallback)
// auth needed for deleting an integration
integrationsRouter.delete('/:provider', requireAuth, deleteIntegration)

// exporting the integrationsRouter
export default integrationsRouter 