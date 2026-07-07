import { AppError } from "../../../types/AppError.js"
import config from "../../../config/config.js"
import { RefreshTokenSet, TokenSet } from "../../../types/oAuth.js"
import { RawDocument } from "../../../types/integrations.js"
import { Integration } from "../../../types/integrations.js"
import { decryptOAuthToken } from "../../../utils/encryption.js"

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
    const grantedScopes = (data.scope || '').split(' ')
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

/**
 * Refresh the Google token
 * @param integration - The integration to refresh the token for
 * @returns void
 */
export async function refreshGoogleToken(integration: Integration): Promise<RefreshTokenSet> {
    // get the access token from the integration
    const accessToken = integration.access_token_enc ? decryptOAuthToken(integration.access_token_enc) : null;
    // check if the access token exists
    if (!accessToken) {
        throw new AppError(500, 'GOOGLE_TOKEN_REFRESH_FAILED', 'No access token found')
    }
    // send the access token to the Google API to refresh the token
    const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            client_id: config.GOOGLE_CLIENT_ID,
            client_secret: config.GOOGLE_CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: accessToken,
        }),
    })

    if (!response.ok) {
        throw new AppError(500, 'GOOGLE_TOKEN_REFRESH_FAILED', 'Failed to refresh token')
    }

    const data: any = await response.json()

    // validate the response
    if (!data.access_token && !data.expires_in) {
        throw new AppError(500, 'GOOGLE_TOKEN_REFRESH_FAILED', 'Failed to refresh token')
    }

    // return the token set
    return {
        access_token: data.access_token,
        expires_at: new Date(Date.now() + data.expires_in * 1000),
        refresh_token: null,
    }
}