import { query } from "../../db/pool.js";
import { AppError } from "../../types/AppError.js";

export async function getIntegrationIdAndOrgIdByExternalAccountIdForSlack(externalAccountId: string): Promise<{ integrationId: string, orgId: string }> {
    // using the external account id to get the integration id from the integrations table
    const queryString = `SELECT id, org_id FROM integrations WHERE external_account_id = $1 AND provider = 'slack'`
    const values = [externalAccountId]
    const result = await query(queryString, values)
    // if the result is empty, throw an error
    if (result.rows.length === 0) {
        throw new AppError(404, 'INTEGRATION_NOT_FOUND', 'Slack integration not found')
    }
    // return the integration id
    return { integrationId: result.rows[0].id, orgId: result.rows[0].org_id }
}