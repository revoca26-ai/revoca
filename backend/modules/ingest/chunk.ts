import { get_encoding } from "tiktoken";

const enc = get_encoding("cl100k_base");

export interface Chunk {
  content: string;
  tokenCount: number;
  chunkIndex: number;
}

export function chunkText(text: string): Chunk[] {
  const TARGET = 300;
  const MIN = 200;
  const MAX = 400;

  // split on paragraph boundaries first
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);

  const chunks: Chunk[] = [];
  let buffer = "";
  let bufferTokens = 0;

  for (const paragraph of paragraphs) {
    const paraTokens = enc.encode(paragraph).length;

    // if adding this paragraph exceeds MAX, flush buffer first
    if (bufferTokens + paraTokens > MAX && bufferTokens >= MIN) {
      chunks.push({
        content: buffer.trim(),
        tokenCount: bufferTokens,
        chunkIndex: chunks.length,
      });
      buffer = "";
      bufferTokens = 0;
    }

    // if a single paragraph is itself too long, split on sentences
    if (paraTokens > MAX) {
      const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
      for (const sentence of sentences) {
        const sentTokens = enc.encode(sentence).length;
        if (bufferTokens + sentTokens > MAX && bufferTokens >= MIN) {
          chunks.push({
            content: buffer.trim(),
            tokenCount: bufferTokens,
            chunkIndex: chunks.length,
          });
          buffer = "";
          bufferTokens = 0;
        }
        buffer += " " + sentence;
        bufferTokens += sentTokens;
      }
    } else {
      buffer += "\n\n" + paragraph;
      bufferTokens += paraTokens;
    }
  }

  // flush whatever is left
  if (buffer.trim().length > 0) {
    chunks.push({
      content: buffer.trim(),
      tokenCount: bufferTokens,
      chunkIndex: chunks.length,
    });
  }

  return chunks;
}