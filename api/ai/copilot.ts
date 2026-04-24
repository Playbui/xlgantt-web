import { createGateway } from '@ai-sdk/gateway';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';

const DEFAULT_NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_NVIDIA_MODEL = 'nvidia/llama-3.1-nemotron-ultra-253b-v1';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const {
      apiKey: key,
      model = 'openai/gpt-4o-mini',
      nvidiaApiKey,
      nvidiaBaseURL,
      prompt,
      provider,
      system,
    } = await readJson(req);
    const resolvedModel = resolveModel({
      apiKey: key,
      model,
      nvidiaApiKey,
      nvidiaBaseURL,
      provider,
    });

    if (!resolvedModel) {
      return sendJson(res, 401, {
        error: provider === 'nvidia' ? 'Missing NVIDIA NIM API key.' : 'Missing AI Gateway API key.',
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

function normalizeGatewayModel(model: string) {
  return model.includes('/') ? model : `openai/${model}`;
}

function resolveModel({
  apiKey,
  model,
  nvidiaApiKey,
  nvidiaBaseURL,
  provider,
}: {
  apiKey?: string;
  model: string;
  nvidiaApiKey?: string;
  nvidiaBaseURL?: string;
  provider?: string;
}) {
  if (provider === 'nvidia' || process.env.AI_PROVIDER === 'nvidia') {
    const key = nvidiaApiKey || process.env.NVIDIA_API_KEY;
    if (!key) return null;

    return createOpenAICompatible({
      apiKey: key,
      baseURL: nvidiaBaseURL || process.env.NVIDIA_BASE_URL || DEFAULT_NVIDIA_BASE_URL,
      name: 'nvidia',
    }).chatModel(model || process.env.NVIDIA_MODEL || DEFAULT_NVIDIA_MODEL);
  }

  const key = apiKey || process.env.AI_GATEWAY_API_KEY;
  if (!key) return null;

  return createGateway({ apiKey: key })(normalizeGatewayModel(model));
}
