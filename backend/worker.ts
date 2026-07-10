import cron from 'node-cron'
import { getAllActiveIntegrations, getAllExpiredIntegrations, addSyncJob, completeSyncJob, failSyncJob, updateLastSyncedAt } from './modules/integrations/integrationsRepository.js'
import { getConnector } from './modules/integrations/connectors/index.js'
import { ingestDocument } from './modules/ingest/pipeline.js'
import { updateIntegration } from './modules/integrations/integrationsRepository.js'
import { encryptOAuthToken } from './utils/encryption.js'
import { deleteChunksDeletedMoreThan7DaysAgo } from './modules/ingest/documentRepository.js'
import { logger } from './utils/logger.js'

// this function will tell the worker to do the job every 15 minutes 
cron.schedule('*/15 * * * *', async () => {
    logger.info({ job: 'sync-15m' }, "Starting the sync 15 minute job.....")
    try {
        // get all the active integrations
        const integrations = await getAllActiveIntegrations()
        // loop through the integrations and sync the data
        for (const integration of integrations) {
            try {
                // add the sync_job table entry
                let syncJobId = null;
                try {
                    // add the sync_job table entry
                    syncJobId = await addSyncJob(integration.id, integration.org_id)
                } catch (err) {
                    // if we get postgres unique index violation error, that means the sync job already exists so we can continue
                    if (err instanceof Error && 'code' in err && err.code === '23505') {
                        logger.info({ integrationId: integration.id }, "Sync job already running, skipping")
                        continue
                    }
                    // if we get any other error, we should throw it
                    throw err
                }
                // get the connector for the integration
                const connector = getConnector(integration.provider)
                // sync the data
                const rawDocuments = await connector.syncData(integration)
                // loop through the raw documents and ingest the data
                let ingestedDocuments = 0;
                for (const rawDocument of rawDocuments) {
                    // ingest the data
                    await ingestDocument(rawDocument)
                    ingestedDocuments++;
                }
                // final console log
                logger.info({ integrationId: integration.id, documents: ingestedDocuments }, "Successfully ingested documents")
                // update the sync_job table entry
                await completeSyncJob(syncJobId, rawDocuments.length, ingestedDocuments)
                // update the integration to say we finished syncing
                await updateLastSyncedAt(integration.id)
            } catch (err) {
                logger.error({ integrationId: integration.id, err }, "Error syncing integration");
                // update the sync_job table entry
                await failSyncJob(integration.id, String(err))
            }
        }
    } catch (error) {
        logger.error({ err: error }, "Error in the sync 15 minute job")
    }
    logger.info({ job: 'sync-15m' }, "Sync 15 minute job completed successfully")
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