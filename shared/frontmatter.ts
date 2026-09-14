export interface FrontmatterSplit {
  /** Raw YAML, or null if no frontmatter block exists. */
  raw: string | null
  body: string
}

export function splitFrontmatter(src: string): FrontmatterSplit {
  const m = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src)
  if (!m) return { raw: null, body: src }
  return { raw: m[1], body: src.slice(m[0].length) }
}
