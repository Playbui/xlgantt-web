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
import { EditorKit } from '@/components/editor-kit'
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

const EDITOR_PLUGINS = EditorKit as any

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
  const serializeVersionRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const plugins = useMemo(() => EDITOR_PLUGINS, [])

  const editor = usePlateEditor({
    plugins,
    value: createEditorValue(value || '<p></p>'),
  })
  const plateEditor = editor as any

  useEffect(() => {
    if (!editor) return
    if (syncLockRef.current) {
      syncLockRef.current = false
      return
    }

    const nextValue = normalizeRichTextHtml(value)
    if (nextValue === lastSyncedValueRef.current) return

    plateEditor.tf.setValue(createEditorValue(value || '<p></p>'))
    lastSyncedValueRef.current = nextValue
  }, [editor, value])

  const handleValueChange = (change?: { editor?: unknown; value?: unknown }) => {
    const currentEditor = (change?.editor ?? editor) as any
    if (!currentEditor) return
    const version = ++serializeVersionRef.current

    void (async () => {
      const valueToSerialize = (change?.value as Value | undefined) ?? currentEditor.children
      const staticEditor = createPlateEditor({
        plugins: EDITOR_PLUGINS,
        value: valueToSerialize,
      })
      const html = await serializeHtml(staticEditor)
      if (version !== serializeVersionRef.current) return

      const nextValue = isRichTextEmpty(html) ? '' : normalizeRichTextHtml(html)
      if (nextValue === lastSyncedValueRef.current) return

      syncLockRef.current = true
      lastSyncedValueRef.current = nextValue
      onChange(nextValue)
    })().catch((error) => {
      console.error('Failed to serialize rich editor content', error)
    })
  }

  const handleImageInsert = async (files: File[]) => {
    if (!editor || files.length === 0) return

    if (onUploadImages) {
      const urls = await onUploadImages(files)
      for (const url of urls) {
        if (!url) continue
        insertImage(plateEditor, url)
      }
      return
    }

    const transfer = new DataTransfer()
    files.forEach((file) => transfer.items.add(file))
    insertMedia(plateEditor, transfer.files)
  }

  const isBlockActive = (type: string) => {
    try {
      return !!plateEditor?.api.some({
        match: { type },
      })
    } catch {
      return false
    }
  }

  const isMarkActive = (key: 'bold' | 'italic' | 'underline') => {
    try {
      return !!plateEditor?.api.some({
        match: (_node: unknown) => Boolean((plateEditor.api.marks?.() as Record<string, boolean> | null)?.[key]),
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
      <Plate editor={editor} onValueChange={handleValueChange}>
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
        <EditorContainer className="relative bg-white">
          <Editor
            placeholder={placeholder}
            variant="demo"
            className={cn(
              'min-h-[inherit] outline-none [&_[data-slate-placeholder]]:left-8 [&_[data-slate-placeholder]]:top-6',
              '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1.5',
              '[&_table]:my-5 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-slate-200 [&_th]:bg-slate-100 [&_th]:px-3 [&_th]:py-2 [&_td]:border [&_td]:border-slate-200 [&_td]:px-3 [&_td]:py-2',
              '[&_img]:my-4 [&_img]:rounded-2xl [&_img]:border [&_img]:border-slate-200 [&_img]:shadow-[0_10px_25px_rgba(15,23,42,0.08)]',
              '[&_.slate-placeholder]:pointer-events-none [&_.slate-placeholder]:absolute [&_.slate-placeholder]:text-slate-400',
            )}
            style={{ minHeight, fontSize }}
            onInput={() => {
              window.setTimeout(() => handleValueChange({ editor }), 0)
            }}
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
