import { Request, Response, NextFunction } from 'express'
import { activateIntegration, disconnectIntegration, findAllIntegrationsByOrg  } from './integrationsRepository.js'
import { createIntegration } from './integrationsService.js'
import { consumeOauthState } from '../../utils/oauthState.js'
import { exchangeGoogleCode } from './connectors/google.js'
import { encryptOAuthToken } from '../../utils/encryption.js'
import { exchangeSlackCode } from './connectors/slack.js'
import { exchangeGitHubCode } from './connectors/github.js'
import { GOOGLE_REQUIRED_SCOPES } from './connectors/google.js'
import { GITHUB_REQUIRED_SCOPES } from './connectors/github.js'
import { SLACK_REQUIRED_SCOPES } from './connectors/slack.js'
import config from '../../config/config.js'

export async function getIntegrations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        // get the org id from the request
        const orgId = req.org_id!

        // get the integrations from the database
        const integrations = await findAllIntegrationsByOrg(orgId)

        // return the integrations
        res.status(200).json({ data: integrations })

    } catch (err) {
        // pass error to the error middleware
        next(err)
    }
}

export async function connectIntegration(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        // get the org_id from the request
        const orgId = req.org_id!
        // get the user_id from the request
        const userId = req.clerkUserId!
        // get the provider from the request
        const provider = req.params.provider as string
        // get the redirect path from the request
        const redirectPath = req.body.redirectPath as string
        // create a new integration with a pending default status
        const authorizeUrl = await createIntegration(orgId, userId, provider, redirectPath)
        // return the authorize url
        res.status(200).json({ data: { authorizeUrl } })
    } catch (err) {
        // pass error to the error middleware
        next(err)
    }
}

export async function googleCallback(req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
        // extract the code and state from the request
        const {code, state, error} = req.query as {code?: string, state?: string, error?: string}
        if (error || !code || !state) {
            res.redirect(`${config.FRONTEND_URL}/integrations?error=${error || 'google_failed'}`)
            return
        }
        // consume the oauth state
        const {org_id, redirect_path} = await consumeOauthState(state)
        // exchange the code for tokens
        const tokenSet = await exchangeGoogleCode(code)
        // encrypt the tokens
        const accessTokenEncrypted = encryptOAuthToken(tokenSet.access_token)
        const refreshTokenEncrypted = tokenSet.refresh_token ? encryptOAuthToken(tokenSet.refresh_token) : null
        // activate the integration
        await activateIntegration(org_id, 'google', accessTokenEncrypted, refreshTokenEncrypted, tokenSet.expires_at, GOOGLE_REQUIRED_SCOPES, tokenSet.external_account_id ?? null)
        // redirect to the redirect path
        res.redirect(`${config.FRONTEND_URL}${redirect_path}?connected=google`)
    } catch (err) {
        // redirect to the redirect path with an error
        res.redirect(`${config.FRONTEND_URL}/integrations?error=google_failed`)
    }
}

export async function slackCallback(req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
        const {code, state, error} = req.query as {code?: string, state?: string, error?: string}
        if (error || !code || !state) {
            res.redirect(`${config.FRONTEND_URL}/integrations?error=${error || 'slack_failed'}`)
            return
        }
        const {org_id, redirect_path} = await consumeOauthState(state)
        const tokenSet = await exchangeSlackCode(code)
        const accessTokenEncrypted = encryptOAuthToken(tokenSet.access_token)
        const refreshTokenEncrypted = tokenSet.refresh_token ? encryptOAuthToken(tokenSet.refresh_token) : null
        await activateIntegration(org_id, 'slack', accessTokenEncrypted, refreshTokenEncrypted, tokenSet.expires_at, SLACK_REQUIRED_SCOPES, tokenSet.external_account_id ?? null)
        res.redirect(`${config.FRONTEND_URL}${redirect_path}?connected=slack`)
    } catch (err) {
        res.redirect(`${config.FRONTEND_URL}/integrations?error=slack_failed`)
    }
}

export async function githubCallback(req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
        const {code, state, error} = req.query as {code?: string, state?: string, error?: string}
        if (error || !code || !state) {
            res.redirect(`${config.FRONTEND_URL}/integrations?error=${error || 'github_failed'}`)
            return
        }
        const {org_id, redirect_path} = await consumeOauthState(state)
        const tokenSet = await exchangeGitHubCode(code)
        const accessTokenEncrypted = encryptOAuthToken(tokenSet.access_token)
        const refreshTokenEncrypted = tokenSet.refresh_token ? encryptOAuthToken(tokenSet.refresh_token) : null
        await activateIntegration(org_id, 'github', accessTokenEncrypted, refreshTokenEncrypted, tokenSet.expires_at, GITHUB_REQUIRED_SCOPES, tokenSet.external_account_id ?? null)
        res.redirect(`${config.FRONTEND_URL}${redirect_path}?connected=github`)
    } catch (err) {
        res.redirect(`${config.FRONTEND_URL}/integrations?error=github_failed`)
    }
}

export async function deleteIntegration(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const orgId = req.org_id!
        const provider = req.params.provider as string
        await disconnectIntegration(orgId, provider)
        res.status(202).json({ message: 'Integration disconnecting' })
    } catch (err) {
        next(err)
    }
}

