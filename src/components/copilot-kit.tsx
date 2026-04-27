'use client';

import type { TElement } from 'platejs';

import { CopilotPlugin } from '@platejs/ai/react';
import { serializeMd, stripMarkdown } from '@platejs/markdown';

import { GhostText } from '@/components/ui/ghost-text';

import { MarkdownKit } from './markdown-kit';

export const CopilotKit = [
  ...MarkdownKit,
  CopilotPlugin.configure(({ api }) => ({
    options: {
      completeOptions: {
        api: '/api/ai/copilot',
        body: {
          system: `너는 문서 편집기의 한국어 인라인 자동완성 엔진이다.

규칙:
- 현재 작성 중인 문장이 미완성일 때만 바로 이어질 짧은 한국어 조각을 제안한다.
- 새 문장, 새 주제, 요약, 전략, 미션, 의견, 설명을 만들지 않는다.
- 이미 문장이 자연스럽게 끝났거나 문장부호로 끝났거나 이어질 말이 확실하지 않으면 "0"만 반환한다.
- 원문을 반복하지 않는다.
- 마크다운, 번호, 목록, 따옴표, 줄바꿈을 쓰지 않는다.
- 응답은 반드시 같은 블록 안에 붙을 텍스트만 포함한다.`,
        },
        onError: () => {
          api.copilot.setBlockSuggestion({ text: '' });
        },
        onFinish: (_, completion) => {
          const text = stripMarkdown(completion)
            .replace(/\s+/g, ' ')
            .trim();

          if (!text || text === '0') return;

          api.copilot.setBlockSuggestion({
            text,
          });
        },
      },
      debounceDelay: 500,
      renderGhostText: GhostText,
      getPrompt: ({ editor }) => {
        const contextEntry = editor.api.block({ highest: true });

        if (!contextEntry) return '';

        const context = serializeMd(editor, {
          value: [contextEntry[0] as TElement],
        }).trim();

        if (!context) return '';

        return `현재 커서가 있는 블록의 텍스트다. 마지막 문장이 아직 끝나지 않았을 때만 바로 뒤에 붙을 짧은 한국어 조각을 반환하라. 이미 끝난 문장이면 0만 반환하라.
"""
${context}
"""`;
      },
    },
    shortcuts: {
      accept: {
        keys: 'tab',
      },
      acceptNextWord: {
        keys: 'mod+right',
      },
      reject: {
        keys: 'escape',
      },
      triggerSuggestion: {
        keys: 'ctrl+space',
      },
    },
  })),
];
