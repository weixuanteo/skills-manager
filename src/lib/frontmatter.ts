export function parseFrontmatterClient(src: string): { raw: string | null; body: string } {
  const m = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src)
  if (!m) return { raw: null, body: src }
  return { raw: m[1], body: src.slice(m[0].length) }
}
