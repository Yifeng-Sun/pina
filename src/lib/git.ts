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
