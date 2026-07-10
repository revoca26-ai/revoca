import { AppError } from "../../../types/AppError.js"
import config from "../../../config/config.js"
import { TokenSet, RefreshTokenSet } from "../../../types/oAuth.js"
import { Integration, RawDocument } from "../../../types/integrations.js"
import { decryptOAuthToken } from "../../../utils/encryption.js"
const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize'
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'

export const GITHUB_REQUIRED_SCOPES = [
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
        scope: GITHUB_REQUIRED_SCOPES.join(' '), // Github requires scopes as a space-separated string - GITHUB API docs
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
    const grantedScopes = (data.scope || '').split(',') // Github returns scopes as a comma-separated string
    for (const scope of GITHUB_REQUIRED_SCOPES) {
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

/**
 * Sync the GitHub data for the integration
 * @param integration - The integration to sync the data for
 * @returns The raw documents
 */
export async function syncGithubData(integration: Integration): Promise<RawDocument[]> {
    const accessToken = integration.access_token_enc ? decryptOAuthToken(integration.access_token_enc) : null;
    
    if (!accessToken) {
        throw new AppError(500, 'GITHUB_SYNC_FAILED', 'No access token found');
    }

    // Fetch the 50 most recent issues the user is involved in across all their repos
    let url = 'https://api.github.com/issues?filter=all&state=all&per_page=50';
    if (integration.last_synced_at) {
        url += `&since=${integration.last_synced_at.toISOString()}`;
    }
    
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Revoca-App' // GitHub requires a User-Agent header
        },
    });

    const data: any = await response.json();

    if (!response.ok) {
        throw new AppError(500, 'GITHUB_SYNC_FAILED', data.message ?? 'Failed to fetch GitHub issues');
    }

    const issues = Array.isArray(data) ? data : [];
    const rawDocuments: RawDocument[] = [];

    // Map each GitHub issue/PR into our RawDocument format
    for (const issue of issues) {
        rawDocuments.push({
            id: issue.id.toString(),
            integrationId: integration.id,
            orgId: integration.org_id,
            text: `${issue.title}\n\n${issue.body || ''}`,
            author: issue.user?.login || 'Unknown',
            timestamp: new Date(issue.created_at),
            permalink: issue.html_url,
            sourceType: 'github_issue',
            title: issue.title
        });
    }

    return rawDocuments;
}

/**
 * Refresh the GitHub token
 * @param integration - The integration to refresh the token for
 * @returns void
 */
export async function refreshGithubToken(_integration: Integration): Promise<RefreshTokenSet | null> {
    // By default, GitHub OAuth tokens do NOT expire 
    return null;
}