import { RawDocument } from "../../types/integrations.js"
import { query } from "../../db/pool.js"
import crypto from 'crypto'

export async function storeChunks(doc: RawDocument, chunks: string[], embeddings: number[][], embeddingStatus: boolean): Promise<void> {
    // extract the document properties
    const { id, integrationId, orgId, text, author, timestamp, permalink, sourceType, title } = doc
    // generate a content hash
    const contentHash = crypto.createHash('sha256').update(text).digest('hex')
    // check if the document already exists in the database
    const documentExistsQuery = `SELECT id, content_hash FROM documents WHERE org_id = $1 AND integration_id = $2 AND external_id = $3`
    const documentExistsValues = [orgId, integrationId, id]
    const documentExistsResult = await query(documentExistsQuery, documentExistsValues)
    
    // if the document already exists compare the content hash
    if (documentExistsResult.rows.length > 0) {
        const documentContentHash = documentExistsResult.rows[0].content_hash
        if (documentContentHash === contentHash) {
            return // Hash matches exactly, skip entirely!
        } else {
            // The document changed! Soft-delete the old chunks so we don't get duplicates.
            const deleteChunksQuery = `UPDATE chunks SET deleted_at = NOW() WHERE document_id = $1`
            const deleteChunksValues = [documentExistsResult.rows[0].id]
            await query(deleteChunksQuery, deleteChunksValues)
        }
    }

    // create a metadata object
    const metadata = {
        author: author || null,
        timestamp: timestamp.toISOString(),
    }
    const metadataJson = JSON.stringify(metadata)
    
    // UPSERT: Insert the document. If it already exists, update its content and hash!
    const documentInsertQuery = `
        INSERT INTO documents (org_id, integration_id, external_id, source_type, title, url, raw_content, metadata, content_hash)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (org_id, integration_id, external_id) DO UPDATE SET 
            title = EXCLUDED.title,
            raw_content = EXCLUDED.raw_content,
            content_hash = EXCLUDED.content_hash,
            url = EXCLUDED.url,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
        RETURNING id
    `
    const documentInsertValues = [orgId, integrationId, id, sourceType, title, permalink || '', text, metadataJson, contentHash]
    const documentInsertResult = await query(documentInsertQuery, documentInsertValues)
    const documentId = documentInsertResult.rows[0].id
    // insert the chunks into the database
    // if the embedding status is true, insert the embedding into the database
    if (embeddingStatus) {
        // loop through the chunks and the embeddings and insert the chunks into the database
        for (let i = 0; i < chunks.length; i++) {
            const tokenCount = Math.ceil(chunks[i].split(/\\s+/).length * 1.3);
            const embeddingString = JSON.stringify(embeddings[i]); // pgvector expects a string like '[0.1, 0.2, ...]'
            
            const chunkInsertQuery = `INSERT INTO chunks (org_id, document_id, chunk_index, content, token_count, embedding, metadata, embedding_status)
            VALUES ($1, $2, $3, $4, $5, $6::vector, $7, $8)`
            const chunkInsertValues = [orgId, documentId, i, chunks[i], tokenCount, embeddingString, metadataJson, 'ok']
            await query(chunkInsertQuery, chunkInsertValues)
        }
    } else {
        // insert ALL chunks for embedding status pending (not just chunks[0])
        for (let i = 0; i < chunks.length; i++) {
            const tokenCount = Math.ceil(chunks[i].split(/\\s+/).length * 1.3);
            const chunkInsertQuery = `INSERT INTO chunks (org_id, document_id, chunk_index, content, token_count, metadata, embedding_status)
            VALUES ($1, $2, $3, $4, $5, $6, $7)`
            const chunkInsertValues = [orgId, documentId, i, chunks[i], tokenCount, metadataJson, 'pending']
            await query(chunkInsertQuery, chunkInsertValues)
        }
    }
}

export async function deleteChunksDeletedMoreThan7DaysAgo(): Promise<void> {
    // Delete chunks older than 7 days where deleted_at is not null
    const deleteChunksQuery = `DELETE FROM chunks WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '7 days'`
    await query(deleteChunksQuery)
    // final console log
    console.log("Chunks deleted more than 7 days ago")
}