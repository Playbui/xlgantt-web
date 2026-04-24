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
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  code?: boolean
  [key: string]: unknown
}

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
  return `<${tag}>${children}</${tag}>`
}

export function serializeRichTextValue(value: unknown) {
  if (!Array.isArray(value)) return ''
  return normalizeRichTextHtml(value.map((node) => serializeRichTextNode(node as RichTextNode)).join(''))
}
