import { createGateway } from '@ai-sdk/gateway';
import { generateText } from 'ai';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const {
      apiKey: key,
      model = 'openai/gpt-4o-mini',
      prompt,
      system,
    } = await readJson(req);
    const apiKey = key || process.env.AI_GATEWAY_API_KEY;

    if (!apiKey) {
      return sendJson(res, 401, { error: 'Missing AI Gateway API key.' });
    }

    const gatewayProvider = createGateway({ apiKey });
    const result = await generateText({
      maxOutputTokens: 50,
      model: gatewayProvider(normalizeGatewayModel(model)),
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
