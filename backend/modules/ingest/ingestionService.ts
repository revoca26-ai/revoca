import { RawDocument } from "../../types/integrations.js";
import OpenAI from "openai";
import config from "../../config/config.js";

/**
 * 
 * @param doc 
 * @returns Array of chunk strings
 */
export function chunkDocument(doc: RawDocument): string[] {
    // If there's no text, return an empty array
    if (!doc.text || doc.text.trim() === '') {
        return [];
    }

    // Split the text into an array of words
    const words = doc.text.split(/\s+/);
    
    // We will group the words into chunks of roughly 250 words, with a 50 word overlap
    const CHUNK_SIZE = 250;
    const OVERLAP = 50;
    const STEP_SIZE = CHUNK_SIZE - OVERLAP;
    const chunks: string[] = [];

    // Loop through the words array, jumping forward by STEP_SIZE each time
    for (let i = 0; i < words.length; i += STEP_SIZE) {
        // Slice out a piece of the words array, and join them back into a single string
        const chunkWords = words.slice(i, i + CHUNK_SIZE);
        const chunkText = chunkWords.join(' ');
        chunks.push(chunkText);
        
        // If this chunk reached the end of the document, break out of the loop
        if (i + CHUNK_SIZE >= words.length) {
            break;
        }
    }

    return chunks;
}


export async function embedChunks(chunks: string[]): Promise<number[][]> {                 
    // If the array is empty, return empty                                              
    if (chunks.length === 0) return [];                                                    
                                                                                           
    // create an instance of OpenAI                                                     
    const openai = new OpenAI({apiKey: config.OPENAI_API_KEY});                            
                                                                                           
    // We pass the entire 'chunks' array at once.                  
    // OpenAI will process all chunks simultaneously in one request.                       
    const response = await openai.embeddings.create({                                      
        model: "text-embedding-3-small",                                                   
        input: chunks, // OpenAI takes the whole array here                                
    });                                                                                    
                                                                                           
    // 4. The response has an array called 'data' that matches our chunks perfectly.       
    // We just map over it to pull out the 'embedding' array from each object.             
    return response.data.map(d => d.embedding);                                            
} 