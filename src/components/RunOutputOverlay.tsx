import React, { useEffect, useRef, useState } from 'react'
import { execSync } from 'node:child_process'
import { Box, Text, useInput, useStdout } from 'ink'
import { theme } from '../lib/theme.js'
import { runAction, type RunHandle } from '../lib/actionRunner.js'
import type { QuickAction } from '../lib/quickActions.js'

export function RunOutputOverlay({
  action,
  projectPath,
  onClose,
}: {
  action: QuickAction
  projectPath: string
  onClose: () => void
}) {
  const [lines, setLines] = useState<string[]>([])
  const [status, setStatus] = useState<'running' | 'exited'>('running')
  const [exitCode, setExitCode] = useState<number | null>(null)
  const [scroll, setScroll] = useState(0) // 0 = follow tail
  const [runId, setRunId] = useState(0)
  const handleRef = useRef<RunHandle | null>(null)
  const bufferRef = useRef('')
  const { stdout } = useStdout()
  const rows = Math.max(8, (stdout?.rows ?? 24) - 10)

  useEffect(() => {
    setLines([])
    setStatus('running')
    setExitCode(null)
    setScroll(0)
    bufferRef.current = ''

    const h = runAction(action, projectPath)
    handleRef.current = h

    const offData = h.onData((chunk) => {
      bufferRef.current += chunk
      const parts = bufferRef.current.split('\n')
      bufferRef.current = parts.pop() ?? ''
      if (parts.length > 0) {
        setLines(prev => {
          const next = prev.concat(parts)
          return next.length > 10_000 ? next.slice(next.length - 10_000) : next
        })
      }
    })

    const offExit = h.onExit((code) => {
      // Flush remaining buffer
      if (bufferRef.current) {
        const tail = bufferRef.current
        bufferRef.current = ''
        setLines(prev => prev.concat([tail]))
      }
      setStatus('exited')
      setExitCode(code)
    })

    return () => {
      offData()
      offExit()
      h.kill()
    }
  }, [action.id, runId, projectPath])

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      handleRef.current?.kill()
      onClose()
      return
    }
    if (input === 'r' && status === 'exited') {
      setRunId(n => n + 1)
      return
    }
    if (input === 'k' && status === 'running') {
      handleRef.current?.kill()
      return
    }
    if (input === 'c') {
      try {
        execSync('pbcopy', { input: lines.join('\n'), stdio: ['pipe', 'pipe', 'pipe'] })
      } catch {}
      return
    }
    if (key.upArrow) { setScroll(s => s + 1); return }
    if (key.downArrow) { setScroll(s => Math.max(0, s - 1)); return }
    if (input === 'g') { setScroll(lines.length); return }
    if (input === 'G') { setScroll(0); return }
  })

  // Compute visible window
  const total = lines.length
  const end = Math.max(0, total - scroll)
  const start = Math.max(0, end - rows)
  const visible = lines.slice(start, end)

  const statusColor = status === 'running'
    ? theme.slushie
    : exitCode === 0
      ? theme.matcha
      : theme.rose
  const statusLabel = status === 'running'
    ? 'running'
    : exitCode === 0
      ? 'exited 0'
      : `exited ${exitCode ?? '?'}`

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={statusColor} paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold color={statusColor}>{'▶ '}{action.label}</Text>
        <Text color={statusColor}>{statusLabel}</Text>
      </Box>
      <Text dimColor>{projectPath}</Text>
      <Text> </Text>
      {visible.length === 0 ? (
        <Text dimColor>(no output yet)</Text>
      ) : (
        visible.map((line, i) => (
          <Text key={`out-${start + i}`}>{line || ' '}</Text>
        ))
      )}
      <Text> </Text>
      <Text dimColor>
        {status === 'running' ? 'k kill  ' : 'r re-run  '}
        {'c copy  ↑↓ scroll  g/G top/bottom  esc close'}
      </Text>
    </Box>
  )
}
