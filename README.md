# Skills Manager

A local web app for browsing, inspecting, updating and removing the agent skills installed on your machine.
It scans the usual skill directories (`~/.agents/skills`, `~/.claude/skills`, `~/.codex/skills`, `~/.cursor/skills`, …, plus any project folders you add), renders each `SKILL.md`, works out **how** each skill was installed, and gives you the right CLI commands to update or remove it.

The app never runs a mutating command itself. It only shows you commands to copy.

## Features

- Scans global skill directories for Claude Code, Codex, Cursor, Gemini CLI, Copilot, Windsurf, Kiro, OpenCode, Amp, Goose, Cline, Roo Code, the universal `.agents/skills` folder, and Claude Code plugins. Project folders can be added from the UI (or via `SKILLS_MANAGER_ROOTS`).
- Skills that are symlinked into several agent directories are shown once, with every location listed.
- Rendered `SKILL.md` (GitHub-flavoured markdown, syntax-highlighted code, collapsible frontmatter), plus a file browser for everything else in the skill (scripts, references, assets). Relative links in the markdown open the target file.
- Install-method detection and tailored commands:

  | Detected as | How it's recognised | Remove | Update |
  |---|---|---|---|
  | `skills` CLI | entry in `skills-lock.json` | `npx skills remove <name>` | `npx skills update <name>` |
  | npm / pnpm / yarn / bun package | skill lives under `node_modules/<pkg>` | `<pm> remove <pkg>` | `<pm> update <pkg>` |
  | Claude Code plugin | inside `~/.claude/plugins` | `claude plugin uninstall …` | `claude plugin update …` |
  | Codex built-in | `~/.codex/skills/.system` | not recommended | upgrade the Codex CLI |
  | git clone | a git repo cloned into the skills dir | `rm -rf …` | `git pull --ff-only` |
  | symlink → git repo | link into a local checkout | `rm <link>` | `git -C <repo> pull --ff-only` |
  | plain symlink / manual copy | anything else | `rm …` | — |

- Update checks (on demand, cached for 5 minutes):
  - git: `git ls-remote` against the tracked branch, no fetch, no working-tree changes
  - npm: installed version vs. the registry `latest`
  - `skills` CLI: latest upstream commit touching the skill's path (GitHub API) vs. the install time in the lockfile
- Codex's bundled skills (`~/.codex/skills/.system`) are hidden by default. Flip the "Hide Codex built-ins" switch in the sidebar, click "show them" under the list, or select the "Codex built-in" install-method filter to see them. The choice is remembered.
- Light, dark and system theme.
- Reading mode (the expand icon in the skill header, or `\`): hides the filter sidebar and the skill list, collapses the header to one row and centres the document. Remembered across reloads; focusing the search box brings the list back.
- On laptop-width windows the filter sidebar starts collapsed (`[` or the header button toggles it) and the heading outline opens as a popover instead of taking a column.
- Keyboard: `/` focuses search, `\` toggles reading mode, `[` toggles the filter sidebar.

## Running

```bash
pnpm install
pnpm dev          # API on http://127.0.0.1:5178, UI on http://localhost:5173
```

Production build:

```bash
pnpm build
pnpm start        # serves the built UI + API on http://127.0.0.1:5178
```

Environment variables:

| Variable | Purpose |
|---|---|
| `PORT` | API / production port (default `5178`) |
| `HOST` | bind address (default `127.0.0.1`; the app exposes local file contents, keep it loopback) |
| `SKILLS_MANAGER_ROOTS` | extra project roots to scan, `:`-separated |

Project roots added in the UI are stored in `~/.config/skills-manager/config.json`.

## Layout

```
server/   Hono API: scanner, install-method detection, update checks
shared/   Types shared between server and client
src/      React + Tailwind v4 UI
```

## Dependencies

All direct dependencies were audited before installation (registry metadata, maintainers, publish cadence, install scripts, `npm audit`, tarball spot checks). Build scripts are restricted to `esbuild` via `pnpm-workspace.yaml`, and `rolldown` is pinned to a release with soak time.
