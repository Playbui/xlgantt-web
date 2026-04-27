export function normalizeRichTextHtml(html?: string | null) {
  return (html || '')
    .replace(/\uFEFF/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim()
}

export function richTextToPlainText(html?: string | null) {
  if (!html) return ''

  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h1|h2|h3|blockquote|tr)>/gi, '\n')
    .replace(/<\/(td|th)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export function isRichTextEmpty(html?: string | null) {
  return richTextToPlainText(html).length === 0
}

export function richTextToPreview(html?: string | null, maxLength = 120) {
  const plain = richTextToPlainText(html)
  if (plain.length <= maxLength) return plain
  return `${plain.slice(0, maxLength).trimEnd()}...`
}

type RichTextNode = {
  type?: string
  text?: string
  url?: string
  children?: RichTextNode[]
  background?: string | null
  borders?: TableCellBorders
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  code?: boolean
  [key: string]: unknown
}

type TableBorderDirection = 'top' | 'right' | 'bottom' | 'left'
type TableCellBorder = {
  color?: string
  size?: number
  style?: string
}
type TableCellBorders = Partial<Record<TableBorderDirection, TableCellBorder>>

const TABLE_CELL_TYPES = new Set(['td', 'th'])
const TABLE_BORDER_DIRECTIONS: TableBorderDirection[] = ['top', 'right', 'bottom', 'left']

const BLOCK_TAGS: Record<string, string> = {
  blockquote: 'blockquote',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  li: 'li',
  lic: 'li',
  p: 'p',
  paragraph: 'p',
  td: 'td',
  th: 'th',
  tr: 'tr',
  ul: 'ul',
  ol: 'ol',
  table: 'table',
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function attrs(attributes: Record<string, string | undefined>) {
  return Object.entries(attributes)
    .filter(([, value]) => value)
    .map(([key, value]) => ` ${key}="${escapeHtml(value!)}"`)
    .join('')
}

function safeCssValue(value: unknown) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed || /[<>"'`;{}]/.test(trimmed)) return undefined
  return trimmed
}

function normalizeBorderSize(value: unknown) {
  const size = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  if (!Number.isFinite(size)) return undefined
  return Math.max(0, Math.min(20, size))
}

function normalizeBorderStyle(value: unknown) {
  const style = safeCssValue(value)
  if (!style) return undefined
  return /^(solid|dashed|dotted|double|none)$/i.test(style) ? style.toLowerCase() : undefined
}

function buildTableCellAttrs(node: RichTextNode) {
  if (!TABLE_CELL_TYPES.has(node.type || '')) return {}

  const style: string[] = []
  const background = safeCssValue(node.background)
  const borders = node.borders && typeof node.borders === 'object' ? node.borders : undefined

  if (background) style.push(`background-color:${background}`)

  for (const direction of TABLE_BORDER_DIRECTIONS) {
    const border = borders?.[direction]
    if (!border) continue

    const size = normalizeBorderSize(border.size)
    const borderStyle = normalizeBorderStyle(border.style) || 'solid'
    const color = safeCssValue(border.color)

    if (typeof size === 'number') style.push(`border-${direction}-width:${size}px`)
    if (borderStyle) style.push(`border-${direction}-style:${borderStyle}`)
    if (color) style.push(`border-${direction}-color:${color}`)
  }

  return {
    'data-cell-background': background,
    'data-cell-borders': borders ? JSON.stringify(borders) : undefined,
    style: style.length > 0 ? style.join(';') : undefined,
  }
}

function serializeRichTextNode(node: RichTextNode): string {
  if (typeof node.text === 'string') {
    let text = escapeHtml(node.text).replace(/\n/g, '<br>')
    if (node.code) text = `<code>${text}</code>`
    if (node.bold) text = `<strong>${text}</strong>`
    if (node.italic) text = `<em>${text}</em>`
    if (node.underline) text = `<u>${text}</u>`
    if (node.strikethrough) text = `<s>${text}</s>`
    return text
  }

  const children = (node.children || []).map(serializeRichTextNode).join('')
  const type = node.type || 'p'

  if (type === 'a') {
    return `<a${attrs({ href: typeof node.url === 'string' ? node.url : undefined })}>${children}</a>`
  }

  if (type === 'img' || type === 'image') {
    const src = typeof node.url === 'string' ? node.url : typeof node.src === 'string' ? node.src : undefined
    return src ? `<img${attrs({ src, alt: typeof node.alt === 'string' ? node.alt : undefined })}>` : ''
  }

  if (type === 'hr') return '<hr>'

  const tag = BLOCK_TAGS[type] || 'p'
  return `<${tag}${attrs(buildTableCellAttrs(node))}>${children}</${tag}>`
}

export function serializeRichTextValue(value: unknown) {
  if (!Array.isArray(value)) return ''
  return normalizeRichTextHtml(value.map((node) => serializeRichTextNode(node as RichTextNode)).join(''))
}

function parseBordersJson(value?: string | null): TableCellBorders | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value) as TableCellBorders
    return parsed && typeof parsed === 'object' ? parsed : undefined
  } catch {
    return undefined
  }
}

function getStyleProperty(element: HTMLElement, property: string) {
  return element.style.getPropertyValue(property).trim() || undefined
}

function readTableCellPresentation(element: HTMLElement) {
  const background =
    element.dataset.cellBackground ||
    getStyleProperty(element, 'background-color') ||
    undefined
  const borders = parseBordersJson(element.dataset.cellBorders) || {}

  for (const direction of TABLE_BORDER_DIRECTIONS) {
    const size = normalizeBorderSize(getStyleProperty(element, `border-${direction}-width`))
    const style = normalizeBorderStyle(getStyleProperty(element, `border-${direction}-style`))
    const color = safeCssValue(getStyleProperty(element, `border-${direction}-color`))

    if (typeof size === 'number' || style || color) {
      borders[direction] = {
        ...borders[direction],
        ...(typeof size === 'number' ? { size } : {}),
        ...(style ? { style } : {}),
        ...(color ? { color } : {}),
      }
    }
  }

  return {
    background: safeCssValue(background),
    borders: Object.keys(borders).length > 0 ? borders : undefined,
  }
}

export function hydrateRichTextTableCellStyles(value: unknown, html?: string | null) {
  if (!Array.isArray(value) || !html || typeof document === 'undefined') return value

  const container = document.createElement('div')
  container.innerHTML = html
  const sourceCells = Array.from(container.querySelectorAll('td,th')).map((cell) =>
    readTableCellPresentation(cell as HTMLElement)
  )

  if (sourceCells.length === 0) return value

  let cellIndex = 0
  const visit = (node: RichTextNode) => {
    if (TABLE_CELL_TYPES.has(node.type || '')) {
      const source = sourceCells[cellIndex++]
      if (source?.background) node.background = source.background
      if (source?.borders) node.borders = source.borders
    }

    node.children?.forEach(visit)
  }

  value.forEach((node) => visit(node as RichTextNode))
  return value
}
