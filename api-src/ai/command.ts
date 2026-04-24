import { createGateway } from '@ai-sdk/gateway';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { type LanguageModel, generateText } from 'ai';

type ToolName = 'comment' | 'edit' | 'generate';

type ModelProviderResolver = ((modelId?: string) => LanguageModel) & {
  defaultModel: string;
  reasoningModel: string;
};

const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_REASONING_MODEL = 'google/gemini-2.5-flash';
const DEFAULT_NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_NVIDIA_MODEL = 'nvidia/llama-3.1-nemotron-ultra-253b-v1';
const MAX_CONTEXT_CHARS = 12000;

export const config = { maxDuration: 60 };

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const {
      apiKey: key,
      ctx,
      messages: messagesRaw = [],
      model,
      nvidiaApiKey,
      nvidiaBaseURL,
      provider,
    } = await readJson(req);

    if (!ctx?.children) {
      return sendJson(res, 400, { error: 'Missing editor context.' });
    }

    const modelProvider = resolveModelProvider({
      apiKey: key,
      model,
      nvidiaApiKey,
      nvidiaBaseURL,
      provider,
    });

    if (!modelProvider) {
      return sendJson(res, 401, {
        error: provider === 'nvidia' ? 'Missing NVIDIA NIM API key.' : 'Missing AI Gateway API key.',
      });
    }

    const toolName = normalizeToolName(ctx.toolName, messagesRaw);
    const prompt = buildPrompt({
      documentText: extractDocumentText(ctx.children),
      instruction: extractLatestUserText(messagesRaw),
      isSelecting: Boolean(ctx.selection),
      toolName,
    });

    const { text } = await generateText({
      model: modelProvider(toolName === 'edit' ? modelProvider.reasoningModel : modelProvider.defaultModel),
      prompt,
      temperature: toolName === 'edit' ? 0.2 : 0.5,
    });

    return sendUiTextStream(res, text, toolName);
  } catch (error) {
    console.error('AI command failed:', error);
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Failed to process AI request',
    });
  }
}

function buildPrompt({
  documentText,
  instruction,
  isSelecting,
  toolName,
}: {
  documentText: string;
  instruction: string;
  isSelecting: boolean;
  toolName: ToolName;
}) {
  const scope = isSelecting ? '선택된 영역 또는 현재 문맥' : '현재 문서 전체 문맥';
  const userInstruction = instruction || defaultInstruction(toolName);

  if (toolName === 'edit') {
    return [
      '당신은 한국어 업무 문서를 다듬는 편집자입니다.',
      `${scope}을 사용자의 요청에 맞게 수정하세요.`,
      '결과만 마크다운으로 반환하고, 설명/머리말/따옴표는 붙이지 마세요.',
      '',
      `사용자 요청:\n${userInstruction}`,
      '',
      `문서 내용:\n${documentText || '(비어 있음)'}`,
    ].join('\n');
  }

  if (toolName === 'comment') {
    return [
      '당신은 공공/제조 업무 문서를 검토하는 리뷰어입니다.',
      `${scope}에서 보완할 점, 확인할 점, 다음 액션을 짧고 실무적으로 제안하세요.`,
      '한국어로 작성하고, 필요하면 bullet list를 사용하세요.',
      '',
      `사용자 요청:\n${userInstruction}`,
      '',
      `문서 내용:\n${documentText || '(비어 있음)'}`,
    ].join('\n');
  }

  return [
    '당신은 한국어 업무 문서를 작성하는 어시스턴트입니다.',
    `${scope}을 바탕으로 사용자가 바로 붙여 넣어 쓸 수 있는 내용을 작성하세요.`,
    '결과만 마크다운으로 반환하고 불필요한 설명은 줄이세요.',
    '',
    `사용자 요청:\n${userInstruction}`,
    '',
    `문서 내용:\n${documentText || '(비어 있음)'}`,
  ].join('\n');
}

function defaultInstruction(toolName: ToolName) {
  if (toolName === 'edit') return '문장을 자연스럽고 명확한 업무 문서 톤으로 다듬어 주세요.';
  if (toolName === 'comment') return '문서에서 보완할 점을 검토해 주세요.';
  return '이어서 작성해 주세요.';
}

function extractDocumentText(children: unknown) {
  return normalizeWhitespace(extractText(children)).slice(0, MAX_CONTEXT_CHARS);
}

function extractText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    return value.map(extractText).filter(Boolean).join('\n');
  }

  if (typeof value === 'object') {
    const node = value as { children?: unknown; text?: unknown; type?: unknown; url?: unknown };

    if (typeof node.text === 'string') return node.text;

    const childText = extractText(node.children);

    if (typeof node.url === 'string' && childText) {
      return `${childText} (${node.url})`;
    }

    return childText;
  }

  return '';
}

function normalizeWhitespace(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractLatestUserText(messages: unknown) {
  if (!Array.isArray(messages)) return '';

  for (const message of [...messages].reverse()) {
    const text = extractMessageText(message);
    if (text) return text;
  }

  return '';
}

function extractMessageText(message: unknown): string {
  if (!message || typeof message !== 'object') return '';

  const data = message as {
    content?: unknown;
    parts?: unknown;
  };

  if (typeof data.content === 'string') return data.content.trim();

  if (Array.isArray(data.content)) {
    return data.content.map(extractMessageText).filter(Boolean).join('\n').trim();
  }

  if (Array.isArray(data.parts)) {
    return data.parts
      .map((part) => {
        if (!part || typeof part !== 'object') return '';
        const typedPart = part as { text?: unknown; type?: unknown };
        return typedPart.type === 'text' && typeof typedPart.text === 'string' ? typedPart.text : '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  return '';
}

function normalizeToolName(rawToolName: unknown, messages: unknown): ToolName {
  if (rawToolName === 'comment' || rawToolName === 'edit' || rawToolName === 'generate') {
    return rawToolName;
  }

  const instruction = extractLatestUserText(messages).toLowerCase();

  if (/(수정|다듬|고쳐|rewrite|edit|change)/i.test(instruction)) return 'edit';
  if (/(검토|의견|코멘트|comment|review)/i.test(instruction)) return 'comment';

  return 'generate';
}

function sendUiTextStream(res: any, text: string, toolName: ToolName) {
  const messageId = `msg_${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  const chunks = [
    { type: 'start' },
    { type: 'start-step' },
    { data: toolName, type: 'data-toolName' },
    {
      id: messageId,
      providerMetadata: { openai: { itemId: messageId } },
      type: 'text-start',
    },
    ...splitForStream(text || '').map((delta) => ({
      delta,
      id: messageId,
      type: 'text-delta',
    })),
    { id: messageId, type: 'text-end' },
    { type: 'finish-step' },
    { type: 'finish' },
  ];

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Vercel-AI-UI-Message-Stream', 'v1');

  for (const chunk of chunks) {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }

  res.end('data: [DONE]\n\n');
}

function splitForStream(text: string) {
  if (!text) return [''];

  const chunks: string[] = [];
  const size = 120;

  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }

  return chunks;
}

function resolveModelProvider({
  apiKey,
  model,
  nvidiaApiKey,
  nvidiaBaseURL,
  provider,
}: {
  apiKey?: string;
  model?: string;
  nvidiaApiKey?: string;
  nvidiaBaseURL?: string;
  provider?: string;
}): ModelProviderResolver | null {
  if (provider === 'nvidia' || process.env.AI_PROVIDER === 'nvidia') {
    const key = nvidiaApiKey || process.env.NVIDIA_API_KEY;
    if (!key) return null;

    const nvidia = createOpenAICompatible({
      apiKey: key,
      baseURL: nvidiaBaseURL || process.env.NVIDIA_BASE_URL || DEFAULT_NVIDIA_BASE_URL,
      name: 'nvidia',
    });
    const defaultModel =
      provider === 'nvidia' || model?.startsWith('nvidia/')
        ? model || process.env.NVIDIA_MODEL || DEFAULT_NVIDIA_MODEL
        : process.env.NVIDIA_MODEL || DEFAULT_NVIDIA_MODEL;
    const resolver = ((modelId?: string) => nvidia.chatModel(modelId || defaultModel)) as ModelProviderResolver;
    resolver.defaultModel = defaultModel;
    resolver.reasoningModel = defaultModel;
    return resolver;
  }

  const key = apiKey || process.env.AI_GATEWAY_API_KEY;
  if (!key) return null;

  const gatewayProvider = createGateway({ apiKey: key });
  const resolver = ((modelId?: string) => gatewayProvider(modelId || DEFAULT_MODEL)) as ModelProviderResolver;
  resolver.defaultModel = model || DEFAULT_MODEL;
  resolver.reasoningModel = model || DEFAULT_REASONING_MODEL;
  return resolver;
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
