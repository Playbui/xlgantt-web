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
        size === 'icon' ? 'h-8 w-8' : 'h-8 px-2 text-xs font-bold',
        'border border-transparent text-slate-600 hover:bg-white hover:text-slate-900 data-[active=true]:border-slate-300 data-[active=true]:bg-white data-[active=true]:text-primary data-[active=true]:shadow-sm',
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
    immediatelyRender: false,
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
    editorProps: {
      attributes: {
        class: cn(
          'min-h-full max-w-none px-4 py-3 text-[15px] leading-7 text-slate-800 outline-none',
          'prose prose-sm prose-slate max-w-none',
          'prose-p:my-2 prose-headings:font-semibold prose-headings:text-slate-950',
          'prose-h1:mt-5 prose-h1:mb-3 prose-h1:text-[1.7rem]',
          'prose-h2:mt-4 prose-h2:mb-2 prose-h2:text-[1.35rem]',
          'prose-h3:mt-3 prose-h3:mb-2 prose-h3:text-[1.1rem]',
          'prose-ul:my-3 prose-ul:list-disc prose-ul:pl-6',
          'prose-ol:my-3 prose-ol:list-decimal prose-ol:pl-6',
          'prose-li:my-1',
          'prose-hr:my-5 prose-hr:border-slate-300',
          'prose-table:my-4 prose-table:w-full prose-table:border-collapse',
          'prose-th:border prose-th:border-slate-300 prose-th:bg-slate-100 prose-th:px-3 prose-th:py-2 prose-th:text-left',
          'prose-td:border prose-td:border-slate-300 prose-td:px-3 prose-td:py-2',
          'prose-img:my-3 prose-img:rounded-xl prose-img:border prose-img:border-slate-200',
          'before:pointer-events-none before:float-left before:h-0 before:text-slate-400 before:content-[attr(data-placeholder)]',
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
    <div className={cn('rounded-lg border border-slate-300 bg-background shadow-[0_1px_2px_rgba(15,23,42,0.04)]', className)}>
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-300 bg-slate-50 px-2 py-2">
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

        <div className="mx-1 h-4 w-px bg-slate-300" />

        <ToolbarButton title="굵게" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="기울임" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="밑줄" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-slate-300" />

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
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-slate-600 hover:bg-white hover:text-slate-900">
            <ImagePlus className="h-4 w-4" />
          </span>
        </label>

        <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>이미지 드래그, 붙여넣기, 표 삽입 지원</span>
        </div>
      </div>

      <div className="relative">
        <EditorContent editor={editor} className="min-h-[inherit] [&_.ProseMirror]:min-h-[inherit]" />
      </div>
    </div>
  )
}
