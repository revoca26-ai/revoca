import { RawDocument } from "../../types/integrations.js"
import { storeChunks } from "./documentRepository.js"
import { chunkDocument, embedChunks } from "./ingestionService.js"

export async function ingestDocument(doc: RawDocument): Promise<void> {
    // chunk the document
    const chunks = chunkDocument(doc)
    // try to embed the chunks
    try {
        const embeddings = await embedChunks(chunks)
        // store the chunks in the database
        await storeChunks(doc, chunks, embeddings, true)
    } catch (error) {
        // console error
        console.error(`error embedding document using openai with id:${doc.id}: ${error}`)
        // if the embedding fails, store the chunks in the database with embedding status pending
        await storeChunks(doc, chunks, [], false)
    }
}