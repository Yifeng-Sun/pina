import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { detectProject, scanDirectory } from '../src/lib/detector.js'

vi.mock('../src/lib/git.js', () => ({
  getRemoteUrl: () => undefined,
}))

let tmp: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pina-test-'))
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

function touch(p: string, content = '') {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}

describe('detectProject', () => {
  it('returns null for an empty directory', () => {
    expect(detectProject(tmp)).toBeNull()
  })

  it('detects a node project from package.json', () => {
    touch(path.join(tmp, 'package.json'), '{}')
    const d = detectProject(tmp)
    expect(d).not.toBeNull()
    expect(d!.tags).toContain('node')
    expect(d!.hasGit).toBe(false)
  })

  it('combines node + typescript tags', () => {
    touch(path.join(tmp, 'package.json'), '{}')
    touch(path.join(tmp, 'tsconfig.json'), '{}')
    const d = detectProject(tmp)!
    expect(d.tags.sort()).toEqual(['node', 'typescript'])
  })

  it('detects python projects via pyproject.toml', () => {
    touch(path.join(tmp, 'pyproject.toml'))
    expect(detectProject(tmp)!.tags).toContain('python')
  })

  it('detects venv directory and reports it', () => {
    fs.mkdirSync(path.join(tmp, '.venv'))
    const d = detectProject(tmp)!
    expect(d.venv).toBe('.venv')
    expect(d.tags).toContain('python')
  })

  it('detects ai config from CLAUDE.md', () => {
    touch(path.join(tmp, 'CLAUDE.md'))
    const d = detectProject(tmp)!
    expect(d.aiConfig).toBe('CLAUDE.md')
    expect(d.tags).toContain('ai')
  })

  it('detects bare git repo with no other signals', () => {
    fs.mkdirSync(path.join(tmp, '.git'))
    const d = detectProject(tmp)!
    expect(d.hasGit).toBe(true)
    expect(d.tags).toEqual([])
  })

  it('uses the directory basename as the project name', () => {
    const sub = path.join(tmp, 'my-app')
    fs.mkdirSync(sub)
    touch(path.join(sub, 'go.mod'))
    expect(detectProject(sub)!.name).toBe('my-app')
  })

  it('does not detect a file with the wrong type (isDir mismatch)', () => {
    touch(path.join(tmp, '.claude')) // file, not dir
    expect(detectProject(tmp)).toBeNull()
  })
})

describe('scanDirectory', () => {
  it('returns [] for nonexistent directory', () => {
    expect(scanDirectory(path.join(tmp, 'missing'))).toEqual([])
  })

  it('returns detected child projects, skipping hidden and dotfiles', () => {
    touch(path.join(tmp, 'a', 'package.json'), '{}')
    touch(path.join(tmp, 'b', 'Cargo.toml'))
    fs.mkdirSync(path.join(tmp, '.hidden'))
    touch(path.join(tmp, '.hidden', 'package.json'), '{}')
    const results = scanDirectory(tmp)
    expect(results.map(r => r.name)).toEqual(['a', 'b'])
  })

  it('skips node_modules', () => {
    touch(path.join(tmp, 'node_modules', 'package.json'), '{}')
    expect(scanDirectory(tmp)).toEqual([])
  })

  it('honours skipPaths', () => {
    touch(path.join(tmp, 'a', 'package.json'), '{}')
    touch(path.join(tmp, 'b', 'package.json'), '{}')
    const results = scanDirectory(tmp, new Set([path.join(tmp, 'a')]))
    expect(results.map(r => r.name)).toEqual(['b'])
  })

  it('sorts results alphabetically', () => {
    touch(path.join(tmp, 'zebra', 'package.json'), '{}')
    touch(path.join(tmp, 'apple', 'package.json'), '{}')
    touch(path.join(tmp, 'mango', 'package.json'), '{}')
    expect(scanDirectory(tmp).map(r => r.name)).toEqual(['apple', 'mango', 'zebra'])
  })
})
