import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export function isGitRepo(dir: string): boolean {
  return fs.existsSync(path.join(dir, '.git'))
}

export function getRemoteUrl(dir: string): string | undefined {
  if (!isGitRepo(dir)) return undefined
  try {
    const url = execSync('git config --get remote.origin.url', {
      cwd: dir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    return url || undefined
  } catch {
    return undefined
  }
}

export function getCommitCount(dir: string): number {
  if (!isGitRepo(dir)) return 0
  try {
    const count = execSync('git rev-list --count HEAD', {
      cwd: dir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    return parseInt(count, 10) || 0
  } catch {
    return 0
  }
}

export function getCurrentBranch(dir: string): string | undefined {
  if (!isGitRepo(dir)) return undefined
  try {
    return execSync('git branch --show-current', {
      cwd: dir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim() || undefined
  } catch {
    return undefined
  }
}

export function getBranchCount(dir: string): number {
  if (!isGitRepo(dir)) return 0
  try {
    const output = execSync('git branch --list', {
      cwd: dir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    return output ? output.split('\n').length : 0
  } catch {
    return 0
  }
}

export interface UpstreamStatus {
  ahead: number
  behind: number
  tracking?: string // e.g. "origin/main"
}

export function getUpstreamStatus(dir: string): UpstreamStatus | undefined {
  if (!isGitRepo(dir)) return undefined
  try {
    const output = execSync('git status --branch --porcelain=v2', {
      cwd: dir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let ahead = 0
    let behind = 0
    let tracking: string | undefined
    for (const line of output.split('\n')) {
      if (line.startsWith('# branch.upstream ')) {
        tracking = line.slice('# branch.upstream '.length)
      }
      if (line.startsWith('# branch.ab ')) {
        const match = line.match(/\+(\d+) -(\d+)/)
        if (match) {
          ahead = parseInt(match[1]!, 10)
          behind = parseInt(match[2]!, 10)
        }
      }
    }
    if (!tracking) return undefined
    return { ahead, behind, tracking }
  } catch {
    return undefined
  }
}

export function getRemoteBrowserUrl(dir: string): string | undefined {
  const url = getRemoteUrl(dir)
  if (!url) return undefined
  // Convert git@... or https://...git to browser URL
  let browserUrl = url
    .replace(/\.git$/, '')
    .replace(/^git@([^:]+):/, 'https://$1/')
    .replace(/^ssh:\/\/git@([^/]+)\//, 'https://$1/')
  return browserUrl
}

export function getLocalBranches(dir: string): string[] {
  if (!isGitRepo(dir)) return []
  try {
    const output = execSync('git branch --list --format="%(refname:short)"', {
      cwd: dir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    return output ? output.split('\n') : []
  } catch {
    return []
  }
}

export function getRemoteBranches(dir: string): string[] {
  if (!isGitRepo(dir)) return []
  try {
    const output = execSync('git branch --remotes --format="%(refname:short)"', {
      cwd: dir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    if (!output) return []
    return output
      .split('\n')
      .map(branch => branch.trim())
      .filter(branch => branch.length > 0 && !branch.includes('->'))
  } catch {
    return []
  }
}

export function isDirty(dir: string): boolean {
  if (!isGitRepo(dir)) return false
  try {
    const output = execSync('git status --porcelain', {
      cwd: dir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    return output.length > 0
  } catch {
    return false
  }
}
