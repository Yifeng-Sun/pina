import { spawn } from 'node:child_process'
import type { QuickAction } from './quickActions.js'

const MAX_LINES = 10_000

export interface RunHandle {
  kill(): void
  onData(cb: (chunk: string) => void): () => void
  onExit(cb: (code: number | null) => void): () => void
}

export function runAction(action: QuickAction, cwd: string): RunHandle {
  const dataCbs = new Set<(chunk: string) => void>()
  const exitCbs = new Set<(code: number | null) => void>()
  let lineCount = 0

  const child = spawn(action.command, action.args, {
    cwd,
    env: { ...process.env, FORCE_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const handleChunk = (chunk: Buffer) => {
    if (lineCount >= MAX_LINES) return
    const text = chunk.toString('utf-8')
    lineCount += text.split('\n').length
    for (const cb of dataCbs) cb(text)
  }

  child.stdout?.on('data', handleChunk)
  child.stderr?.on('data', handleChunk)

  let exited = false
  child.on('exit', (code) => {
    exited = true
    for (const cb of exitCbs) cb(code)
  })
  child.on('error', (err) => {
    if (!exited) {
      for (const cb of dataCbs) cb(`\n[error] ${err.message}\n`)
      for (const cb of exitCbs) cb(1)
      exited = true
    }
  })

  return {
    kill() {
      if (!child.killed && !exited) {
        child.kill('SIGTERM')
        setTimeout(() => {
          if (!child.killed && !exited) child.kill('SIGKILL')
        }, 2000)
      }
    },
    onData(cb) {
      dataCbs.add(cb)
      return () => { dataCbs.delete(cb) }
    },
    onExit(cb) {
      exitCbs.add(cb)
      return () => { exitCbs.delete(cb) }
    },
  }
}
