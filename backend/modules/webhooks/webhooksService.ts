import { logger } from '../../utils/logger.js';
import { getIntegrationIdAndOrgIdByExternalAccountIdForSlack } from "./webhooksRepository.js";
import { RawDocument } from "../../types/integrations.js";
import { ingestDocument } from "../ingest/pipeline.js";
import { deleteDocument } from "../ingest/documentRepository.js";

// handle the slack message event
export async function handleSlackMessageEvent(event: any, externalAccountId: string): Promise<void> {
    try {
        // extract the event data
        let { text, user, channel, ts } = event

        // If it's a special type of message, handle it or ignore it
        if (event.subtype) {
            if (event.subtype === 'message_changed') {
                // For edited messages, Slack nests the actual content inside `event.message`
                text = event.message?.text || '';
                user = event.message?.user || 'Unknown';
                // Very important: Use the original timestamp so we overwrite the correct document in the DB!
                ts = event.message?.ts; 
            } else if (event.subtype === 'message_deleted') {
                // The message was deleted in Slack, delete it in our DB
                const { integrationId, orgId } = await getIntegrationIdAndOrgIdByExternalAccountIdForSlack(externalAccountId)
                await deleteDocument(event.deleted_ts, integrationId, orgId);
                logger.info(`Deleted message ${event.deleted_ts} from Slack`);
                return;
            } else {
                // Ignore bot messages, channel joins, etc.
                logger.info(`Skipping Slack message with subtype: ${event.subtype}`);
                return;
            }
        }
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
            title: null,
        }
        
        // pass the raw document to the ingestion service to be ingested
        await ingestDocument(document)
        // log the event data
        logger.info(`Received message event from user ${user} in channel ${channel} at timestamp ${ts} with text: ${text}`)

    } catch (error) {
        logger.error(`Error handling slack message event: ${error}`)
        throw error
    }
}