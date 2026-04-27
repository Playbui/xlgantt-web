import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';

const DEFAULT_NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_NVIDIA_MODEL = 'mistralai/mistral-large-3-675b-instruct-2512';
const KOREAN_CHAT_SYSTEM_PROMPT = [
  'You are a Korean inline autocomplete engine for a document editor.',
  'Return only the next few Korean words that naturally continue the current unfinished sentence.',
  'Do not introduce a new topic, goal, strategy, mission, opinion, summary, or explanation.',
  'If the current text already ends naturally, ends with punctuation, or the next words are uncertain, return exactly "0".',
  'Never translate Korean text into English.',
].join('\n');

export const config = { maxDuration: 30 };

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const {
      nvidiaApiKey,
      nvidiaBaseURL,
      prompt,
      system,
    } = await readJson(req);
    const resolvedModel = resolveModel({
      nvidiaApiKey,
      nvidiaBaseURL,
    });

    if (!resolvedModel) {
      return sendJson(res, 401, {
        error: 'Missing NVIDIA NIM API key.',
      });
    }

    const result = await generateText({
      maxOutputTokens: 24,
      model: resolvedModel,
      prompt,
      system: [KOREAN_CHAT_SYSTEM_PROMPT, system].filter(Boolean).join('\n\n'),
      stopSequences: ['\n'],
      temperature: 0.2,
      topP: 0.75,
    });

    return sendJson(res, 200, result);
  } catch (error) {
    console.error('AI copilot failed:', error);
    return sendJson(res, 500, { error: 'Failed to process AI request' });
  }
}

async function readJson(req: any) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function sendJson(res: any, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function resolveModel({
  nvidiaApiKey,
  nvidiaBaseURL,
}: {
  nvidiaApiKey?: string;
  nvidiaBaseURL?: string;
}) {
  const key = nvidiaApiKey || process.env.NVIDIA_API_KEY;
  if (!key) return null;

  return createOpenAICompatible({
    apiKey: key,
    baseURL: nvidiaBaseURL || process.env.NVIDIA_BASE_URL || DEFAULT_NVIDIA_BASE_URL,
    name: 'nvidia',
  }).chatModel(DEFAULT_NVIDIA_MODEL);
}
