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
  { file: 'package.json', tags: ['node'] },
  { file: 'tsconfig.json', tags: ['typescript'] },
  { file: 'pyproject.toml', tags: ['python'] },
  { file: 'setup.py', tags: ['python'] },
  { file: 'requirements.txt', tags: ['python'] },
  { file: 'Cargo.toml', tags: ['rust'] },
  { file: 'go.mod', tags: ['go'] },
  { file: 'pom.xml', tags: ['java'] },
  { file: 'build.gradle', tags: ['java'] },
  { file: 'Dockerfile', tags: ['docker'] },
  { file: 'docker-compose.yml', tags: ['docker'] },
  { file: 'docker-compose.yaml', tags: ['docker'] },
  { file: 'CLAUDE.md', tags: ['ai'] },
  { file: '.claude', isDir: true, tags: ['ai'] },
  { file: '.venv', isDir: true, tags: ['python'] },
  { file: 'venv', isDir: true, tags: ['python'] },
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

export function scanDirectory(dir: string): DetectedProject[] {
  const resolvedDir = path.resolve(dir.replace(/^~/, process.env['HOME'] ?? ''))

  if (!fs.existsSync(resolvedDir)) return []

  const entries = fs.readdirSync(resolvedDir, { withFileTypes: true })
  const projects: DetectedProject[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue

    const fullPath = path.join(resolvedDir, entry.name)
    const detected = detectProject(fullPath)
    if (detected) {
      projects.push(detected)
    }
  }

  return projects.sort((a, b) => a.name.localeCompare(b.name))
}
