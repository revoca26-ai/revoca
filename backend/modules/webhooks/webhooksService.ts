import { getIntegrationIdAndOrgIdByExternalAccountIdForSlack } from "./webhooksRepository.js";
import { RawDocument } from "../../types/integrations.js";
import { ingestDocument } from "../ingest/pipeline.js";

// handle the slack message event
export async function handleSlackMessageEvent(event: any, externalAccountId: string): Promise<void> {
    try {
        // extract the event data
        const { text, user, channel, ts } = event
        //using the external account id to get the integration id from the integrations table
        const { integrationId, orgId } = await getIntegrationIdAndOrgIdByExternalAccountIdForSlack(externalAccountId)
        
        // then using this we can create the raw document
        const document: RawDocument = {
            id: ts,
            integrationId,
            orgId,
            text: text || '', // handle cases where text might be empty (like attachments)
            author: user,
            timestamp: new Date(parseFloat(ts) * 1000),
            permalink: null,
            // Slack sends `channel` as just the ID string (e.g., 'C12345'), not an object!
            sourceType: `slack_channel:${channel}`, 
        }
        
        // pass the raw document to the ingestion service to be ingested
        await ingestDocument(document)
        // log the event data
        console.log(`Received message event from user ${user} in channel ${channel} at timestamp ${ts} with text: ${text}`)

    } catch (error) {
        console.error(`Error handling slack message event: ${error}`)
        throw error
    }
}