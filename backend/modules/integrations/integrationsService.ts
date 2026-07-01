import { findIntegrationByProvider, createPendingIntegration } from "./integrationsRepository.js"
import { AppError } from "../../types/AppError.js"
import { createOauthState } from "../../utils/oauthState.js"
import { getConnector } from "./connectors/index.js"

export async function createIntegration(orgId: string, userId: string, provider: string, redirectPath: string): Promise<string> {
    // get the connector
    const connector = getConnector(provider) // throws an error if the provider is invalid automatically
    // check if the integration already exists
    const integration = await findIntegrationByProvider(orgId, provider)
    const activeStatuses = ['active', 'pending']
    if (integration && activeStatuses.includes(integration.status)) {
        throw new AppError(409, 'ALREADY_CONNECTED', 'Integration already connected: ' + provider)
    }
    // create a new pending integration
    await createPendingIntegration(orgId, provider)
    // create a new oauth state
    const oauthState = await createOauthState({
        org_id: orgId,
        user_id: userId,
        provider: provider,
        redirect_path: redirectPath,
    })
    // create the authorize url
    return connector.getAuthorizeUrl(oauthState)
}

