import assert from 'node:assert/strict'
import { test } from 'node:test'
import { splitFrontmatter } from './frontmatter.ts'

const cases: { name: string; src: string; raw: string | null; body: string }[] = [
  { name: 'no frontmatter', src: '# Title\n', raw: null, body: '# Title\n' },
  { name: 'plain', src: '---\nname: x\n---\n# Title\n', raw: 'name: x', body: '# Title\n' },
  { name: 'BOM before the opening delimiter', src: '﻿---\nname: x\n---\nbody', raw: 'name: x', body: 'body' },
  { name: 'CRLF line endings', src: '---\r\nname: x\r\n---\r\nbody', raw: 'name: x', body: 'body' },
  { name: 'closing delimiter at end of file', src: '---\nname: x\n---', raw: 'name: x', body: '' },
  { name: 'trailing spaces after delimiters', src: '--- \nname: x\n---  \nbody', raw: 'name: x', body: 'body' },
  { name: 'unterminated block is body', src: '---\nname: x\n# Title\n', raw: null, body: '---\nname: x\n# Title\n' },
  { name: 'delimiter not at start is body', src: '\n---\nname: x\n---\nbody', raw: null, body: '\n---\nname: x\n---\nbody' },
]

for (const c of cases) {
  test(`splitFrontmatter: ${c.name}`, () => {
    assert.deepEqual(splitFrontmatter(c.src), { raw: c.raw, body: c.body })
  })
}
