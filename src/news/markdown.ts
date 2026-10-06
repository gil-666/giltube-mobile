// A small Markdown parser for news panels, shared verbatim with the website
// (giltube-frontend/app/utils/newsMarkdown.ts). It returns a tree, not HTML: each
// client builds real elements from it, so no raw HTML is ever injected and
// only http(s) links and GilTube paths become links.
//
// Supported: # headings (1-3), paragraphs, **bold**, *italic* / _italic_,
// ~~strike~~, `code`, ```code blocks```, [links](url), - / * / 1. lists,
// > quotes, --- dividers, and line breaks inside paragraphs.

export type MarkdownInline =
  | { type: 'text', text: string }
  | { type: 'strong' | 'em' | 'strike', children: MarkdownInline[] }
  | { type: 'code', text: string }
  | { type: 'link', href: string, external: boolean, children: MarkdownInline[] }
  | { type: 'br' }

export type MarkdownBlock =
  | { type: 'heading', level: 1 | 2 | 3, children: MarkdownInline[] }
  | { type: 'paragraph', children: MarkdownInline[] }
  | { type: 'quote', children: MarkdownInline[] }
  | { type: 'list', ordered: boolean, items: MarkdownInline[][] }
  | { type: 'code', text: string }
  | { type: 'hr' }

/** Returns the link target if it is safe to follow, else null. */
export function safeMarkdownHref(raw: string): { href: string, external: boolean } | null {
  const href = raw.trim()
  if (/^\/(?!\/)[^\s\\]*$/.test(href)) return { href, external: false }
  if (/^https?:\/\/[^\s/?#]+[^\s]*$/i.test(href)) return { href, external: true }
  return null
}

const INLINE_PATTERN = /(\*\*([\s\S]+?)\*\*)|(~~([\s\S]+?)~~)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))|(\*([^*\s][^*]*?)\*)|(\b_([^_\s][^_]*?)_\b)/

export function parseInline(text: string): MarkdownInline[] {
  const out: MarkdownInline[] = []
  const pushText = (value: string) => {
    if (!value) return
    const lines = value.split('\n')
    lines.forEach((line, index) => {
      if (index > 0) out.push({ type: 'br' })
      if (line) {
        const last = out[out.length - 1]
        if (last && last.type === 'text') last.text += line
        else out.push({ type: 'text', text: line })
      }
    })
  }
  let rest = text
  while (rest) {
    const match = rest.match(INLINE_PATTERN)
    if (!match || match.index === undefined) {
      pushText(rest)
      break
    }
    pushText(rest.slice(0, match.index))
    if (match[1]) out.push({ type: 'strong', children: parseInline(match[2]!) })
    else if (match[3]) out.push({ type: 'strike', children: parseInline(match[4]!) })
    else if (match[5]) out.push({ type: 'code', text: match[6]! })
    else if (match[7]) {
      const target = safeMarkdownHref(match[9]!)
      if (target) out.push({ type: 'link', href: target.href, external: target.external, children: parseInline(match[8]!) })
      else pushText(match[8]!)
    } else if (match[10]) out.push({ type: 'em', children: parseInline(match[11]!) })
    else if (match[12]) out.push({ type: 'em', children: parseInline(match[13]!) })
    rest = rest.slice(match.index + match[0].length)
  }
  return out
}

export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  let paragraph: string[] = []
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', children: parseInline(paragraph.join('\n')) })
    paragraph = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const trimmed = line.trim()
    if (!trimmed) {
      flush()
      continue
    }
    if (trimmed.startsWith('```')) {
      flush()
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i]!.trim().startsWith('```')) code.push(lines[i++]!)
      blocks.push({ type: 'code', text: code.join('\n') })
      continue
    }
    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      flush()
      blocks.push({ type: 'heading', level: Math.min(3, heading[1]!.length) as 1 | 2 | 3, children: parseInline(heading[2]!) })
      continue
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flush()
      blocks.push({ type: 'hr' })
      continue
    }
    if (trimmed.startsWith('>')) {
      flush()
      const quote: string[] = []
      while (i < lines.length && lines[i]!.trim().startsWith('>')) quote.push(lines[i++]!.trim().replace(/^>\s?/, ''))
      i--
      blocks.push({ type: 'quote', children: parseInline(quote.join('\n')) })
      continue
    }
    const listItem = /^([-*+]|\d+[.)])\s+(.*)$/
    const item = trimmed.match(listItem)
    if (item) {
      flush()
      const ordered = /\d/.test(item[1]!)
      const items: MarkdownInline[][] = []
      while (i < lines.length) {
        const next = lines[i]!.trim().match(listItem)
        if (!next || /\d/.test(next[1]!) !== ordered) break
        items.push(parseInline(next[2]!))
        i++
      }
      i--
      blocks.push({ type: 'list', ordered, items })
      continue
    }
    paragraph.push(trimmed)
  }
  flush()
  return blocks
}
