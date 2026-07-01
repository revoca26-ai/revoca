import { AppError } from "../../../types/AppError.js"
import config from "../../../config/config.js"
import { TokenSet } from "../../../types/oAuth.js"

// the URLs for the Slack OAuth 2.0 flow
const SLACK_AUTH_URL = 'https://slack.com/oauth/v2/authorize'
const SLACK_TOKEN_URL = 'https://slack.com/api/oauth.v2.access'

const REQUIRED_SCOPES = [
    'channels:read',
    'chat:write',
    'files:read',
    'users:read',
]

/**
 * Get the Slack OAuth 2.0 authorization URL
 * @param state - The state to be used in the OAuth 2.0 flow
 * @returns The Slack OAuth 2.0 authorization URL
 */
export function getSlackAuthUrl(state: string): string {
    // build the parameters for the OAuth 2.0 authorization URL for Slack
    const params = new URLSearchParams({
        client_id: config.SLACK_CLIENT_ID,
        redirect_uri: config.SLACK_REDIRECT_URI,
        scope: REQUIRED_SCOPES.join(','),
        state,
    })
    // return the complete authorization URL
    return `${SLACK_AUTH_URL}?${params.toString()}`
}

/**
 * Exchange the Slack OAuth 2.0 authorization code for tokens
 * @param code - The authorization code to be exchanged
 * @returns The token set
 * @throws AppError if the code is invalid or the tokens are not returned
 */
export async function exchangeSlackCode(code: string): Promise<TokenSet> {
    const response =  await fetch(SLACK_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            code,
            client_id: config.SLACK_CLIENT_ID,
            client_secret: config.SLACK_CLIENT_SECRET,
            redirect_uri: config.SLACK_REDIRECT_URI,
        }),
    })

    if (!response.ok) {
        throw new AppError(500, 'SLACK_TOKEN_EXCHANGE_FAILED', 'Failed to exchange code for tokens')
    }

    const data: any = await response.json()

    // SLACK retunrs ok: false if the code is invalid different from google
    if (!data.ok) {
        throw new AppError(500, 'SLACK_TOKEN_EXCHANGE_FAILED',data.error ?? 'Failed to exchange code for tokens')
    }

    // validate the response
    if (!data.access_token) {
        throw new AppError(500, 'SLACK_TOKEN_EXCHANGE_FAILED', 'Failed to exchange code for tokens')
    }

    // check the granted scopes
    const grantedScopes = data.scope.split(',')
    for (const scope of REQUIRED_SCOPES) {
        if (!grantedScopes.includes(scope)) {
            throw new AppError(400, 'SLACK_TOKEN_EXCHANGE_FAILED', 'Missing required scope: ' + scope)
        }
    }

    // return the token set
    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token ?? null,
        expires_at: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
    } 
}