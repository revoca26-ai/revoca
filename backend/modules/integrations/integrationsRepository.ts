import { query } from '../../db/pool.js'
import { IntegrationList, Integration } from '../../types/integrations.js'


/**
 * Find all integrations for an organization
 * @param orgId - The organization ID
 * @returns The integrations
 */
export async function findAllIntegrationsByOrg(orgId: string): Promise<IntegrationList[]> {
    // get all integrations for the organization
    const queryText = `SELECT provider, status, scopes, last_synced_at, created_at FROM integrations WHERE org_id = $1`
    const queryValues = [orgId]
    // sending the query to the database
    const result = await query<IntegrationList>(queryText, queryValues)
    // return the integrations
    return result.rows
}

/**
 * Find an integration by provider
 * @param orgId - The organization ID
 * @param provider - The provider
 * @returns The integration or null if not found
 */
export async function findIntegrationByProvider(orgId: string, provider: string): Promise<Integration | null> {
    // get the integration by provider
    const queryText = `SELECT * FROM integrations WHERE org_id = $1 AND provider = $2`
    const queryValues = [orgId, provider]
    // sending the query to the database
    const result = await query<Integration>(queryText, queryValues)
    // return the integration
    return result.rows[0] ?? null
}

/**
 * Create a new pending integration
 * @param orgId - The organization ID
 * @param provider - The provider
 * @returns void
 */
export async function createPendingIntegration(orgId: string, provider: string): Promise<void> {
    // create a new pending integration
    const queryText = `INSERT INTO integrations (org_id, provider) VALUES ($1, $2)`
    const queryValues = [orgId, provider]
    // sending the query to the database
    await query(queryText, queryValues)
}

/**
 * Activate an integration
 * @param orgId - The organization ID
 * @param provider - The provider
 * @param accessTokenEncrypted - The encrypted access token
 * @param refreshTokenEncrypted - The encrypted refresh token
 * @returns void
 */
export async function activateIntegration(orgId: string, provider: string, accessTokenEncrypted: string, refreshTokenEncrypted: string | null, tokenExpiresAt: Date | null, scopes: string[]): Promise<void> {
    // activate the integration
    const queryText = `UPDATE integrations SET status = 'active', access_token_enc = $1, refresh_token_enc = $2, token_expires_at = $3, scopes = $4, updated_at = NOW() WHERE org_id = $5 AND provider = $6`
    const queryValues = [accessTokenEncrypted, refreshTokenEncrypted, tokenExpiresAt, scopes, orgId, provider]
    // sending the query to the database
    await query(queryText, queryValues)
}

/**
 * Disconnect an integration
 * @param orgId - The organization ID
 * @param provider - The provider
 * @returns void
 */
export async function disconnectIntegration(orgId: string, provider: string): Promise<void> {
    // disconnect the integration
    const queryText = `UPDATE integrations SET status = 'disconnecting', updated_at = NOW() WHERE org_id = $1 AND provider = $2`
    const queryValues = [orgId, provider]
    // sending the query to the database
    await query(queryText, queryValues)
}