import fs from 'node:fs'
import path from 'node:path'

export interface QuickAction {
  id: string
  label: string
  icon: string
  command: string
  args: string[]
  source: 'detected' | 'custom'
}

// Nerd Font icons per project type
const ICON_NODE = '\ue718'     //  (nf-dev-nodejs_small)
const ICON_PYTHON = '\ue73c'   //  (nf-dev-python)
const ICON_RUST = '\ue7a8'     //  (nf-dev-rust)
const ICON_GO = '\ue626'       //  (nf-dev-go)
const ICON_JAVA = '\ue738'     //  (nf-dev-java)
const ICON_MAKE = '\uf489'     //  (nf-oct-terminal)
const ICON_CUSTOM = '\uf0ad'   //  (nf-fa-wrench)

// Priority order for picking the "most suggested" action
const PRIMARY_IDS = [
  'npm:dev', 'npm:start', 'cargo:run', 'go:run',
  'npm:build', 'cargo:build', 'mvn:compile', 'make:all', 'make:build',
  'npm:test', 'cargo:test', 'mvn:test', 'python:test', 'go:test',
  'npm:install', 'python:install',
]

// Preferred script ordering for node projects
const NODE_SCRIPT_ORDER = ['dev', 'start', 'build', 'test', 'lint', 'typecheck', 'check', 'format']

function detectPackageManager(dir: string): string {
  if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm'
  if (fs.existsSync(path.join(dir, 'yarn.lock'))) return 'yarn'
  if (fs.existsSync(path.join(dir, 'bun.lockb'))) return 'bun'
  return 'npm'
}

function detectNode(dir: string): QuickAction[] {
  const pkgPath = path.join(dir, 'package.json')
  if (!fs.existsSync(pkgPath)) return []
  const pm = detectPackageManager(dir)
  const actions: QuickAction[] = []

  actions.push({ id: 'npm:install', label: `${pm} install`, icon: ICON_NODE, command: pm, args: ['install'], source: 'detected' })

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    const scripts = (pkg.scripts ?? {}) as Record<string, string>
    const scriptNames = Object.keys(scripts)
    const ordered = [
      ...NODE_SCRIPT_ORDER.filter(s => scriptNames.includes(s)),
      ...scriptNames.filter(s => !NODE_SCRIPT_ORDER.includes(s)),
    ]
    for (const name of ordered) {
      actions.push({
        id: `npm:${name}`,
        label: `${pm} run ${name}`,
        icon: ICON_NODE,
        command: pm,
        args: ['run', name],
        source: 'detected',
      })
    }
  } catch {}

  return actions
}

function detectPython(dir: string): QuickAction[] {
  const actions: QuickAction[] = []
  if (fs.existsSync(path.join(dir, 'requirements.txt'))) {
    actions.push({ id: 'python:install', label: 'pip install -r requirements.txt', icon: ICON_PYTHON, command: 'pip', args: ['install', '-r', 'requirements.txt'], source: 'detected' })
  }
  if (fs.existsSync(path.join(dir, 'pyproject.toml')) || fs.existsSync(path.join(dir, 'setup.py')) || fs.existsSync(path.join(dir, 'pytest.ini'))) {
    actions.push({ id: 'python:test', label: 'pytest', icon: ICON_PYTHON, command: 'pytest', args: [], source: 'detected' })
  }
  return actions
}

function detectMake(dir: string): QuickAction[] {
  const makefile = path.join(dir, 'Makefile')
  if (!fs.existsSync(makefile)) return []
  const actions: QuickAction[] = []
  try {
    const content = fs.readFileSync(makefile, 'utf-8')
    const targetRe = /^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:/gm
    const seen = new Set<string>()
    let match
    while ((match = targetRe.exec(content)) !== null) {
      const target = match[1]!
      if (seen.has(target)) continue
      seen.add(target)
      actions.push({
        id: `make:${target}`,
        label: `make ${target}`,
        icon: ICON_MAKE,
        command: 'make',
        args: [target],
        source: 'detected',
      })
    }
  } catch {}
  return actions
}

function detectMaven(dir: string): QuickAction[] {
  if (!fs.existsSync(path.join(dir, 'pom.xml'))) return []
  return [
    { id: 'mvn:compile', label: 'mvn compile', icon: ICON_JAVA, command: 'mvn', args: ['compile'], source: 'detected' },
    { id: 'mvn:test', label: 'mvn test', icon: ICON_JAVA, command: 'mvn', args: ['test'], source: 'detected' },
    { id: 'mvn:package', label: 'mvn package', icon: ICON_JAVA, command: 'mvn', args: ['package'], source: 'detected' },
    { id: 'mvn:clean', label: 'mvn clean', icon: ICON_JAVA, command: 'mvn', args: ['clean'], source: 'detected' },
  ]
}

export function detectQuickActions(projectPath: string): QuickAction[] {
  return [
    ...detectNode(projectPath),
    ...detectPython(projectPath),
    ...detectMake(projectPath),
    ...detectMaven(projectPath),
  ]
}

// ---- Custom actions persistence ----

const ACTIONS_DIR = '.pina'
const ACTIONS_FILE = 'actions.json'

function actionsFilePath(projectPath: string): string {
  return path.join(projectPath, ACTIONS_DIR, ACTIONS_FILE)
}

export function loadCustomActions(projectPath: string): QuickAction[] {
  const fp = actionsFilePath(projectPath)
  if (!fs.existsSync(fp)) return []
  try {
    const raw = JSON.parse(fs.readFileSync(fp, 'utf-8'))
    if (!Array.isArray(raw)) return []
    return raw.map((entry: any) => ({
      id: entry.id ?? `custom:${entry.label}`,
      label: entry.label ?? `${entry.command} ${(entry.args ?? []).join(' ')}`,
      icon: entry.icon ?? ICON_CUSTOM,
      command: entry.command,
      args: entry.args ?? [],
      source: 'custom' as const,
    }))
  } catch {
    return []
  }
}

export function saveCustomActions(projectPath: string, actions: QuickAction[]): void {
  const dir = path.join(projectPath, ACTIONS_DIR)
  fs.mkdirSync(dir, { recursive: true })
  const data = actions.map(a => ({
    id: a.id,
    label: a.label,
    command: a.command,
    args: a.args,
  }))
  fs.writeFileSync(actionsFilePath(projectPath), JSON.stringify(data, null, 2), 'utf-8')
}

export function removeCustomAction(projectPath: string, actionId: string): boolean {
  const existing = loadCustomActions(projectPath)
  const filtered = existing.filter(a => a.id !== actionId)
  if (filtered.length === existing.length) return false
  saveCustomActions(projectPath, filtered)
  return true
}

// ---- Merge detected + custom ----

export function getQuickActions(projectPath: string): QuickAction[] {
  const detected = detectQuickActions(projectPath)
  const custom = loadCustomActions(projectPath)
  const customIds = new Set(custom.map(a => a.id))
  const merged = detected.filter(a => !customIds.has(a.id))
  return [...custom, ...merged]
}

// ---- Actions metadata: defaults + LRU history ----

interface ActionsMeta {
  defaults: string[] // action ids always shown on surface
  history: string[]  // most-recently-used action ids (newest first)
}

function metaFilePath(projectPath: string): string {
  return path.join(projectPath, ACTIONS_DIR, 'actions-meta.json')
}

export function loadActionsMeta(projectPath: string): ActionsMeta {
  const fp = metaFilePath(projectPath)
  if (!fs.existsSync(fp)) return { defaults: [], history: [] }
  try {
    const raw = JSON.parse(fs.readFileSync(fp, 'utf-8'))
    return {
      defaults: Array.isArray(raw.defaults) ? raw.defaults : [],
      history: Array.isArray(raw.history) ? raw.history : [],
    }
  } catch {
    return { defaults: [], history: [] }
  }
}

export function saveActionsMeta(projectPath: string, meta: ActionsMeta): void {
  const dir = path.join(projectPath, ACTIONS_DIR)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(metaFilePath(projectPath), JSON.stringify(meta, null, 2), 'utf-8')
}

export function recordActionUsage(projectPath: string, actionId: string): void {
  const meta = loadActionsMeta(projectPath)
  meta.history = [actionId, ...meta.history.filter(id => id !== actionId)].slice(0, 50)
  saveActionsMeta(projectPath, meta)
}

/** Returns 'added' | 'removed' | 'limit_reached' */
export function toggleDefault(projectPath: string, actionId: string): 'added' | 'removed' | 'limit_reached' {
  const meta = loadActionsMeta(projectPath)
  const idx = meta.defaults.indexOf(actionId)
  if (idx >= 0) {
    meta.defaults.splice(idx, 1)
    saveActionsMeta(projectPath, meta)
    return 'removed'
  } else {
    if (meta.defaults.length >= MAX_DEFAULTS) return 'limit_reached'
    meta.defaults.push(actionId)
    saveActionsMeta(projectPath, meta)
    return 'added'
  }
}

const MAX_DEFAULTS = 5
const MAX_SURFACE = 5

/** Returns up to MAX_SURFACE actions: defaults first (always shown), then LRU / suggested fill. */
export function getSurfaceActions(projectPath: string): QuickAction[] {
  const all = getQuickActions(projectPath)
  if (all.length === 0) return []
  const meta = loadActionsMeta(projectPath)
  const byId = new Map(all.map(a => [a.id, a]))
  const surface: QuickAction[] = []
  const seen = new Set<string>()

  // Defaults always show (count toward limit)
  for (const id of meta.defaults) {
    const a = byId.get(id)
    if (a && !seen.has(id)) {
      surface.push(a)
      seen.add(id)
    }
  }

  // Fill remaining slots with LRU history
  for (const id of meta.history) {
    if (surface.length >= MAX_SURFACE) break
    const a = byId.get(id)
    if (a && !seen.has(id)) {
      surface.push(a)
      seen.add(id)
    }
  }

  // Fill with suggested priorities
  for (const id of PRIMARY_IDS) {
    if (surface.length >= MAX_SURFACE) break
    const a = byId.get(id)
    if (a && !seen.has(id)) {
      surface.push(a)
      seen.add(id)
    }
  }

  // Last resort: fill from all
  for (const a of all) {
    if (surface.length >= MAX_SURFACE) break
    if (!seen.has(a.id)) {
      surface.push(a)
      seen.add(a.id)
    }
  }

  return surface
}

// ---- AI agent prompt ----

export const ACTIONS_AGENT_PROMPT = `You are a project setup assistant. Analyze this project's structure and generate a \`.pina/actions.json\` file containing useful quick actions.

Look at the project's build system, scripts, Makefile targets, and common development workflows. Output a JSON array where each entry has:
- "id": unique identifier like "custom:deploy"
- "label": human-readable name shown in the menu
- "command": the executable to run
- "args": array of arguments

Focus on: build, test, lint, format, dev server, deploy, clean, and any project-specific workflows.

Write the file to \`.pina/actions.json\` in the project root.`
