import { useEffect, useMemo, useRef } from 'react'
import { Bold, ImagePlus, Italic, List, ListOrdered, Table2, Underline } from 'lucide-react'
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

export function RichContentEditor({
  value,
  onChange,
  placeholder = '내용을 입력하세요',
  className,
  minHeight = 360,
  fontSize = 15,
  onUploadImages,
}: RichContentEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null)

  const isEmpty = useMemo(() => {
    const plain = value
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim()
    return plain.length === 0
  }, [value])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    if (editor.innerHTML !== value) {
      editor.innerHTML = value || ''
    }
  }, [value])

  const emitChange = () => {
    const editor = editorRef.current
    if (!editor) return
    onChange(editor.innerHTML)
  }

  const focusEditor = () => {
    editorRef.current?.focus()
  }

  const exec = (command: string, commandValue?: string) => {
    focusEditor()
    document.execCommand(command, false, commandValue)
    emitChange()
  }

  const insertHtml = (html: string) => {
    focusEditor()
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      editorRef.current?.insertAdjacentHTML('beforeend', html)
      emitChange()
      return
    }

    const range = selection.getRangeAt(0)
    range.deleteContents()

    const wrapper = document.createElement('div')
    wrapper.innerHTML = html
    const fragment = document.createDocumentFragment()
    let lastNode: ChildNode | null = null

    while (wrapper.firstChild) {
      lastNode = fragment.appendChild(wrapper.firstChild)
    }

    range.insertNode(fragment)
    if (lastNode) {
      const nextRange = document.createRange()
      nextRange.setStartAfter(lastNode)
      nextRange.collapse(true)
      selection.removeAllRanges()
      selection.addRange(nextRange)
    }

    emitChange()
  }

  const insertTable = () => {
    insertHtml(`
      <table style="width:100%; border-collapse:collapse; margin:12px 0;">
        <tbody>
          <tr>
            <td style="border:1px solid rgba(55,53,47,.16); padding:8px;">셀</td>
            <td style="border:1px solid rgba(55,53,47,.16); padding:8px;">셀</td>
            <td style="border:1px solid rgba(55,53,47,.16); padding:8px;">셀</td>
          </tr>
          <tr>
            <td style="border:1px solid rgba(55,53,47,.16); padding:8px;">셀</td>
            <td style="border:1px solid rgba(55,53,47,.16); padding:8px;">셀</td>
            <td style="border:1px solid rgba(55,53,47,.16); padding:8px;">셀</td>
          </tr>
          <tr>
            <td style="border:1px solid rgba(55,53,47,.16); padding:8px;">셀</td>
            <td style="border:1px solid rgba(55,53,47,.16); padding:8px;">셀</td>
            <td style="border:1px solid rgba(55,53,47,.16); padding:8px;">셀</td>
          </tr>
        </tbody>
      </table>
      <p></p>
    `)
  }

  const insertImageFromFiles = async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'))
    for (const file of imageFiles) {
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
      const safeAlt = escapeHtml(file.name)
      insertHtml(`
        <figure style="margin:12px 0;">
          <img src="${src}" alt="${safeAlt}" style="max-width:100%; height:auto; border-radius:8px; border:1px solid rgba(55,53,47,.12);" />
          <figcaption style="margin-top:6px; font-size:12px; color:rgba(55,53,47,.6);">${safeAlt}</figcaption>
        </figure>
        <p></p>
      `)
    }
  }

  return (
    <div className={cn('rounded-lg border border-slate-300 bg-background', className)}>
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-300 bg-slate-50 px-2 py-2">
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => exec('bold')} title="굵게">
          <Bold className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => exec('italic')} title="기울임">
          <Italic className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => exec('underline')} title="밑줄">
          <Underline className="h-4 w-4" />
        </Button>
        <div className="mx-1 h-4 w-px bg-border" />
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => exec('insertUnorderedList')} title="글머리표">
          <List className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => exec('insertOrderedList')} title="번호 목록">
          <ListOrdered className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={insertTable} title="표 삽입">
          <Table2 className="h-4 w-4" />
        </Button>
        <label className="inline-flex cursor-pointer items-center justify-center">
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={async (e) => {
              const files = Array.from(e.target.files || [])
              if (files.length === 0) return
              await insertImageFromFiles(files)
              e.currentTarget.value = ''
            }}
          />
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground">
            <ImagePlus className="h-4 w-4" />
          </span>
        </label>
        <div className="ml-auto text-[11px] text-muted-foreground">
          이미지 드래그, 붙여넣기, 표 삽입 지원
        </div>
      </div>

      <div className="relative">
        {isEmpty && (
          <div className="pointer-events-none absolute left-4 top-3 whitespace-pre-line text-sm text-muted-foreground/50">
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          className="prose prose-sm max-w-none px-4 py-3 outline-none"
          style={{ minHeight, fontSize }}
          onInput={emitChange}
          onPaste={async (e) => {
            const items = Array.from(e.clipboardData.items || [])
            const imageFiles = items
              .filter((item) => item.type.startsWith('image/'))
              .map((item) => item.getAsFile())
              .filter((file): file is File => Boolean(file))

            if (imageFiles.length > 0) {
              e.preventDefault()
              await insertImageFromFiles(imageFiles)
            }
          }}
          onDrop={async (e) => {
            e.preventDefault()
            const files = Array.from(e.dataTransfer.files || [])
            if (files.length > 0) {
              await insertImageFromFiles(files)
            }
          }}
          onDragOver={(e) => e.preventDefault()}
        />
      </div>
    </div>
  )
}
