import cron from 'node-cron'
import { getAllActiveIntegrations, getAllExpiredIntegrations } from './modules/integrations/integrationsRepository.js'
import { getConnector } from './modules/integrations/connectors/index.js'
import { ingestDocument } from './modules/ingest/pipeline.js'
import { updateIntegration } from './modules/integrations/integrationsRepository.js'
import { encryptOAuthToken } from './utils/encryption.js'
import { deleteChunksDeletedMoreThan7DaysAgo } from './modules/ingest/documentRepository.js'

// this function will tell the worker to do the job every 15 minutes 
cron.schedule('*/15 * * * *', async () => {
    // get all the integrations that are active and have a refresh token
    console.log("Starting the sync 15 minute job.....")
    try {
        // get all the active integrations
        const integrations = await getAllActiveIntegrations()
        // loop through the integrations and sync the data
        for (const integration of integrations) {
            try {
                // get the connector for the integration
                const connector = getConnector(integration.provider)
                // sync the data
                const rawDocuments = await connector.syncData(integration)
                // loop through the raw documents and ingest the data
                for (const rawDocument of rawDocuments) {
                    // ingest the data
                    await ingestDocument(rawDocument)
                }
                // final console log
                console.log(`Ingested ${rawDocuments.length} documents for integration ${integration.id}`)
            } catch (err) {
                console.error(`Error syncing integration ${integration.id}: ${err}`);
            }
        }
    } catch (error) {
        console.error(`error in the sync 15 minute job: ${error}`)
    }
    // final console log
    console.log("Sync 15 minute job completed successfully")
})

// make another worker to handle expired oAuth tokens
cron.schedule('*/15 * * * *', async () => {
    console.log("Starting the expired oAuth token job.....")
    try {
        // get all the expired and will expire in the next 5 minutes integrations
        const integrations = await getAllExpiredIntegrations()
        // loop through the integrations and disconnect the integration
        for (const integration of integrations) {
            try {
                const connector = getConnector(integration.provider)
                // refresh the token
                const refreshTokenSet = await connector.refreshToken(integration)
                // if the refresh token set is null, that means it does not need to be refrseshed so we can continue
                if (!refreshTokenSet) {
                    continue
                }
                // encrypt the refresh token
                const refreshTokenEncrypted = refreshTokenSet.refresh_token ? encryptOAuthToken(refreshTokenSet.refresh_token) : null
                // encrypt the access token
                const accessTokenEncrypted = encryptOAuthToken(refreshTokenSet.access_token)
                // update the integration with the new access token and refresh token and token expires at
                await updateIntegration(integration.org_id, integration.provider, accessTokenEncrypted, refreshTokenEncrypted, refreshTokenSet.expires_at)
            } catch (err) {
                console.error(`Error refreshing integration ${integration.id}: ${err}`);
            }
        }
    } catch (error) {
        console.error(`error in the expired oAuth token job: ${error}`)
    }
    // final console log
    console.log("Expired oAuth token job completed successfully")
})

// this worker runs daily and will delete all the chunks which where deleted more than 7 days ago
cron.schedule('0 0 * * *', async () => {
    console.log("Starting the delete chunks job.....")
    try {
        // get all the chunks which were deleted more than 7 days ago
        await deleteChunksDeletedMoreThan7DaysAgo()
    } catch (error) {
        console.error(`error in the delete chunks job: ${error}`)
    }
    // final console log
    console.log("Delete chunks job completed successfully")
})