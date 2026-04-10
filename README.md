```
   ___  _          
  / _ \(_)__  ___ _
 / ___/ / _ \/ _ `/
/_/  /_/_//_/\_,_/ 
```
A terminal-based tool for managing your side projects. Track, switch between, and organize all your projects from the command line.

<img width="808" height="695" alt="image" src="https://github.com/user-attachments/assets/63c9f171-e2c1-4925-8096-9d377f783342" />


Built with [Ink](https://github.com/vadimdemedes/ink) + TypeScript.
Thank you [Patrick](https://patorjk.com/software/taag/#p=display&f=Small+Slant&t=Pina&x=none&v=4&h=4&w=80&we=false) for the ACSII art generator.

## Install

### Homebrew

```bash
brew tap yifeng-sun/pina
brew install pina
```

### npm

```bash
npm install -g @yifengsun/pina
```

### From source

```bash
git clone https://github.com/yifeng-sun/pina.git
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
planning -> scaffolding -> development -> stable -> complete -> archived
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

## Project Detection & Quick Actions

Pina automatically detects project types and provides context-aware quick actions in the dashboard. Over 80 project types are recognized across 14 categories.

### Languages

| Type | Detection | Quick Actions |
|------|-----------|---------------|
| Node/TypeScript | `package.json`, `tsconfig.json` | Scripts from package.json (auto-detects npm/pnpm/yarn/bun) |
| Python | `pyproject.toml`, `requirements.txt`, `setup.py` | Auto-detects Poetry, UV, PDM, Pipenv, pip; plus Ruff & mypy |
| Rust | `Cargo.toml` | build, run, test, clippy, fmt |
| Go | `go.mod` | build, run, test, vet |
| Swift | `Package.swift` | build, run, test |
| C# / .NET | `*.sln`, `*.csproj`, `*.fsproj` | restore, build, run, test |
| C/C++ (CMake) | `CMakeLists.txt` | configure, build, test |
| C/C++ (Meson) | `meson.build` | setup, compile (ninja), test |
| Java (Maven) | `pom.xml` | compile, test, package, clean |
| Java (Gradle) | `build.gradle`, `build.gradle.kts` | build, test, run, clean (auto-detects gradlew) |
| Scala (sbt) | `build.sbt` | compile, run, test, clean |
| Clojure | `project.clj`, `deps.edn` | lein run/test or clj REPL |
| Elixir | `mix.exs` | deps.get, compile, test, iex |
| Erlang | `rebar.config` | compile, eunit, shell |
| Haskell | `stack.yaml`, `*.cabal` | build, run, test (Stack or Cabal) |
| OCaml | `dune-project` | build, test, clean |
| Zig | `build.zig` | build, run, test |
| Gleam | `gleam.toml` | build, run, test |
| Crystal | `shard.yml` | shards install, build, spec |
| Dart/Flutter | `pubspec.yaml` | pub get, run, test, analyze |
| Ruby | `Gemfile` | bundle install, rspec, rake |
| PHP | `composer.json` | composer install, phpunit |
| Nim | `*.nimble` | build, run, test |
| V | `v.mod` | run, test, fmt |
| Perl | `cpanfile`, `Makefile.PL` | cpanm deps, prove tests |
| Fortran | `fpm.toml` | build, run, test |

### Frameworks

| Type | Detection | Quick Actions |
|------|-----------|---------------|
| Django | `manage.py` | runserver, test, migrate, makemigrations, shell |
| Laravel | `artisan` | serve, migrate, test, tinker |
| Rails | `bin/rails`, `config/routes.rb` | server, console, test, db:migrate |
| Jekyll | `_config.yml` + `_posts/` | serve, build |
| Next.js, Nuxt, Vite, Astro, SvelteKit, Gatsby, Eleventy, Docusaurus | config files | Detected via npm scripts |

### Mobile & Desktop

| Type | Detection | Quick Actions |
|------|-----------|---------------|
| Xcode (iOS/macOS) | `*.xcodeproj`, `*.xcworkspace` | xcodebuild build, test |
| CocoaPods | `Podfile` | pod install, pod update |
| Tauri | `src-tauri/tauri.conf.json` | cargo tauri dev, build |

### Infrastructure & DevOps

| Type | Detection | Quick Actions |
|------|-----------|---------------|
| Docker | `Dockerfile`, `docker-compose.yml` | build, compose up/down |
| Terraform | `main.tf` | init, plan, apply, fmt |
| Pulumi | `Pulumi.yaml` | preview, up |
| Helm | `Chart.yaml` | lint, template, package |
| Kubernetes | `kustomization.yaml` | kubectl apply, diff |
| AWS CDK | `cdk.json` | synth, deploy, diff |
| Serverless | `serverless.yml` | deploy, offline |
| Ansible | `ansible.cfg` | playbook, lint |
| Vagrant | `Vagrantfile` | up, ssh, halt |
| Nix | `flake.nix` | build, develop, check |

### Build & Task Runners

| Type | Detection | Quick Actions |
|------|-----------|---------------|
| Make | `Makefile` | Parsed targets |
| Just | `justfile` | Parsed recipes |
| Taskfile | `Taskfile.yml` | Parsed tasks |
| Rake | `Rakefile` | Parsed tasks |
| Nx | `nx.json` | run-many build/test, affected |
| Turbo | `turbo.json` | run build/test/lint |
| Bazel | `MODULE.bazel`, `WORKSPACE` | build, test |
| Pants | `pants.toml` | test, fmt, lint |
| Earthly | `Earthfile` | +build, +test |

### Data Science & ML

| Type | Detection | Quick Actions |
|------|-----------|---------------|
| Jupyter | `*.ipynb` | jupyter lab, notebook |
| DVC | `dvc.yaml` | repro, push, pull, status |
| MLflow | `MLproject` | run, ui |
| Conda | `environment.yml` | env create |
| Pixi | `pixi.toml` | install, run, test |

### Documentation

| Type | Detection | Quick Actions |
|------|-----------|---------------|
| Hugo | `hugo.toml` | server, build |
| MkDocs | `mkdocs.yml` | serve, build |
| mdBook | `book.toml` | serve, build |

### Blockchain / Web3

| Type | Detection | Quick Actions |
|------|-----------|---------------|
| Foundry | `foundry.toml` | forge build, test, fmt |
| Hardhat | `hardhat.config.ts` | compile, test, node |
| Anchor (Solana) | `Anchor.toml` | build, test, deploy |
| Truffle | `truffle-config.js` | compile, test, migrate |

### Game Development

| Type | Detection | Quick Actions |
|------|-----------|---------------|
| Godot | `project.godot` | editor |
| Unity | `ProjectSettings/ProjectVersion.txt` | open |
| Love2D | `main.lua` + `conf.lua` | love . |

### API & Protocol

| Type | Detection | Quick Actions |
|------|-----------|---------------|
| Protobuf / Buf | `buf.yaml` | generate, lint, build |
| OpenAPI | `openapi.yaml`, `swagger.yaml` | validate |

### Universal

| Type | Detection | Quick Actions |
|------|-----------|---------------|
| Git | `.git/` | status, pull, log |
| AI | `CLAUDE.md`, `.claude/` | (metadata only) |

Quick actions are surfaced on the dashboard with up to 5 visible at a time. They auto-prioritize based on defaults, usage history, and suggested ordering. Custom actions can be added manually or generated with AI via `.pina/actions.json`.

## How It Works

- Global project metadata is stored in `~/.pina/projects.yml`
- Per-project data (objectives, notes, tags, milestones) is stored in `.pina/project.yml` within each project folder -- committable and shareable
- One project is "active" at a time, symlinked to `~/current` (configurable)
- Switching projects tracks stats (switches, XP) and logs milestones
- The dashboard auto-refreshes git status, quick actions, and objectives when the terminal window regains focus
- Cloud sync: point `~/.pina/` at iCloud, Dropbox, or Syncthing -- pina stores flat YAML files

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
