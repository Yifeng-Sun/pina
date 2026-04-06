# pina

A terminal-based tool for managing your side projects. Track, switch between, and organize all your projects from the command line.

Built with [Ink](https://github.com/vadimdemedes/ink) + TypeScript.

## Install

```bash
git clone https://github.com/your-username/pina.git
cd pina
npm install
npm run build
npm link
```

## Quick Start

```bash
# Register your current directory as a project
pina init

# Or scan a directory to discover projects
pina scan ~/dev

# List all your projects
pina list

# Switch to a project
pina switch my-project

# Check the current project status
pina status
```

## Commands

| Command | Description |
|---------|-------------|
| `pina init` | Register the current directory as a project |
| `pina new <name> [-p path]` | Register an existing directory by name |
| `pina scan <directory>` | Scan a directory and interactively select projects to register |
| `pina switch <name>` | Switch active project (updates symlink, tracks stats) |
| `pina list` | List all projects in a table |
| `pina list -s <stage>` | Filter by stage |
| `pina list -t <tag>` | Filter by tag |
| `pina status` | Show detailed info for the active project |
| `pina note "some text"` | Add a note to the active project |
| `pina archive <name>` | Archive a project |

## Project Lifecycle

Every project moves through stages:

```
planning → scaffolding �� development → stable → complete ��� archived
```

| Stage | When |
|-------|------|
| **planning** | Just created, no code yet |
| **scaffolding** | First commits, setting up structure |
| **development** | Active work in progress |
| **stable** | Functional, low churn |
| **complete** | Shipped or goal achieved |
| **archived** | Shelved |

Stages advance automatically based on git activity and usage, or you can set them manually.

## Project Scanning

`pina scan` detects projects by looking for common signals:

- **Git** — `.git/`
- **Node/TypeScript** ��� `package.json`, `tsconfig.json`
- **Python** — `pyproject.toml`, `setup.py`, `requirements.txt`, `.venv/`
- **Rust** — `Cargo.toml`
- **Go** — `go.mod`
- **Java** — `pom.xml`, `build.gradle`
- **Docker** — `Dockerfile`, `docker-compose.yml`
- **AI** — `CLAUDE.md`, `.claude/`

## How It Works

- Project metadata is stored in `~/.pina/projects.yml`
- One project is "active" at a time, symlinked to `~/current` (configurable)
- Switching projects tracks stats (switches, XP) and logs milestones
- Cloud sync: point `~/.pina/` at iCloud, Dropbox, or Syncthing — pina stores flat YAML files

## Development

```bash
# Run in dev mode (no build step)
npx tsx src/cli.ts <command>

# Typecheck
npm run typecheck

# Build
npm run build
```

## License

MIT
