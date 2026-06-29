import { AppError } from "../../../types/AppError.js";
import config from "../../../config/config.js";
import { TokenSet } from "../../../types/oAuth.js";

// the URLs for the Slack OAuth 2.0 flow
const SLACK_AUTH_URL = 'https://slack.com/oauth/v2/authorize'
const SLACK_TOKEN_URL = 'https://slack.com/api/oauth.v2.access'

const REQUIRED_SCOPES = [
    'channels:read',
    'chat:write',
    'files:read',
    'users:read',
]

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
        throw new AppError(500, 'SLACK_TOKEN_EXCHANGE_FAILED', 'Failed to exchange code for tokens');
    }

    const data: any = await response.json();

    // SLACK retunrs ok: false if the code is invalid
    if (!data.ok) {
        throw new AppError(500, 'SLACK_TOKEN_EXCHANGE_FAILED',data.error ?? 'Failed to exchange code for tokens');
    }

    // validate the response
    if (!data.access_token || !data.refresh_token || !data.expires_in) {
        throw new AppError(500, 'SLACK_TOKEN_EXCHANGE_FAILED', 'Failed to exchange code for tokens');
    }
    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: new Date(Date.now() + data.expires_in * 1000),
    } as TokenSet;
}