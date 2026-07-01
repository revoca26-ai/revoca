import { AppError } from "../../../types/AppError.js"
import config from "../../../config/config.js"
import { TokenSet } from "../../../types/oAuth.js"

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize'
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'

const REQUIRED_SCOPES = [
    'repo',
    'read:user',
    'user:email',
]

/**
 * Get the GitHub OAuth 2.0 authorization URL
 * @param state - The state to be used in the OAuth 2.0 flow
 * @returns The GitHub OAuth 2.0 authorization URL
 */
export function getGitHubAuthUrl(state: string): string {
    // build the parameters for the OAuth 2.0 authorization URL for GitHub
    const params = new URLSearchParams({
        client_id: config.GITHUB_CLIENT_ID,
        redirect_uri: config.GITHUB_REDIRECT_URI,
        scope: REQUIRED_SCOPES.join(' '), // Github requires scopes as a space-separated string - GITHUB API docs
        state,
    })

    // return the complete authorization URL
    return `${GITHUB_AUTH_URL}?${params.toString()}`
}

/**
 * Exchange the GitHub OAuth 2.0 authorization code for tokens
 * @param code - The authorization code to be exchanged
 * @returns The token set
 * @throws AppError if the code is invalid or the tokens are not returned
 */
export async function exchangeGitHubCode(code: string): Promise<TokenSet> {
    // send the code to the GitHub API to exchange for tokens
    const response = await fetch(GITHUB_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
        },
        body: new URLSearchParams({
            code,
            client_id: config.GITHUB_CLIENT_ID,
            client_secret: config.GITHUB_CLIENT_SECRET,
            redirect_uri: config.GITHUB_REDIRECT_URI,
        }),
    })

    // checking if the response is ok
    if (!response.ok) {
        throw new AppError(500, 'GITHUB_TOKEN_EXCHANGE_FAILED', 'Failed to exchange code for tokens')
    }

    // extract the data from the response
    const data: any = await response.json()

    // Github returns error field instead of HTTP error status
    if (data.error) {
        throw new AppError(500, 'GITHUB_TOKEN_EXCHANGE_FAILED', data.error)
    }

    // validate the response
    if (!data.access_token) {
        throw new AppError(500, 'GITHUB_TOKEN_EXCHANGE_FAILED', 'Failed to exchange code for tokens')
    }

    // check the granted scopes
    const grantedScopes = data.scope.split(' ') // Github returns scopes as a space-separated string - GITHUB API docs
    for (const scope of REQUIRED_SCOPES) {
        if (!grantedScopes.includes(scope)) {
            throw new AppError(400, 'GITHUB_TOKEN_EXCHANGE_FAILED', 'Missing required scope: ' + scope)
        }
    }

    // return the token set
    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token ?? null,
        expires_at: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
    }
}