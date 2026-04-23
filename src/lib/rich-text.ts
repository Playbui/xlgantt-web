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
