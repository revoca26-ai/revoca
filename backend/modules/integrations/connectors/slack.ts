import { AppError } from "../../../types/AppError.js"
import config from "../../../config/config.js"
import { TokenSet, RefreshTokenSet } from "../../../types/oAuth.js"
import { Integration, RawDocument } from "../../../types/integrations.js"
import { decryptOAuthToken } from "../../../utils/encryption.js"

// the URLs for the Slack OAuth 2.0 flow
const SLACK_AUTH_URL = 'https://slack.com/oauth/v2/authorize'
const SLACK_TOKEN_URL = 'https://slack.com/api/oauth.v2.access'

export const SLACK_REQUIRED_SCOPES = [
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
        scope: SLACK_REQUIRED_SCOPES.join(','),
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
    const grantedScopes = (data.scope || '').split(',')
    for (const scope of SLACK_REQUIRED_SCOPES) {
        if (!grantedScopes.includes(scope)) {
            throw new AppError(400, 'SLACK_TOKEN_EXCHANGE_FAILED', 'Missing required scope: ' + scope)
        }
    }

    // return the token set
    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token ?? null,
        expires_at: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
        external_account_id: data.team?.id ?? null,
    } 
}

/**
 * Sync the Slack data for the integration
 * @param integration - The integration to sync the data for
 * @returns The raw documents
 * @throws AppError if the data is not ok
 */
export async function syncSlackData(integration: Integration): Promise<RawDocument[]> {
    // get the access token from the integration
    const accessToken = integration.access_token_enc ? decryptOAuthToken(integration.access_token_enc) : null;
    // check if the access token exists
    if (!accessToken) {
        throw new AppError(500, 'SLACK_SYNC_FAILED', 'No access token found')
    }
    
    // Slack requires a channel ID to fetch history. We append it as a URL parameter.
    // Calling the Slack Web API to get all the avaiable channels for the bot
    const channelsResponse = await fetch('https://slack.com/api/conversations.list', {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
    })
    const channelsData: any = await channelsResponse.json()
    // check if the channels data is ok
    if (!channelsData.ok) {
        throw new AppError(500, 'SLACK_SYNC_FAILED', channelsData.error ?? 'Failed to get channels from Slack')
    }
    // get the channels from the data
    const channels = channelsData.channels || []
    const rawDocuments: RawDocument[] = []
    // loop through the channels and get the data for each channel
    for (const channel of channels) {
        // calling the Slack Web API to get the data for the channel
        const url = `https://slack.com/api/conversations.history?channel=${channel.id}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
        })  
        // get the data from the response 
        const data: any = await response.json()
        // check if the data is ok
        if (!data.ok) {
            throw new AppError(500, 'SLACK_SYNC_FAILED', data.error ?? 'Failed to get data from Slack')
        }
        // get the messages from the data
        const messages = data.messages || []
        
        // map the messages to the raw documents
        // ... is the spread operator prevents this from being a nested array
        rawDocuments.push(...messages.map((message: any) => ({
            id: message.ts, // Slack uses the 'ts' field as the unique message ID
            integrationId: integration.id,
            orgId: integration.org_id,
            text: message.text || '', // to handle if the text is not present (undefined)
            author: message.user,
            timestamp: new Date(parseFloat(message.ts) * 1000), // convert Slack's Unix seconds to JS Date
            permalink: message.permalink || null,
            sourceType: `slack_channel:#${channel.name}`, // channel name is used as the source type
            title: `#${channel.name}`, // channel name is used as the title
        })))
    }
    // return the raw documents
    return rawDocuments
}

/**
 * Refresh the Slack token
 * @param integration - The integration to refresh the token for
 * @returns void
 */
export async function refreshSlackToken(_integration: Integration): Promise<RefreshTokenSet | null> {
    // slack tokens do not expire so we can skip this for now
    return null;
}