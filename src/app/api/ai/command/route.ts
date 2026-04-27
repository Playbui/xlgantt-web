import type {
  ChatMessage,
  ToolName,
} from '@/components/use-chat';
import type { NextRequest } from 'next/server';

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import {
  type LanguageModel,
  type UIMessageStreamWriter,
  createUIMessageStream,
  createUIMessageStreamResponse,
  Output,
  streamText,
  tool,
} from 'ai';
import { NextResponse } from 'next/server';
import { type SlateEditor, createSlateEditor, nanoid } from 'platejs';
import { z } from 'zod';

import { BaseEditorKit } from '@/components/editor-base-kit';
import { markdownJoinerTransform } from '@/lib/markdown-joiner-transform';

import {
  buildEditTableMultiCellPrompt,
  getCommentPrompt,
  getEditPrompt,
  getGeneratePrompt,
} from './prompt';

const DEFAULT_NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_NVIDIA_MODEL = 'qwen/qwen3.5-397b-a17b';
const KOREAN_CHAT_SYSTEM_PROMPT = [
  '/no_think',
  'You are a fluent Korean writing and editing assistant for a Korean business document editor.',
  'Respond in natural Korean unless the user explicitly asks for another language.',
  'Keep Korean source text in Korean. Do not translate Korean requests into English.',
  'For writing tasks, produce polished Korean with clear, professional phrasing.',
].join('\n');

export async function POST(req: NextRequest) {
  const {
    ctx,
    messages: messagesRaw,
    model,
    nvidiaApiKey,
    nvidiaBaseURL,
  } = await req.json();

  const { children, selection, toolName: toolNameParam } = ctx;

  const editor = createSlateEditor({
    plugins: BaseEditorKit,
    selection,
    value: children,
  });

  const apiKey = nvidiaApiKey || process.env.NVIDIA_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing NVIDIA NIM API key.' },
      { status: 401 }
    );
  }

  const isSelecting = editor.api.isExpanded();

  const nvidiaProvider = createOpenAICompatible({
    apiKey,
    baseURL: nvidiaBaseURL || process.env.NVIDIA_BASE_URL || DEFAULT_NVIDIA_BASE_URL,
    name: 'nvidia',
    supportsStructuredOutputs: true,
  });
  const nvidiaModel = resolveNvidiaModel(model);

  try {
    const stream = createUIMessageStream<ChatMessage>({
      execute: async ({ writer }) => {
        let toolName = toolNameParam;

        if (!toolName) {
          const AIToolName = chooseToolNameLocally({
            isSelecting,
            messages: messagesRaw,
          });

          writer.write({
            data: AIToolName as ToolName,
            type: 'data-toolName',
          });

          toolName = AIToolName;
        }

        const stream = streamText({
          experimental_transform: markdownJoinerTransform(),
          model: nvidiaProvider.chatModel(nvidiaModel),
          // Not used
          prompt: '',
          system: KOREAN_CHAT_SYSTEM_PROMPT,
          tools: {
            comment: getCommentTool(editor, {
              messagesRaw,
              model: nvidiaProvider.chatModel(nvidiaModel),
              writer,
            }),
            table: getTableTool(editor, {
              messagesRaw,
              model: nvidiaProvider.chatModel(nvidiaModel),
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

              // Table editing uses the table tool
              if (editType === 'table') {
                return {
                  ...step,
                  toolChoice: { toolName: 'table', type: 'tool' },
                };
              }

              return {
                ...step,
                activeTools: [],
                model:
                  editType === 'selection'
                    ? nvidiaProvider.chatModel(nvidiaModel)
                    : nvidiaProvider.chatModel(nvidiaModel),
                messages: [
                  {
                    content: editPrompt,
                    role: 'user',
                  },
                ],
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
                messages: [
                  {
                    content: generatePrompt,
                    role: 'user',
                  },
                ],
                model: nvidiaProvider.chatModel(nvidiaModel),
              };
            }
          },
        });

        writer.merge(stream.toUIMessageStream({ sendFinish: false }));
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch {
    return NextResponse.json(
      { error: 'Failed to process AI request' },
      { status: 500 }
    );
  }
}

function resolveNvidiaModel(requestedModel?: string) {
  const candidates = [requestedModel, process.env.NVIDIA_MODEL, DEFAULT_NVIDIA_MODEL];

  return candidates.find(isAllowedNimChatModel) || DEFAULT_NVIDIA_MODEL;
}

function isAllowedNimChatModel(candidate?: string) {
  if (!candidate) return false;

  return /^(nvidia|qwen|meta|mistral|mistralai|deepseek)\//.test(candidate);
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
          const comment = partialArray[i];
          const commentDataId = nanoid();

          writer.write({
            id: commentDataId,
            data: {
              comment,
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
          const cellUpdate = partialArray[i];

          writer.write({
            id: nanoid(),
            data: {
              cellUpdate,
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
