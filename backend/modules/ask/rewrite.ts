// modules/ask/rewrite.ts
//
// Turns a raw user question into structured search input using Gemini.
// This replaces naive keyword extraction (e.g. splitting on stopwords) with
// an LLM call that understands intent and produces cleaner search terms.

import '../../config/config.js';
const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export type RewriteResult = {
  searchTerms: string[];
  intent: string;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

const SYSTEM_INSTRUCTION = `You are a query rewriting assistant for a workplace search tool.
Given a user's question, extract the best search keywords/phrases to find relevant
documents, and classify the user's intent in one short phrase.

Respond ONLY with valid JSON in this exact shape, no markdown, no preamble:
{
  "searchTerms": ["term1", "term2", "..."],
  "intent": "short description of what the user wants"
}

Guidelines:
- searchTerms should be 2-6 concrete keywords or short phrases, not full sentences.
- Prefer domain-specific nouns and verbs over generic words like "time", "get", "know".
- Do not include question words (what, how, when, why) as search terms.`;

export async function rewriteQuery(question: string): Promise<RewriteResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set — add it to your .env and config/env.ts');
  }

  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: question }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini rewrite failed (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('Gemini rewrite returned no content');
  }

  let parsed: RewriteResult;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Gemini rewrite returned invalid JSON: ${text}`);
  }

  if (!Array.isArray(parsed.searchTerms) || typeof parsed.intent !== 'string') {
    throw new Error(`Gemini rewrite returned unexpected shape: ${text}`);
  }

  return parsed;
}