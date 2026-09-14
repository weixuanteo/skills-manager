export interface Heading {
  id: string
  level: number
  text: string
  el: HTMLElement
}

export interface OutlineNode extends Heading {
  children: OutlineNode[]
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'section'
  )
}

/** Assigns IDs to the rendered headings. */
export function collectHeadings(root: HTMLElement): Heading[] {
  const seen = new Map<string, number>()
  const out: Heading[] = []
  for (const el of root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')) {
    const text = (el.textContent ?? '').trim()
    if (!text) continue
    const base = slugify(text)
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    const id = n === 0 ? base : `${base}-${n}`
    el.id = id
    out.push({ id, level: Number(el.tagName[1]), text, el })
  }
  return out
}

/** Skipped levels nest under the nearest shallower heading. */
export function buildTree(headings: Heading[]): OutlineNode[] {
  const roots: OutlineNode[] = []
  const stack: OutlineNode[] = []
  for (const h of headings) {
    const node: OutlineNode = { ...h, children: [] }
    while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop()
    if (stack.length) stack[stack.length - 1].children.push(node)
    else roots.push(node)
    stack.push(node)
  }
  return roots
}
