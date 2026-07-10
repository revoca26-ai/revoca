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
    // create a new pending integration or update existing disconnected integration
    const queryText = `INSERT INTO integrations (org_id, provider) VALUES ($1, $2) ON CONFLICT (org_id, provider) DO UPDATE SET status = 'pending', updated_at = NOW()`
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
export async function activateIntegration(orgId: string, provider: string, accessTokenEncrypted: string, refreshTokenEncrypted: string | null, tokenExpiresAt: Date | null, scopes: string[], externalAccountId: string | null): Promise<void> {
    // activate the integration
    const queryText = `UPDATE integrations SET status = 'active', access_token_enc = $1, refresh_token_enc = $2, token_expires_at = $3, scopes = $4, external_account_id = $5, updated_at = NOW() WHERE org_id = $6 AND provider = $7`
    const queryValues = [accessTokenEncrypted, refreshTokenEncrypted, tokenExpiresAt, scopes, externalAccountId, orgId, provider]
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

/**
 * Get all active integrations
 * @returns The active integrations
 */
export async function getAllActiveIntegrations(): Promise<Integration[]> {
    // get all active integrations
    const queryText = `SELECT * FROM integrations WHERE status = 'active'`
    // sending the query to the database
    const result = await query<Integration>(queryText)
    // return the integrations
    return result.rows
}

export async function getAllExpiredIntegrations(): Promise<Integration[]> {
    // Only get integrations that ACTUALLY expire (token_expires_at IS NOT NULL) 
    // and are expiring in the next 5 minutes
    const queryText = `SELECT * FROM integrations WHERE status = 'active' AND token_expires_at IS NOT NULL AND token_expires_at < NOW() + INTERVAL '5 minutes'`
    // sending the query to the database
    const result = await query<Integration>(queryText)
    // return the integrations
    return result.rows
}

// function to update the integration with a new access token and refresh token and token expires at
export async function updateIntegration(orgId: string, provider: string, accessTokenEncrypted: string, refreshTokenEncrypted: string | null, tokenExpiresAt: Date | null): Promise<void> {
    // update the integration
    const queryText = `UPDATE integrations SET access_token_enc = $1, refresh_token_enc = COALESCE($2, refresh_token_enc), token_expires_at = $3, updated_at = NOW() WHERE org_id = $4 AND provider = $5`
    const queryValues = [accessTokenEncrypted, refreshTokenEncrypted, tokenExpiresAt, orgId, provider]
    // sending the query to the database
    await query(queryText, queryValues)
}

export async function addSyncJob(integrationId: string, orgId: string): Promise<string> {
    // add the sync job
    const insertJobQuery = `                                                           
                INSERT INTO sync_jobs (org_id, integration_id, trigger, status, started_at)    
                VALUES ($1, $2, 'cron', 'running', NOW())                                      
                RETURNING id`;
    const insertJobValues = [orgId, integrationId]
    // sending the query to the database
    const result = await query<{id: string}>(insertJobQuery, insertJobValues)
    // return the sync job id
    return result.rows[0].id
}

export async function completeSyncJob(syncJobId: string, totalDocuments: number, ingestedDocuments: number): Promise<void> {
    // complete the sync job
    const updateJobQuery = `UPDATE sync_jobs SET status = 'completed', finished_at = NOW(), items_fetched = $1, items_ingested = $2 WHERE id = $3`
    const updateJobValues = [totalDocuments, ingestedDocuments, syncJobId]
    // sending the query to the database
    await query(updateJobQuery, updateJobValues)
}

export async function failSyncJob(integrationId: string, error: string): Promise<void> {
    // fail the sync job
    const updateJobQuery = `UPDATE sync_jobs SET status = 'failed', finished_at = NOW(), error_message = $1 WHERE integration_id = $2 AND status = 'running'`
    const updateJobValues = [error, integrationId]
    // sending the query to the database
    await query(updateJobQuery, updateJobValues)
}

export async function updateLastSyncedAt(integrationId: string): Promise<void> {
    const updateJobQuery = `UPDATE integrations SET last_synced_at = NOW() WHERE id = $1`
    await query(updateJobQuery, [integrationId])
}