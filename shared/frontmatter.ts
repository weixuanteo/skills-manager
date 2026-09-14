export interface FrontmatterSplit {
  /** Text between the `---` delimiters, or null when the document has no frontmatter block. */
  raw: string | null
  body: string
}

/** Splits a markdown document at its YAML frontmatter delimiters without decoding the YAML. */
export function splitFrontmatter(src: string): FrontmatterSplit {
  const m = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src)
  if (!m) return { raw: null, body: src }
  return { raw: m[1], body: src.slice(m[0].length) }
}
