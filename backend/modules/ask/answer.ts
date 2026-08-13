// modules/ask/answer.ts
//
// Streams a cited answer from Gemini given a question and a set of source
// chunks (already retrieved + reranked upstream in pipeline.ts). The model
// is instructed to answer ONLY from the provided sources and cite them by
// number.

import '../../config/config.js'; // ensures .env is loaded

const GEMINI_MODEL = 'gemini-2.5-flash-lite';

const GEMINI_STREAM_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent`;

export type AnswerSource = {
  index: number; // 1-based citation number
  content: string;
};

const SYSTEM_INSTRUCTION = `You are a workplace knowledge assistant. Answer the user's
question using ONLY the numbered sources provided below. Do not use outside knowledge.

Rules:
- Cite every factual claim with the matching source number in square brackets, e.g. [1].
- If multiple sources support a claim, cite all of them, e.g. [1][2].
- If the sources do not contain enough information to answer the question, say so plainly
  instead of guessing. Do not fabricate information not present in the sources.
- Keep the answer concise and directly responsive to the question.`;


function buildPrompt(
  question: string,
  sources: AnswerSource[]
): string {
  const sourceBlock = sources
    .map((s) => `[${s.index}] ${s.content}`)
    .join('\n\n');

  return `Sources:\n${sourceBlock}\n\nQuestion: ${question}`;
}


// Parses Gemini SSE stream and yields text deltas.
export async function* streamAnswer(
  question: string,
  sources: AnswerSource[]
): AsyncGenerator<string, void, unknown> {

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not set — add it to your .env'
    );
  }


  const response = await fetch(
    `${GEMINI_STREAM_URL}?alt=sse&key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: SYSTEM_INSTRUCTION,
            },
          ],
        },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: buildPrompt(question, sources),
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
        },
      }),
    }
  );


  if (!response.ok || !response.body) {
    const errorBody = await response.text();

    throw new Error(
      `Gemini streamAnswer failed (${response.status}): ${errorBody}`
    );
  }


  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = '';


  while (true) {

    const { done, value } = await reader.read();

    if (done) {
      break;
    }


    buffer += decoder.decode(value, {
      stream: true,
    });


    // Split SSE stream by lines
    const lines = buffer.split('\n');

    // Keep incomplete last line
    buffer = lines.pop() ?? '';


    for (const line of lines) {

      const trimmed = line.trim();


      // Gemini SSE messages start with "data:"
      if (!trimmed.startsWith('data:')) {
        continue;
      }


      const jsonStr = trimmed
        .slice('data:'.length)
        .trim();


      if (!jsonStr) {
        continue;
      }


      try {

        const parsed = JSON.parse(jsonStr);


        const textDelta =
          parsed?.candidates?.[0]
            ?.content
            ?.parts?.[0]
            ?.text;


        if (textDelta) {
          yield textDelta;
        }


      } catch (err) {

        // Ignore malformed chunks
        continue;

      }
    }
  }


  // Flush remaining buffered data after stream closes
  if (buffer.trim().startsWith('data:')) {

    const jsonStr = buffer
      .trim()
      .slice('data:'.length)
      .trim();


    try {

      const parsed = JSON.parse(jsonStr);


      const textDelta =
        parsed?.candidates?.[0]
          ?.content
          ?.parts?.[0]
          ?.text;


      if (textDelta) {
        yield textDelta;
      }


    } catch {
      // ignore final malformed chunk
    }
  }
}