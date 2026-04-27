import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';

const DEFAULT_NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_NVIDIA_MODEL = 'nvidia/llama-3.3-nemotron-super-49b-v1.5';

export const config = { maxDuration: 30 };

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const {
      model = DEFAULT_NVIDIA_MODEL,
      nvidiaApiKey,
      nvidiaBaseURL,
      prompt,
      system,
    } = await readJson(req);
    const resolvedModel = resolveModel({
      model,
      nvidiaApiKey,
      nvidiaBaseURL,
    });

    if (!resolvedModel) {
      return sendJson(res, 401, {
        error: 'Missing NVIDIA NIM API key.',
      });
    }

    const result = await generateText({
      maxOutputTokens: 50,
      model: resolvedModel,
      prompt,
      system,
      temperature: 0.7,
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
  model,
  nvidiaApiKey,
  nvidiaBaseURL,
}: {
  model: string;
  nvidiaApiKey?: string;
  nvidiaBaseURL?: string;
}) {
  const key = nvidiaApiKey || process.env.NVIDIA_API_KEY;
  if (!key) return null;
  const modelId = resolveNvidiaModel(model);

  return createOpenAICompatible({
    apiKey: key,
    baseURL: nvidiaBaseURL || process.env.NVIDIA_BASE_URL || DEFAULT_NVIDIA_BASE_URL,
    name: 'nvidia',
  }).chatModel(modelId);
}

function resolveNvidiaModel(requestedModel?: string) {
  const candidates = [requestedModel, process.env.NVIDIA_MODEL, DEFAULT_NVIDIA_MODEL];

  return candidates.find((candidate) => candidate?.startsWith('nvidia/')) || DEFAULT_NVIDIA_MODEL;
}
