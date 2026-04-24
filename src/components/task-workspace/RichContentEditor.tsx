import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import { Plate, ParagraphPlugin, createPlateEditor, usePlateEditor } from 'platejs/react'
import { deserializeHtml, type Value } from 'platejs'
import { serializeHtml } from 'platejs/static'
import { BlockquotePlugin, BoldPlugin, H1Plugin, H2Plugin, H3Plugin, HorizontalRulePlugin, ItalicPlugin, UnderlinePlugin } from '@platejs/basic-nodes/react'
import { ListPlugin } from '@platejs/list/react'
import { toggleList } from '@platejs/list'
import { TableCellHeaderPlugin, TableCellPlugin, TablePlugin, TableRowPlugin } from '@platejs/table/react'
import { ImagePlugin, insertMedia } from '@platejs/media/react'
import { insertImage } from '@platejs/media'
import { Bold, Heading1, Heading2, Heading3, ImagePlus, Italic, List, ListOrdered, Minus, Pilcrow, Quote, Table2, Underline as UnderlineIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Editor, EditorContainer } from '@/components/ui/editor'
import { BlockquoteElement } from '@/components/ui/blockquote-node'
import { H1Element, H2Element, H3Element } from '@/components/ui/heading-node'
import { HrElement } from '@/components/ui/hr-node'
import { ParagraphElement } from '@/components/ui/paragraph-node'
import { isRichTextEmpty, normalizeRichTextHtml } from '@/lib/rich-text'
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

const EDITOR_PLUGINS = [
  ParagraphPlugin.withComponent(ParagraphElement),
  BoldPlugin,
  ItalicPlugin,
  UnderlinePlugin,
  H1Plugin.configure({
    node: {
      component: H1Element,
    },
  }),
  H2Plugin.configure({
    node: {
      component: H2Element,
    },
  }),
  H3Plugin.configure({
    node: {
      component: H3Element,
    },
  }),
  BlockquotePlugin.configure({
    node: {
      component: BlockquoteElement,
    },
  }),
  HorizontalRulePlugin.configure({
    node: {
      component: HrElement,
    },
  }),
  ListPlugin,
  TablePlugin,
  TableRowPlugin,
  TableCellPlugin,
  TableCellHeaderPlugin,
  ImagePlugin,
]

function createEditorValue(html: string) {
  const editor = createPlateEditor({ plugins: EDITOR_PLUGINS })
  return deserializeHtml(editor, { element: html || '<p></p>' }) as Value
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
  const normalizedValue = normalizeRichTextHtml(value)
  const lastSyncedValueRef = useRef(normalizedValue)
  const syncLockRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const plugins = useMemo(() => EDITOR_PLUGINS, [])

  const editor = usePlateEditor({
    plugins,
    value: createEditorValue(value || '<p></p>'),
  })

  useEffect(() => {
    if (!editor) return
    if (syncLockRef.current) {
      syncLockRef.current = false
      return
    }

    const nextValue = normalizeRichTextHtml(value)
    if (nextValue === lastSyncedValueRef.current) return

    editor.tf.setValue(createEditorValue(value || '<p></p>'))
    lastSyncedValueRef.current = nextValue
  }, [editor, value])

  const handleValueChange = ({ editor: currentEditor }: { editor: typeof editor }) => {
    void (async () => {
      const html = await serializeHtml(currentEditor)
      const nextValue = isRichTextEmpty(html) ? '' : normalizeRichTextHtml(html)
      if (nextValue === lastSyncedValueRef.current) return

      syncLockRef.current = true
      lastSyncedValueRef.current = nextValue
      onChange(nextValue)
    })()
  }

  const handleImageInsert = async (files: File[]) => {
    if (!editor || files.length === 0) return

    if (onUploadImages) {
      const urls = await onUploadImages(files)
      for (const url of urls) {
        if (!url) continue
        insertImage(editor, url)
      }
      return
    }

    const transfer = new DataTransfer()
    files.forEach((file) => transfer.items.add(file))
    insertMedia(editor, transfer.files)
  }

  const isBlockActive = (type: string) => {
    try {
      return !!editor?.api.some({
        match: { type },
      })
    } catch {
      return false
    }
  }

  const isMarkActive = (key: 'bold' | 'italic' | 'underline') => {
    try {
      return !!editor?.api.some({
        match: (_node) => Boolean((editor.api.marks?.() as Record<string, boolean> | null)?.[key]),
      })
    } catch {
      return false
    }
  }

  if (!editor) {
    return <div className={cn('rounded-lg border border-slate-300 bg-background', className)} />
  }

  return (
    <div className={cn('overflow-hidden rounded-[20px] border border-slate-300 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)]', className)}>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-white/95 px-3 py-2.5 backdrop-blur-sm">
        <ToolbarButton title="본문" size="sm" active={isBlockActive('p')} onClick={() => editor.tf.toggleBlock('p')}>
          <Pilcrow className="mr-1 h-3.5 w-3.5" />
          본문
        </ToolbarButton>
        <ToolbarButton title="제목 1" size="sm" active={isBlockActive('h1')} onClick={() => editor.tf.toggleBlock('h1')}>
          <Heading1 className="mr-1 h-4 w-4" />
          H1
        </ToolbarButton>
        <ToolbarButton title="제목 2" size="sm" active={isBlockActive('h2')} onClick={() => editor.tf.toggleBlock('h2')}>
          <Heading2 className="mr-1 h-4 w-4" />
          H2
        </ToolbarButton>
        <ToolbarButton title="제목 3" size="sm" active={isBlockActive('h3')} onClick={() => editor.tf.toggleBlock('h3')}>
          <Heading3 className="mr-1 h-4 w-4" />
          H3
        </ToolbarButton>
        <ToolbarButton title="인용" active={isBlockActive('blockquote')} onClick={() => editor.tf.toggleBlock('blockquote')}>
          <Quote className="h-4 w-4" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-slate-200" />

        <ToolbarButton title="굵게" active={isMarkActive('bold')} onClick={() => editor.tf.toggleMark('bold')}>
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="기울임" active={isMarkActive('italic')} onClick={() => editor.tf.toggleMark('italic')}>
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="밑줄" active={isMarkActive('underline')} onClick={() => editor.tf.toggleMark('underline')}>
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-slate-200" />

        <ToolbarButton title="글머리표" active={isBlockActive('ul')} onClick={() => toggleList(editor, { listStyleType: 'disc' })}>
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="번호 목록" active={isBlockActive('ol')} onClick={() => toggleList(editor, { listStyleType: 'decimal' })}>
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="표 삽입" active={isBlockActive('table')} onClick={() => editor.tf.insert.table({ colCount: 3, rowCount: 3, header: true })}>
          <Table2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="구분선" onClick={() => editor.tf.insertNodes({ type: 'hr', children: [{ text: '' }] })}>
          <Minus className="h-4 w-4" />
        </ToolbarButton>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={async (e) => {
            const files = Array.from(e.target.files || []).filter((file) => file.type.startsWith('image/'))
            await handleImageInsert(files)
            e.currentTarget.value = ''
          }}
        />
        <ToolbarButton title="이미지" onClick={() => fileInputRef.current?.click()}>
          <ImagePlus className="h-4 w-4" />
        </ToolbarButton>

        <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-500">
          <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 md:inline-flex">Plate 문서 편집기</span>
          <span>이미지 드래그, 붙여넣기, 표 삽입 지원</span>
        </div>
      </div>

      <Plate editor={editor} onValueChange={handleValueChange}>
        <EditorContainer className="relative bg-white">
          <Editor
            placeholder={placeholder}
            variant="fullWidth"
            className={cn(
              'min-h-[inherit] outline-none [&_[data-slate-placeholder]]:left-8 [&_[data-slate-placeholder]]:top-6',
              '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1.5',
              '[&_table]:my-5 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-slate-200 [&_th]:bg-slate-100 [&_th]:px-3 [&_th]:py-2 [&_td]:border [&_td]:border-slate-200 [&_td]:px-3 [&_td]:py-2',
              '[&_img]:my-4 [&_img]:rounded-2xl [&_img]:border [&_img]:border-slate-200 [&_img]:shadow-[0_10px_25px_rgba(15,23,42,0.08)]',
              '[&_.slate-placeholder]:pointer-events-none [&_.slate-placeholder]:absolute [&_.slate-placeholder]:text-slate-400',
            )}
            style={{ minHeight, fontSize }}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData?.files || []).filter((file) => file.type.startsWith('image/'))
              if (files.length === 0) return
              event.preventDefault()
              void handleImageInsert(files)
            }}
            onDrop={(event) => {
              const files = Array.from(event.dataTransfer?.files || []).filter((file) => file.type.startsWith('image/'))
              if (files.length === 0) return
              event.preventDefault()
              void handleImageInsert(files)
            }}
          />
        </EditorContainer>
      </Plate>
    </div>
  )
}
