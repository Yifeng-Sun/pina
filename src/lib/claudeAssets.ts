import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

export type Scope = 'personal' | 'project'
export type AssetKind = 'agent' | 'skill'

export interface Asset {
  kind: AssetKind
  scope: Scope
  name: string
  description: string
  model?: string
  tools?: string[]
  filePath: string
  body: string
  shadowedBy?: Scope
}

function personalRoot(kind: AssetKind): string {
  return path.join(os.homedir(), '.claude', kind === 'agent' ? 'agents' : 'skills')
}

function projectRoot(projectPath: string, kind: AssetKind): string {
  return path.join(projectPath, '.claude', kind === 'agent' ? 'agents' : 'skills')
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
}

// ---- minimal frontmatter parser (flat keys only) ----
interface Frontmatter {
  name?: string
  description?: string
  model?: string
  tools?: string[]
}

function parseFrontmatter(src: string): { fm: Frontmatter; body: string } {
  if (!src.startsWith('---')) return { fm: {}, body: src }
  const end = src.indexOf('\n---', 3)
  if (end === -1) return { fm: {}, body: src }
  const header = src.slice(3, end).replace(/^\r?\n/, '')
  const rest = src.slice(end + 4).replace(/^\r?\n/, '')
  const fm: Frontmatter = {}
  for (const raw of header.split(/\r?\n/)) {
    const line = raw.trimEnd()
    if (!line || line.startsWith('#')) continue
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/)
    if (!m) continue
    const key = m[1]!
    let val = m[2]!.trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (key === 'tools') {
      const arr = val.startsWith('[') && val.endsWith(']')
        ? val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
        : val.split(',').map(s => s.trim()).filter(Boolean)
      fm.tools = arr
    } else if (key === 'name' || key === 'description' || key === 'model') {
      ;(fm as any)[key] = val
    }
  }
  return { fm, body: rest }
}

function serializeFrontmatter(fm: Frontmatter, body: string): string {
  const lines: string[] = ['---']
  if (fm.name) lines.push(`name: ${fm.name}`)
  if (fm.description !== undefined) {
    const d = fm.description.includes('\n') || fm.description.includes(':')
      ? JSON.stringify(fm.description)
      : fm.description
    lines.push(`description: ${d}`)
  }
  if (fm.model) lines.push(`model: ${fm.model}`)
  if (fm.tools && fm.tools.length > 0) lines.push(`tools: ${fm.tools.join(', ')}`)
  lines.push('---', '', body.replace(/^\n+/, ''))
  return lines.join('\n')
}

// ---- listing ----
function readAgentFile(filePath: string, scope: Scope): Asset | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const { fm, body } = parseFrontmatter(raw)
    const name = fm.name ?? path.basename(filePath, '.md')
    return {
      kind: 'agent',
      scope,
      name,
      description: fm.description ?? '',
      model: fm.model,
      tools: fm.tools,
      filePath,
      body,
    }
  } catch {
    return null
  }
}

function readSkillFile(skillMdPath: string, scope: Scope): Asset | null {
  try {
    const raw = fs.readFileSync(skillMdPath, 'utf-8')
    const { fm, body } = parseFrontmatter(raw)
    const name = fm.name ?? path.basename(path.dirname(skillMdPath))
    return {
      kind: 'skill',
      scope,
      name,
      description: fm.description ?? '',
      filePath: skillMdPath,
      body,
    }
  } catch {
    return null
  }
}

function listAgentsInDir(dir: string, scope: Scope): Asset[] {
  if (!fs.existsSync(dir)) return []
  const out: Asset[] = []
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith('.md')) continue
    const a = readAgentFile(path.join(dir, entry), scope)
    if (a) out.push(a)
  }
  return out
}

function listSkillsInDir(dir: string, scope: Scope): Asset[] {
  if (!fs.existsSync(dir)) return []
  const out: Asset[] = []
  for (const entry of fs.readdirSync(dir)) {
    const skillMd = path.join(dir, entry, 'SKILL.md')
    if (fs.existsSync(skillMd)) {
      const s = readSkillFile(skillMd, scope)
      if (s) out.push(s)
    }
  }
  return out
}

function applyShadow(personal: Asset[], project: Asset[]): Asset[] {
  const projectNames = new Set(project.map(a => a.name))
  const personalMarked = personal.map(a =>
    projectNames.has(a.name) ? { ...a, shadowedBy: 'project' as Scope } : a
  )
  return [...project, ...personalMarked]
}

export function listAgents(projectPath?: string): Asset[] {
  const personal = listAgentsInDir(personalRoot('agent'), 'personal')
  const project = projectPath ? listAgentsInDir(projectRoot(projectPath, 'agent'), 'project') : []
  return applyShadow(personal, project)
}

export function listSkills(projectPath?: string): Asset[] {
  const personal = listSkillsInDir(personalRoot('skill'), 'personal')
  const project = projectPath ? listSkillsInDir(projectRoot(projectPath, 'skill'), 'project') : []
  return applyShadow(personal, project)
}

// ---- mutations ----
function agentFilePath(scope: Scope, name: string, projectPath?: string): string {
  const root = scope === 'personal' ? personalRoot('agent') : projectRoot(projectPath!, 'agent')
  return path.join(root, `${name}.md`)
}

function skillMdPath(scope: Scope, name: string, projectPath?: string): string {
  const root = scope === 'personal' ? personalRoot('skill') : projectRoot(projectPath!, 'skill')
  return path.join(root, name, 'SKILL.md')
}

export interface WriteFields {
  description?: string
  body?: string
  model?: string
  tools?: string[]
}

export function writeAsset(asset: Asset, fields: WriteFields): void {
  const fm: Frontmatter = {
    name: asset.name,
    description: fields.description ?? asset.description,
    model: fields.model ?? asset.model,
    tools: fields.tools ?? asset.tools,
  }
  const body = fields.body ?? asset.body
  ensureDir(path.dirname(asset.filePath))
  fs.writeFileSync(asset.filePath, serializeFrontmatter(fm, body), 'utf-8')
}

export function createAsset(params: {
  kind: AssetKind
  scope: Scope
  name: string
  description?: string
  body?: string
  model?: string
  projectPath?: string
}): Asset {
  const { kind, scope, name, projectPath } = params
  if (scope === 'project' && !projectPath) {
    throw new Error('projectPath required for project scope')
  }
  const filePath = kind === 'agent'
    ? agentFilePath(scope, name, projectPath)
    : skillMdPath(scope, name, projectPath)
  if (fs.existsSync(filePath)) {
    throw new Error(`${kind} '${name}' already exists in ${scope} scope`)
  }
  const asset: Asset = {
    kind,
    scope,
    name,
    description: params.description ?? '',
    model: params.model,
    filePath,
    body: params.body ?? '',
  }
  writeAsset(asset, {})
  return asset
}

export function deleteAsset(asset: Asset): void {
  if (asset.kind === 'agent') {
    if (fs.existsSync(asset.filePath)) fs.unlinkSync(asset.filePath)
  } else {
    const dir = path.dirname(asset.filePath)
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
  }
}
