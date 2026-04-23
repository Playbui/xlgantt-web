import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableRow } from '@tiptap/extension-table-row'
import Underline from '@tiptap/extension-underline'
import { Bold, Heading1, Heading2, Heading3, ImagePlus, Italic, List, ListOrdered, Minus, Pilcrow, Table2, Underline as UnderlineIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface RichContentEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  minHeight?: number
  fontSize?: number
  onUploadImages?: (files: File[]) => Promise<string[]>
}

interface ToolbarButtonProps {
  active?: boolean
  title: string
  onClick: () => void
  children: ReactNode
  size?: 'icon' | 'sm'
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function escapeHtml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function normalizeHtml(html: string) {
  return html.replace(/\s+/g, ' ').trim()
}

function ToolbarButton({ active = false, title, onClick, children, size = 'icon' }: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      title={title}
      aria-label={title}
      data-active={active ? 'true' : 'false'}
      className={cn(
        size === 'icon' ? 'h-8 w-8 rounded-lg' : 'h-8 rounded-lg px-2.5 text-xs font-semibold',
        'border border-transparent text-slate-500 transition-colors hover:border-slate-200 hover:bg-white hover:text-slate-900',
        'data-[active=true]:border-slate-300 data-[active=true]:bg-white data-[active=true]:text-slate-950 data-[active=true]:shadow-[0_1px_2px_rgba(15,23,42,0.08)]',
      )}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

export function RichContentEditor({
  value,
  onChange,
  placeholder = '내용을 입력하세요',
  className,
  minHeight = 360,
  fontSize = 15,
  onUploadImages,
}: RichContentEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value || '',
    editable: true,
    editorProps: {
      attributes: {
        class: cn(
          'min-h-full max-w-none px-7 py-6 text-[15px] leading-7 text-slate-800 outline-none',
          'prose prose-sm prose-slate max-w-none',
          'prose-p:my-2.5 prose-p:text-[15px] prose-p:leading-7 prose-headings:font-semibold prose-headings:tracking-[-0.02em] prose-headings:text-slate-950',
          'prose-h1:mt-7 prose-h1:mb-3 prose-h1:border-b prose-h1:border-slate-200 prose-h1:pb-2 prose-h1:text-[1.85rem]',
          'prose-h2:mt-6 prose-h2:mb-2 prose-h2:text-[1.4rem]',
          'prose-h3:mt-4 prose-h3:mb-2 prose-h3:text-[1.1rem] prose-h3:text-slate-800',
          'prose-strong:text-slate-950 prose-code:rounded prose-code:bg-slate-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.9em] prose-code:text-slate-700',
          'prose-ul:my-3 prose-ul:list-disc prose-ul:pl-6 prose-ul:marker:text-slate-400',
          'prose-ol:my-3 prose-ol:list-decimal prose-ol:pl-6 prose-ol:marker:text-slate-400',
          'prose-li:my-1.5 prose-li:pl-1',
          'prose-blockquote:my-4 prose-blockquote:border-l-4 prose-blockquote:border-slate-300 prose-blockquote:bg-slate-50 prose-blockquote:px-4 prose-blockquote:py-2 prose-blockquote:text-slate-700',
          'prose-hr:my-6 prose-hr:border-slate-200',
          'prose-table:my-5 prose-table:w-full prose-table:border-collapse prose-table:overflow-hidden prose-table:rounded-xl',
          'prose-th:border prose-th:border-slate-200 prose-th:bg-slate-100 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:text-[12px] prose-th:font-semibold prose-th:text-slate-600',
          'prose-td:border prose-td:border-slate-200 prose-td:px-3 prose-td:py-2 prose-td:align-top',
          'prose-img:my-4 prose-img:rounded-2xl prose-img:border prose-img:border-slate-200 prose-img:shadow-[0_10px_25px_rgba(15,23,42,0.08)]',
          'before:pointer-events-none before:float-left before:h-0 before:text-slate-400 before:content-[attr(data-placeholder)]',
          'cursor-text',
        ),
        style: `min-height:${minHeight}px; font-size:${fontSize}px;`,
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files || []).filter((file) => file.type.startsWith('image/'))
        if (files.length === 0) return false

        void (async () => {
          await insertImageFromFiles(files)
        })()
        return true
      },
      handleDrop: (_view, event) => {
        const files = Array.from(event.dataTransfer?.files || []).filter((file) => file.type.startsWith('image/'))
        if (files.length === 0) return false

        void (async () => {
          await insertImageFromFiles(files)
        })()
        return true
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.isEmpty ? '' : currentEditor.getHTML())
    },
  })

  useEffect(() => {
    if (!editor) return

    const nextValue = value || ''
    const currentValue = editor.isEmpty ? '' : editor.getHTML()
    if (normalizeHtml(currentValue) !== normalizeHtml(nextValue)) {
      editor.commands.setContent(nextValue, { emitUpdate: false })
    }
  }, [editor, value])

  useEffect(() => {
    if (!editor) return

    editor.setEditable(true)
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: {
          ...editor.options.editorProps?.attributes,
          style: `min-height:${minHeight}px; font-size:${fontSize}px;`,
        },
      },
    })
  }, [editor, fontSize, minHeight])

  const insertImageFromFiles = async (files: File[]) => {
    if (!editor) return

    for (const file of files) {
      let src = ''
      if (onUploadImages) {
        try {
          const uploaded = await onUploadImages([file])
          src = uploaded[0] || ''
        } catch {
          src = ''
        }
      }

      if (!src) {
        src = await readFileAsDataUrl(file)
      }

      editor
        .chain()
        .focus()
        .setImage({
          src,
          alt: escapeHtml(file.name),
          title: file.name,
        })
        .createParagraphNear()
        .run()
    }
  }

  if (!editor) {
    return <div className={cn('rounded-lg border border-slate-300 bg-background', className)} />
  }

  return (
    <div className={cn('overflow-hidden rounded-[20px] border border-slate-300 bg-[linear-gradient(180deg,#fdfefe_0%,#fafcff_100%)] shadow-[0_10px_30px_rgba(15,23,42,0.06)]', className)}>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-[linear-gradient(180deg,#f7f9fc_0%,#f2f5f9_100%)] px-3 py-2.5">
        <ToolbarButton title="본문" size="sm" active={editor.isActive('paragraph')} onClick={() => editor.chain().focus().setParagraph().run()}>
          <Pilcrow className="mr-1 h-3.5 w-3.5" />
          본문
        </ToolbarButton>
        <ToolbarButton title="제목 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="제목 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="제목 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-slate-200" />

        <ToolbarButton title="굵게" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="기울임" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="밑줄" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-slate-200" />

        <ToolbarButton title="글머리표" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="번호 목록" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="표 삽입"
          active={editor.isActive('table')}
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
        >
          <Table2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="구분선" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus className="h-4 w-4" />
        </ToolbarButton>

        <label className="inline-flex cursor-pointer items-center justify-center">
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={async (e) => {
              const files = Array.from(e.target.files || []).filter((file) => file.type.startsWith('image/'))
              if (files.length === 0) return
              await insertImageFromFiles(files)
              e.currentTarget.value = ''
            }}
          />
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-slate-500 transition-colors hover:border-slate-200 hover:bg-white hover:text-slate-900">
            <ImagePlus className="h-4 w-4" />
          </span>
        </label>

        <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-500">
          <span className="hidden rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 md:inline-flex">문서형 편집</span>
          <span>이미지 드래그, 붙여넣기, 표 삽입 지원</span>
        </div>
      </div>

      <div
        className="relative bg-[radial-gradient(circle_at_top,#ffffff_0%,#fbfcfe_40%,#f8fafc_100%)]"
        onMouseDown={(e) => {
          const target = e.target as HTMLElement
          if (target.closest('button,input,label,a')) return
          requestAnimationFrame(() => {
            editor.chain().focus().run()
          })
        }}
      >
        <EditorContent
          editor={editor}
          className="min-h-[inherit] cursor-text [&_.ProseMirror]:min-h-[560px] [&_.ProseMirror]:cursor-text"
        />
      </div>
    </div>
  )
}
