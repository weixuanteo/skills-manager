import path from 'node:path'

const LANG_BY_EXT: Record<string, string> = {
  md: 'markdown', markdown: 'markdown', mdx: 'markdown',
  ts: 'typescript', tsx: 'tsx', js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml', ini: 'ini',
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', swift: 'swift',
  c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php', sql: 'sql',
  html: 'html', css: 'css', scss: 'scss', xml: 'xml', svg: 'xml', txt: 'plaintext',
  dockerfile: 'dockerfile', makefile: 'makefile', lua: 'lua', r: 'r', pl: 'perl',
}

export function languageFor(file: string): string {
  const base = path.basename(file).toLowerCase()
  if (base === 'dockerfile') return 'dockerfile'
  if (base === 'makefile') return 'makefile'
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.') + 1) : ''
  return LANG_BY_EXT[ext] ?? 'plaintext'
}
