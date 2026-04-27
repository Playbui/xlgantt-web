import { createGateway } from '@ai-sdk/gateway';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import {
  type LanguageModel,
  type UIMessage,
  type UIMessageStreamWriter,
  createUIMessageStream,
  createUIMessageStreamResponse,
  Output,
  streamText,
  tool,
} from 'ai';
import { type SlateEditor, createSlateEditor, nanoid } from 'platejs';
import { z } from 'zod';

import { BaseEditorKit } from '../../src/components/editor-base-kit';
import { markdownJoinerTransform } from '../../src/lib/markdown-joiner-transform';
import {
  buildEditTableMultiCellPrompt,
  getCommentPrompt,
  getEditPrompt,
  getGeneratePrompt,
} from '../../src/app/api/ai/command/prompt';

type ToolName = 'comment' | 'edit' | 'generate';

type TComment = {
  comment: {
    blockId: string;
    comment: string;
    content: string;
  } | null;
  status: 'finished' | 'streaming';
};

type TTableCellUpdate = {
  cellUpdate: {
    content: string;
    id: string;
  } | null;
  status: 'finished' | 'streaming';
};

type MessageDataPart = {
  toolName: ToolName;
  comment?: TComment;
  table?: TTableCellUpdate;
};

type ChatMessage = UIMessage<{}, MessageDataPart>;

const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_REASONING_MODEL = 'google/gemini-2.5-flash';
const DEFAULT_NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_NVIDIA_MODEL = 'nvidia/llama-3.1-nemotron-ultra-253b-v1';

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

    const { children, selection, toolName: toolNameParam } = ctx;
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

    const editor = createSlateEditor({
      plugins: BaseEditorKit,
      selection,
      value: children,
    });
    const isSelecting = editor.api.isExpanded();

    const stream = createUIMessageStream<ChatMessage>({
      execute: async ({ writer }) => {
        let toolName = toolNameParam as ToolName | undefined;

        if (!toolName) {
          const aiToolName = chooseToolNameLocally({
            isSelecting,
            messages: messagesRaw,
          });

          writer.write({
            data: aiToolName,
            type: 'data-toolName',
          });

          toolName = aiToolName;
        }

        const textStream = streamText({
          experimental_transform: markdownJoinerTransform(),
          model: modelProvider(modelProvider.defaultModel),
          prompt: '',
          tools: {
            comment: getCommentTool(editor, {
              messagesRaw,
              model: modelProvider(modelProvider.reasoningModel),
              writer,
            }),
            table: getTableTool(editor, {
              messagesRaw,
              model: modelProvider(modelProvider.reasoningModel),
              writer,
            }),
          },
          prepareStep: async (step) => {
            if (toolName === 'comment') {
              return {
                ...step,
                toolChoice: { toolName: 'comment', type: 'tool' },
              };
            }

            if (toolName === 'edit') {
              const [editPrompt, editType] = getEditPrompt(editor, {
                isSelecting,
                messages: messagesRaw,
              });

              if (editType === 'table') {
                return {
                  ...step,
                  toolChoice: { toolName: 'table', type: 'tool' },
                };
              }

              return {
                ...step,
                activeTools: [],
                messages: [{ content: editPrompt, role: 'user' }],
                model:
                  editType === 'selection'
                    ? modelProvider(modelProvider.reasoningModel)
                    : modelProvider(modelProvider.defaultModel),
              };
            }

            if (toolName === 'generate') {
              const generatePrompt = getGeneratePrompt(editor, {
                isSelecting,
                messages: messagesRaw,
              });

              return {
                ...step,
                activeTools: [],
                messages: [{ content: generatePrompt, role: 'user' }],
                model: modelProvider(modelProvider.defaultModel),
              };
            }
          },
        });

        writer.merge(textStream.toUIMessageStream({ sendFinish: false }));
      },
    });

    return sendWebResponse(res, createUIMessageStreamResponse({ stream }));
  } catch (error) {
    console.error('AI command failed:', error);
    return sendJson(res, 500, { error: 'Failed to process AI request' });
  }
}

function chooseToolNameLocally({
  isSelecting,
  messages,
}: {
  isSelecting: boolean;
  messages: ChatMessage[];
}): ToolName {
  const instruction = getLastUserText(messages).toLowerCase();

  if (
    /\b(comment|comments|feedback|review|annotate|annotation)\b/.test(instruction) ||
    /(댓글|코멘트|피드백|검토|리뷰|첨삭)/.test(instruction)
  ) {
    return 'comment';
  }

  if (
    isSelecting &&
    (/\b(fix|rewrite|improve|shorten|expand|translate|simplify|correct|polish|grammar|spelling)\b/.test(
      instruction
    ) ||
      /(고쳐|수정|교정|개선|다듬|번역|짧게|줄여|늘려|확장|간단히|맞춤법|문법)/.test(instruction))
  ) {
    return 'edit';
  }

  return 'generate';
}

function getLastUserText(messages: ChatMessage[]) {
  const message = [...messages].reverse().find((item) => item.role === 'user');

  return (
    message?.parts
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join(' ') || ''
  );
}

type ModelProviderResolver = ((modelId?: string) => LanguageModel) & {
  defaultModel: string;
  reasoningModel: string;
};

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
      supportsStructuredOutputs: true,
    });
    const defaultModel = resolveNvidiaModel(model);
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

function resolveNvidiaModel(requestedModel?: string) {
  const candidates = [requestedModel, process.env.NVIDIA_MODEL, DEFAULT_NVIDIA_MODEL];

  return candidates.find((candidate) => candidate?.startsWith('nvidia/')) || DEFAULT_NVIDIA_MODEL;
}

const getCommentTool = (
  editor: SlateEditor,
  {
    messagesRaw,
    model,
    writer,
  }: {
    messagesRaw: ChatMessage[];
    model: LanguageModel;
    writer: UIMessageStreamWriter<ChatMessage>;
  }
) =>
  tool({
    description: 'Comment on the content',
    inputSchema: z.object({}),
    strict: true,
    execute: async () => {
      const commentSchema = z.object({
        blockId: z
          .string()
          .describe(
            'The id of the starting block. If the comment spans multiple blocks, use the id of the first block.'
          ),
        comment: z
          .string()
          .describe('A brief comment or explanation for this fragment.'),
        content: z
          .string()
          .describe(
            String.raw`The original document fragment to be commented on.It can be the entire block, a small part within a block, or span multiple blocks. If spanning multiple blocks, separate them with two \n\n.`
          ),
      });

      const { partialOutputStream } = streamText({
        model,
        output: Output.array({ element: commentSchema }),
        prompt: getCommentPrompt(editor, {
          messages: messagesRaw,
        }),
      });

      let lastLength = 0;

      for await (const partialArray of partialOutputStream) {
        for (let i = lastLength; i < partialArray.length; i++) {
          writer.write({
            id: nanoid(),
            data: {
              comment: partialArray[i],
              status: 'streaming',
            },
            type: 'data-comment',
          });
        }

        lastLength = partialArray.length;
      }

      writer.write({
        id: nanoid(),
        data: {
          comment: null,
          status: 'finished',
        },
        type: 'data-comment',
      });
    },
  });

const getTableTool = (
  editor: SlateEditor,
  {
    messagesRaw,
    model,
    writer,
  }: {
    messagesRaw: ChatMessage[];
    model: LanguageModel;
    writer: UIMessageStreamWriter<ChatMessage>;
  }
) =>
  tool({
    description: 'Edit table cells',
    inputSchema: z.object({}),
    strict: true,
    execute: async () => {
      const cellUpdateSchema = z.object({
        content: z
          .string()
          .describe(
            String.raw`The new content for the cell. Can contain multiple paragraphs separated by \n\n.`
          ),
        id: z.string().describe('The id of the table cell to update.'),
      });

      const { partialOutputStream } = streamText({
        model,
        output: Output.array({ element: cellUpdateSchema }),
        prompt: buildEditTableMultiCellPrompt(editor, messagesRaw),
      });

      let lastLength = 0;

      for await (const partialArray of partialOutputStream) {
        for (let i = lastLength; i < partialArray.length; i++) {
          writer.write({
            id: nanoid(),
            data: {
              cellUpdate: partialArray[i],
              status: 'streaming',
            },
            type: 'data-table',
          });
        }

        lastLength = partialArray.length;
      }

      writer.write({
        id: nanoid(),
        data: {
          cellUpdate: null,
          status: 'finished',
        },
        type: 'data-table',
      });
    },
  });

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

async function sendWebResponse(res: any, response: Response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));

  if (!response.body) {
    res.end();
    return;
  }

  const reader = response.body.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      res.write(Buffer.from(value));
    }
  } finally {
    res.end();
  }
}
