import OpenAI from "openai";
import { Chunk } from "./chunk.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface EmbeddedChunk extends Chunk {
  embedding: number[];
  embeddingStatus: "ok" | "failed";
}

export async function embedChunks(chunks: Chunk[]): Promise<EmbeddedChunk[]> {
  const BATCH_SIZE = 100;
  const results: EmbeddedChunk[] = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    try {
      const response = await openai.embeddings.create({
        model: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
        input: batch.map((c) => c.content),
      });

      for (let j = 0; j < batch.length; j++) {
        results.push({
          ...batch[j],
          embedding: response.data[j].embedding,
          embeddingStatus: "ok",
        });
      }
    } catch (err) {
      console.error(`Embedding batch ${i / BATCH_SIZE} failed:`, err);
      // mark whole batch as failed — embeddingRetry job will pick these up
      for (const chunk of batch) {
        results.push({
          ...chunk,
          embedding: [],
          embeddingStatus: "failed",
        });
      }
    }
  }

  return results;
}

// DELETE THIS BEFORE MOVING ON
import { chunkText } from "./chunk.js";
import * as dotenv from "dotenv";
dotenv.config();

const chunks = chunkText("This is a test sentence. It will become one chunk with an embedding vector attached to it.");
const embedded = await embedChunks(chunks);
console.log(`Chunks embedded: ${embedded.length}`);
console.log(`Embedding length: ${embedded[0].embedding.length}`);
console.log(`Status: ${embedded[0].embeddingStatus}`);