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
  align?: string
  attributes?: {
    align?: string
    [key: string]: unknown
  }
  background?: string | null
  borders?: TableCellBorders
  backgroundColor?: string
  bold?: boolean
  color?: string
  fontFamily?: string
  fontSize?: string | number
  highlight?: boolean
  italic?: boolean
  kbd?: boolean
  subscript?: boolean
  superscript?: boolean
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
const TEXT_ALIGN_VALUES = new Set(['start', 'left', 'center', 'right', 'end', 'justify'])

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

function normalizeTextAlign(value: unknown) {
  const align = safeCssValue(value)
  if (!align) return undefined
  return TEXT_ALIGN_VALUES.has(align) ? align : undefined
}

function buildStyleAttr(style: string[]) {
  return style.length > 0 ? style.join(';') : undefined
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
    style: buildStyleAttr(style),
  }
}

function buildBlockAttrs(node: RichTextNode) {
  const tableCellAttrs = buildTableCellAttrs(node)
  const style = [tableCellAttrs.style].filter(Boolean) as string[]
  const align = normalizeTextAlign(node.align ?? node.attributes?.align)

  if (align) style.push(`text-align:${align}`)

  return {
    ...tableCellAttrs,
    'data-align': align,
    style: buildStyleAttr(style),
  }
}

function serializeTextMarks(node: RichTextNode, text: string) {
  let content = text
  const style: string[] = []

  const color = safeCssValue(node.color)
  const backgroundColor = safeCssValue(node.backgroundColor)
  const fontFamily = safeCssValue(node.fontFamily)
  const fontSize =
    typeof node.fontSize === 'number'
      ? `${node.fontSize}px`
      : safeCssValue(node.fontSize)

  if (color) style.push(`color:${color}`)
  if (backgroundColor) style.push(`background-color:${backgroundColor}`)
  if (fontFamily) style.push(`font-family:${fontFamily}`)
  if (fontSize) style.push(`font-size:${fontSize}`)

  if (style.length > 0) content = `<span${attrs({ style: buildStyleAttr(style) })}>${content}</span>`
  if (node.code) content = `<code>${content}</code>`
  if (node.kbd) content = `<kbd>${content}</kbd>`
  if (node.bold) content = `<strong>${content}</strong>`
  if (node.italic) content = `<em>${content}</em>`
  if (node.underline) content = `<u>${content}</u>`
  if (node.strikethrough) content = `<s>${content}</s>`
  if (node.subscript) content = `<sub>${content}</sub>`
  if (node.superscript) content = `<sup>${content}</sup>`
  if (node.highlight) content = `<mark>${content}</mark>`

  return content
}

function serializeRichTextNode(node: RichTextNode): string {
  if (typeof node.text === 'string') {
    return serializeTextMarks(node, escapeHtml(node.text).replace(/\n/g, '<br>'))
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
  return `<${tag}${attrs(buildBlockAttrs(node))}>${children}</${tag}>`
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

function readBlockPresentation(element: HTMLElement) {
  return {
    align: normalizeTextAlign(element.dataset.align || getStyleProperty(element, 'text-align')),
  }
}

function hydrateRichTextBlockStyles(value: unknown, html?: string | null) {
  if (!Array.isArray(value) || !html || typeof document === 'undefined') return value

  const container = document.createElement('div')
  container.innerHTML = html
  const sourceBlocks = Array.from(
    container.querySelectorAll('blockquote,h1,h2,h3,li,p,td,th,tr,ul,ol,table')
  ).map((block) => readBlockPresentation(block as HTMLElement))

  if (sourceBlocks.length === 0) return value

  let blockIndex = 0
  const visit = (node: RichTextNode) => {
    if (node.type && typeof node.text !== 'string') {
      const source = sourceBlocks[blockIndex++]
      if (source?.align) node.align = source.align
    }

    node.children?.forEach(visit)
  }

  value.forEach((node) => visit(node as RichTextNode))
  return value
}

export function hydrateRichTextTableCellStyles(value: unknown, html?: string | null) {
  if (!Array.isArray(value) || !html || typeof document === 'undefined') return value

  const container = document.createElement('div')
  container.innerHTML = html
  const sourceCells = Array.from(container.querySelectorAll('td,th')).map((cell) =>
    readTableCellPresentation(cell as HTMLElement)
  )

  if (sourceCells.length === 0) return hydrateRichTextBlockStyles(value, html)

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
  return hydrateRichTextBlockStyles(value, html)
}
