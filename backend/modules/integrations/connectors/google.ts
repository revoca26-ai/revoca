import { AppError } from "../../../types/AppError.js"
import config from "../../../config/config.js"
import { TokenSet } from "../../../types/oAuth.js"

// the URLs for the Google OAuth 2.0 flow
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

// the required scopes for the Google OAuth 2.0 flow
export const GOOGLE_REQUIRED_SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/drive',
]

/**
 * Get the Google OAuth 2.0 authorization URL
 * @param state - The state to be used in the OAuth 2.0 flow
 * @returns The Google OAuth 2.0 authorization URL
 */
export function getGoogleAuthUrl(state: string): string {
    // build the parameters for the OAuth 2.0 authorization URL for Google
    const params = new URLSearchParams({
        client_id: config.GOOGLE_CLIENT_ID,
        redirect_uri: config.GOOGLE_REDIRECT_URI,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/drive',
        access_type: 'offline',
        prompt: 'consent',
        state: state,
    })
    // return the complete authorization URL
    return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

/**
 * Exchange the Google OAuth 2.0 authorization code for tokens
 * @param code - The authorization code to be exchanged
 * @returns The token set
 * @throws AppError if the code is invalid or the tokens are not returned
 */
export async function exchangeGoogleCode(code: string): Promise<TokenSet> {
    const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            code,
            client_id: config.GOOGLE_CLIENT_ID,
            client_secret: config.GOOGLE_CLIENT_SECRET,
            redirect_uri: config.GOOGLE_REDIRECT_URI,
            grant_type: 'authorization_code',
        }),
    })

    if (!response.ok) {
        throw new AppError(500, 'GOOGLE_TOKEN_EXCHANGE_FAILED', 'Failed to exchange code for tokens')
    }

    const data: any = await response.json()

    // validate the response
    if (!data.access_token || !data.refresh_token || !data.expires_in) {
        throw new AppError(500, 'GOOGLE_TOKEN_EXCHANGE_FAILED', 'Failed to exchange code for tokens')
    }

    // check the granted scopes
    const grantedScopes = data.scope.split(' ')
    for (const scope of GOOGLE_REQUIRED_SCOPES) {
        if (!grantedScopes.includes(scope)) {
            throw new AppError(400, 'GOOGLE_TOKEN_EXCHANGE_FAILED', 'Missing required scope: ' + scope)
        }
    }

    // return the token set
    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: new Date(Date.now() + data.expires_in * 1000),
    } 
}