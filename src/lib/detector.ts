import fs from 'node:fs'
import path from 'node:path'
import type { DetectedProject } from '../types.js'
import { getRemoteUrl } from './git.js'

interface Signal {
  file: string
  isDir?: boolean
  tags: string[]
}

const SIGNALS: Signal[] = [
  // Node / JS / TS
  { file: 'package.json', tags: ['node'] },
  { file: 'tsconfig.json', tags: ['typescript'] },

  // Python
  { file: 'pyproject.toml', tags: ['python'] },
  { file: 'setup.py', tags: ['python'] },
  { file: 'requirements.txt', tags: ['python'] },
  { file: 'poetry.lock', tags: ['python'] },
  { file: 'uv.lock', tags: ['python'] },
  { file: 'pdm.lock', tags: ['python'] },
  { file: 'Pipfile', tags: ['python'] },
  { file: 'manage.py', tags: ['python', 'django'] },
  { file: '.venv', isDir: true, tags: ['python'] },
  { file: 'venv', isDir: true, tags: ['python'] },

  // Systems languages
  { file: 'Cargo.toml', tags: ['rust'] },
  { file: 'go.mod', tags: ['go'] },
  { file: 'CMakeLists.txt', tags: ['cpp'] },
  { file: 'meson.build', tags: ['cpp'] },
  { file: 'Package.swift', tags: ['swift'] },
  { file: 'build.zig', tags: ['zig'] },

  // JVM
  { file: 'pom.xml', tags: ['java'] },
  { file: 'build.gradle', tags: ['java'] },
  { file: 'build.gradle.kts', tags: ['kotlin'] },
  { file: 'build.sbt', tags: ['scala'] },
  { file: 'project.clj', tags: ['clojure'] },
  { file: 'deps.edn', tags: ['clojure'] },

  // .NET
  { file: 'Directory.Build.props', tags: ['dotnet'] },

  // Functional languages
  { file: 'mix.exs', tags: ['elixir'] },
  { file: 'rebar.config', tags: ['erlang'] },
  { file: 'stack.yaml', tags: ['haskell'] },
  { file: 'dune-project', tags: ['ocaml'] },
  { file: 'gleam.toml', tags: ['gleam'] },

  // Scripting languages
  { file: 'Gemfile', tags: ['ruby'] },
  { file: 'Rakefile', tags: ['ruby'] },
  { file: 'composer.json', tags: ['php'] },
  { file: 'artisan', tags: ['php', 'laravel'] },
  { file: 'cpanfile', tags: ['perl'] },
  { file: 'Makefile.PL', tags: ['perl'] },
  { file: 'dist.ini', tags: ['perl'] },

  // Mobile / cross-platform
  { file: 'pubspec.yaml', tags: ['dart'] },
  { file: 'Podfile', tags: ['ios'] },
  { file: 'src-tauri', isDir: true, tags: ['tauri'] },

  // Newer / niche languages
  { file: 'shard.yml', tags: ['crystal'] },
  { file: 'v.mod', tags: ['vlang'] },
  { file: 'fpm.toml', tags: ['fortran'] },

  // Containers & infra
  { file: 'Dockerfile', tags: ['docker'] },
  { file: 'docker-compose.yml', tags: ['docker'] },
  { file: 'docker-compose.yaml', tags: ['docker'] },
  { file: 'compose.yml', tags: ['docker'] },
  { file: 'compose.yaml', tags: ['docker'] },
  { file: 'main.tf', tags: ['terraform'] },
  { file: 'Pulumi.yaml', tags: ['pulumi'] },
  { file: 'Chart.yaml', tags: ['helm'] },
  { file: 'kustomization.yaml', tags: ['kubernetes'] },
  { file: 'cdk.json', tags: ['cdk'] },
  { file: 'serverless.yml', tags: ['serverless'] },
  { file: 'serverless.ts', tags: ['serverless'] },
  { file: 'Vagrantfile', tags: ['vagrant'] },
  { file: 'flake.nix', tags: ['nix'] },
  { file: 'default.nix', tags: ['nix'] },
  { file: 'shell.nix', tags: ['nix'] },
  { file: 'ansible.cfg', tags: ['ansible'] },

  // Build / task runners
  { file: 'Makefile', tags: ['make'] },
  { file: 'Justfile', tags: ['just'] },
  { file: 'justfile', tags: ['just'] },
  { file: 'Taskfile.yml', tags: ['taskfile'] },
  { file: 'Taskfile.yaml', tags: ['taskfile'] },
  { file: 'MODULE.bazel', tags: ['bazel'] },
  { file: 'WORKSPACE', tags: ['bazel'] },
  { file: 'Earthfile', tags: ['earthly'] },
  { file: 'pants.toml', tags: ['pants'] },
  { file: 'nx.json', tags: ['nx'] },
  { file: 'turbo.json', tags: ['turbo'] },

  // Documentation / static sites
  { file: 'hugo.toml', tags: ['hugo'] },
  { file: 'hugo.yaml', tags: ['hugo'] },
  { file: 'mkdocs.yml', tags: ['mkdocs'] },
  { file: 'book.toml', tags: ['mdbook'] },
  { file: '_config.yml', tags: ['jekyll'] },

  // Frontend frameworks (detected via npm scripts, tagged for metadata)
  { file: 'next.config.js', tags: ['nextjs'] },
  { file: 'next.config.mjs', tags: ['nextjs'] },
  { file: 'next.config.ts', tags: ['nextjs'] },
  { file: 'nuxt.config.ts', tags: ['nuxt'] },
  { file: 'nuxt.config.js', tags: ['nuxt'] },
  { file: 'vite.config.ts', tags: ['vite'] },
  { file: 'vite.config.js', tags: ['vite'] },
  { file: 'astro.config.mjs', tags: ['astro'] },
  { file: 'astro.config.ts', tags: ['astro'] },
  { file: 'svelte.config.js', tags: ['svelte'] },
  { file: 'gatsby-config.js', tags: ['gatsby'] },
  { file: 'gatsby-config.ts', tags: ['gatsby'] },
  { file: '.eleventy.js', tags: ['eleventy'] },
  { file: 'eleventy.config.js', tags: ['eleventy'] },
  { file: 'docusaurus.config.js', tags: ['docusaurus'] },
  { file: 'docusaurus.config.ts', tags: ['docusaurus'] },

  // Data / ML
  { file: 'dvc.yaml', tags: ['dvc'] },
  { file: 'MLproject', tags: ['mlflow'] },
  { file: 'pixi.toml', tags: ['pixi'] },
  { file: 'environment.yml', tags: ['conda'] },
  { file: 'environment.yaml', tags: ['conda'] },

  // Blockchain / Web3
  { file: 'foundry.toml', tags: ['solidity'] },
  { file: 'hardhat.config.ts', tags: ['solidity'] },
  { file: 'hardhat.config.js', tags: ['solidity'] },
  { file: 'Anchor.toml', tags: ['solana'] },
  { file: 'truffle-config.js', tags: ['solidity'] },

  // Game dev
  { file: 'project.godot', tags: ['godot'] },
  { file: 'conf.lua', tags: ['love2d'] },

  // API / protocol
  { file: 'buf.yaml', tags: ['protobuf'] },
  { file: 'openapi.yaml', tags: ['openapi'] },
  { file: 'openapi.json', tags: ['openapi'] },
  { file: 'swagger.yaml', tags: ['openapi'] },

  // AI
  { file: 'CLAUDE.md', tags: ['ai'] },
  { file: '.claude', isDir: true, tags: ['ai'] },
]

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.Trash',
  '__pycache__',
  '.cache',
])

function detectVenv(dir: string): string | undefined {
  if (fs.existsSync(path.join(dir, '.venv'))) return '.venv'
  if (fs.existsSync(path.join(dir, 'venv'))) return 'venv'
  return undefined
}

function detectAiConfig(dir: string): string | undefined {
  if (fs.existsSync(path.join(dir, 'CLAUDE.md'))) return 'CLAUDE.md'
  if (fs.existsSync(path.join(dir, '.claude'))) return '.claude'
  return undefined
}

export function detectProject(dir: string): DetectedProject | null {
  const name = path.basename(dir)

  const tags = new Set<string>()
  let matched = false

  for (const signal of SIGNALS) {
    const fullPath = path.join(dir, signal.file)
    const exists = signal.isDir
      ? fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()
      : fs.existsSync(fullPath)

    if (exists) {
      matched = true
      for (const tag of signal.tags) {
        tags.add(tag)
      }
    }
  }

  const hasGit = fs.existsSync(path.join(dir, '.git'))
  if (hasGit) matched = true

  if (!matched) return null

  return {
    name,
    path: dir,
    tags: [...tags],
    venv: detectVenv(dir),
    remote: getRemoteUrl(dir),
    hasGit,
    aiConfig: detectAiConfig(dir),
  }
}

export function scanDirectory(dir: string, skipPaths?: Set<string>): DetectedProject[] {
  const resolvedDir = path.resolve(dir.replace(/^~/, process.env['HOME'] ?? ''))

  if (!fs.existsSync(resolvedDir)) return []

  const entries = fs.readdirSync(resolvedDir, { withFileTypes: true })
  const projects: DetectedProject[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue

    const fullPath = path.join(resolvedDir, entry.name)
    if (skipPaths?.has(fullPath)) continue
    const detected = detectProject(fullPath)
    if (detected) {
      projects.push(detected)
    }
  }

  return projects.sort((a, b) => a.name.localeCompare(b.name))
}
