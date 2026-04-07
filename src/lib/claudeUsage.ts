import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export interface ClaudeUsageStats {
  sessions: number
  messages: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  models: Record<string, number>
  lastActivity?: string // ISO
  firstActivity?: string // ISO
}

function projectDirFor(projectPath: string): string {
  // ~/.claude/projects/<encoded>
  // encoding: replace path separators and dots with '-', leading '-'
  const encoded = projectPath.replace(/[/.]/g, '-')
  return path.join(os.homedir(), '.claude', 'projects', encoded)
}

export function getClaudeUsage(projectPath: string): ClaudeUsageStats {
  const stats: ClaudeUsageStats = {
    sessions: 0,
    messages: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    models: {},
  }
  const dir = projectDirFor(projectPath)
  if (!fs.existsSync(dir)) return stats
  let files: string[]
  try {
    files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'))
  } catch {
    return stats
  }
  stats.sessions = files.length
  for (const f of files) {
    const full = path.join(dir, f)
    let content: string
    try {
      content = fs.readFileSync(full, 'utf-8')
    } catch {
      continue
    }
    for (const line of content.split('\n')) {
      if (!line) continue
      let obj: any
      try { obj = JSON.parse(line) } catch { continue }
      const msg = obj?.message
      const usage = msg?.usage
      const ts: string | undefined = obj?.timestamp
      if (ts) {
        if (!stats.lastActivity || ts > stats.lastActivity) stats.lastActivity = ts
        if (!stats.firstActivity || ts < stats.firstActivity) stats.firstActivity = ts
      }
      if (!usage) continue
      stats.messages += 1
      stats.inputTokens += usage.input_tokens ?? 0
      stats.outputTokens += usage.output_tokens ?? 0
      stats.cacheReadTokens += usage.cache_read_input_tokens ?? 0
      stats.cacheCreationTokens += usage.cache_creation_input_tokens ?? 0
      const model: string | undefined = msg?.model
      if (model) stats.models[model] = (stats.models[model] ?? 0) + 1
    }
  }
  return stats
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return `${n}`
}

export function formatRelative(iso?: string): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (isNaN(t)) return '—'
  const diff = Date.now() - t
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}
