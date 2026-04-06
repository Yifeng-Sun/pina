# pina — Personal Project Management CLI

## Overview

A terminal-based tool for managing side projects. Built with Ink (React for CLIs) + TypeScript.

## Tech Stack

- **Ink** — React-based terminal UI
- **TypeScript** — ESM modules
- **Pastel** — Ink CLI framework (commands, args, flags)
- **Zod** — schema validation for config
- **YAML** — project registry storage
- **tsx** — dev runner
- **tsup** — build/bundle

## Project Structure

```
pina/
├── package.json
├── tsconfig.json
├── src/
│   ├── app.tsx              # main Ink app / router
│   ├── cli.ts               # entry point, arg parsing
│   ├── commands/
│   │   ├── init.tsx
│   │   ├── list.tsx
│   │   ├── switch.tsx
│   │   ├── status.tsx
│   │   ├── new.tsx
│   │   ├── archive.tsx
│   │   ├── note.tsx
│   │   └── scan.tsx
│   ├── components/
│   │   ├── ProjectTable.tsx
│   │   ├── StatusBadge.tsx
│   │   └── Prompt.tsx
│   ├── lib/
│   │   ├── config.ts        # load/save ~/.pina/projects.yml
│   │   ├── venv.ts          # venv detection & activation
│   │   ├── git.ts           # git/remote helpers
│   │   ├── symlink.ts       # manage active project symlink
│   │   ├── schema.ts        # Zod schemas for project data
│   │   └── detector.ts      # project type detection logic
│   └── types.ts
└── README.md
```

## Data Model

### Global Registry (~/.pina/projects.yml)

```yaml
projects:
  pina:
    path: /Users/yifengsun/dev/pina
    status: active
    tags: [cli, typescript, tool]
    venv: .venv
    remote: https://github.com/user/pina
    ai_config: .pina/claude.yml
    created: 2026-04-05
    last_switched: 2026-04-05
    notes: "project management CLI tool"
```

### Per-Project Config (<project>/.pina/config.yml) — optional

```yaml
venv_path: .venv
env_file: .env
hooks:
  on_switch_in: "docker compose up -d"
  on_switch_out: "docker compose down"
ai:
  model: claude-opus-4-6
  claude_md: ./CLAUDE.md
```

### Project Lifecycle

#### Stages

```
planning → scaffolding → development → stable → complete → archived
```

| Stage | Meaning | Auto-triggered when |
|-------|---------|-------------------|
| **planning** | Idea phase, no code yet | Project created with no git history |
| **scaffolding** | Setting up structure, initial commits | First commit or venv/config detected |
| **development** | Active work, building features | 5+ commits, 3+ switches |
| **stable** | Functional, low churn, maintenance mode | User promotes, or 30+ days with <1 commit/week |
| **complete** | Done — shipped, goal achieved | User marks complete |
| **archived** | Shelved, no longer active | User archives |

Special states (overlays, not stages):

| State | Meaning |
|-------|---------|
| **stale** | Untouched 14+ days while in development/scaffolding |
| **paused** | Explicitly paused by user — freezes stage progression |

#### Milestones

Quiet achievements logged per project — a journal of firsts.

**Creation & Setup**

| Key | Label | Trigger |
|-----|-------|---------|
| `born` | "Project created" | `pina init` / `pina new` / `pina scan` |
| `first_note` | "First note" | First `pina note` |
| `git_linked` | "Git connected" | Remote URL detected or added |
| `venv_linked` | "Environment set up" | Venv detected or configured |
| `ai_configured` | "AI skills linked" | CLAUDE.md or ai config added |

**Development**

| Key | Label | Trigger |
|-----|-------|---------|
| `first_switch` | "First switched to" | First `pina switch` to this project |
| `ten_switches` | "Frequent flyer" | 10th switch |
| `first_commit` | "First commit" | Git detects first commit after registration |
| `fifty_commits` | "Fifty commits deep" | 50 commits since registration |
| `first_branch` | "First branch" | More than one branch detected |

**Longevity**

| Key | Label | Trigger |
|-----|-------|---------|
| `one_week` | "One week old" | 7 days since creation |
| `one_month` | "One month in" | 30 days |
| `one_year` | "Survived a year" | 365 days |
| `revived` | "Back from the dead" | Switched to after 30+ days of inactivity |

**Completion**

| Key | Label | Trigger |
|-----|-------|---------|
| `first_release` | "First release" | Git tag matching `v*` detected |
| `completed` | "Completed" | User marks project as complete |
| `archived` | "Put to rest" | User archives |

#### Stage Progression Logic

```
pina init / pina new
  → stage: planning
  → milestone: born

first commit detected (or existed at registration)
  → stage: planning → scaffolding
  → milestone: first_commit

5+ commits AND 3+ switches
  → stage: scaffolding → development

user promotes OR (30+ days, commit frequency < 1/week)
  → stage: development → stable

user runs `pina complete <name>`
  → stage: → complete
  → milestone: completed

user runs `pina archive <name>`
  → stage: → archived
  → milestone: archived

14+ days untouched while active
  → stale overlay (visual only, doesn't change stage)
```

### TypeScript Interface

```typescript
type Stage = 'planning' | 'scaffolding' | 'development' | 'stable' | 'complete' | 'archived'

interface Milestone {
  key: string
  label: string
  reached?: string  // ISO date
}

interface Project {
  name: string
  path: string
  stage: Stage
  status: 'active' | 'paused'
  stale: boolean
  tags: string[]
  venv?: string
  remote?: string
  aiConfig?: string
  created: string
  lastSwitched?: string
  xp: number
  notes: string[]
  milestones: Record<string, string>  // key → ISO date
  stats: {
    switches: number
    commitsAtRegistration: number
  }
}
```

## CLI Commands

```
pina init                  # init pina in current dir (register as project)
pina new <name>            # register an existing directory as a project
pina scan <directory>      # scan a directory, detect & register projects
pina switch <name>         # switch active project (update symlink)
pina list                  # show all projects in a table
pina status                # current project info
pina note "some text"      # add a note to current project
pina archive <name>        # archive a project
pina config                # edit project config
```

## Features

### Core: Project Registry
- Project metadata: name, status, description, tags, created/last-touched dates
- Soft-link workspace: symlink a canonical path (e.g. ~/current) to the active project dir
- Toggle: `pina switch <name>` — updates symlink, activates venv, sets prompt

### Environment Management
- Python venv: auto-detect, print activation command on switch
- Shell prompt: user adds `pina prompt` to their PS1 manually (opt-in)
- Per-project .env loading on switch
- AI skills/config: per-project model, system prompts, CLAUDE.md pointers

### Git & Remote
- Link remote repo: store GitHub/GitLab URL per project
- Quick status: show git branch, dirty files, last commit
- Multi-repo support

### Cloud Sync
- User points ~/.pina/ at iCloud/Dropbox/syncthing
- Pina does not handle sync itself — just stores flat YAML files
- Cross-machine: same project list, resolve paths per-machine

### Workflow
- Time tracking: optional start/stop timer per project
- Notes/journal: quick per-project scratchpad
- Tasks/TODOs: lightweight per-project checklist
- Dependencies between projects

### Discovery & Visibility
- Dashboard: table of all projects with status, last touched, venv, remote
- Stale detection: flag projects untouched for N days
- Search/filter by tag, status, language

### Project Scanning (`pina scan <directory>`)

Scan a directory (one level deep) and auto-detect projects by looking for recognizable signals:

**Detection signals** (checked per subdirectory):

| Signal | Detects | Inferred Tags |
|--------|---------|---------------|
| `.git/` | Any git project | — |
| `package.json` | Node/JS/TS project | `node`, `typescript` (if tsconfig exists) |
| `pyproject.toml` / `setup.py` / `requirements.txt` | Python project | `python` |
| `Cargo.toml` | Rust project | `rust` |
| `go.mod` | Go project | `go` |
| `pom.xml` / `build.gradle` | Java project | `java` |
| `.venv/` / `venv/` | Python venv present | `python` |
| `Dockerfile` / `docker-compose.yml` | Containerized | `docker` |
| `CLAUDE.md` / `.claude/` | AI-assisted project | `ai` |

**Behavior:**
- Scans only immediate subdirectories (not recursive)
- Skips `node_modules`, `.git`, hidden dirs, and non-directory entries
- For each detected project, auto-populates: name (folder name), path, tags, venv (if found), remote (from git config)
- Shows an interactive checklist — user picks which projects to register
- Skips projects already in the registry (matches by path)
- Sets status to `idea` by default (user can bulk-set)

**Example:**

```
$ pina scan ~/dev

Scanning ~/dev... found 23 subdirectories, 18 look like projects.

  ✔ astro-project        [node, typescript]
  ✔ chelsea              [python, venv]
  ✔ claude_demo          [python, ai]
  ✔ ink                  [node, typescript]
  ✔ java-playground      [java]
  ✔ pina                 [node, typescript, ai]
  ✔ rustlings            [rust]
  ○ Garmin               [unknown]
  ○ istio-1.28.0         [unknown]
  ...

  ↑↓ navigate  space toggle  a all  enter confirm

Registered 7 projects.
```

**File additions:**

```
src/
├── commands/
│   └── scan.tsx           # scan command UI (interactive checklist)
├── lib/
│   └── detector.ts        # project type detection logic
```

### Nice-to-haves
- Templates: scaffold with venv + git + structure
- Hooks: run commands on switch-in/switch-out
- Shell tab-completion for project names
- Export: dump project list to markdown/JSON

## Core Assumptions

- **Node.js 18+**, ESM modules
- **Single registry** at ~/.pina/projects.yml — source of truth
- **One active project** at a time, symlinked to ~/current (configurable)
- **No shell injection** — pina does NOT modify .bashrc/.zshrc automatically
- **Metadata only** — pina manages metadata, not code
- **`pina new` registers** an existing directory, doesn't create one (v1)
- **No auth, no accounts, no server** — purely local CLI
- **macOS first**, Linux compatible, Windows not a priority
- **AI integration v1**: stores pointers to AI config, does not invoke AI itself
