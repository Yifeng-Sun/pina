import React, { useState, useEffect } from 'react'
import { Text, Box, useInput, useApp } from 'ink'
import { scanDirectory } from '../lib/detector.js'
import { createProject, loadRegistry } from '../lib/config.js'
import { getCommitCount, isGitRepo } from '../lib/git.js'
import type { DetectedProject, Stage } from '../types.js'

interface Props {
  directory: string
}

export function ScanCommand({ directory }: Props) {
  const { exit } = useApp()
  const [detected, setDetected] = useState<DetectedProject[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [cursor, setCursor] = useState(0)
  const [phase, setPhase] = useState<'scanning' | 'selecting' | 'done'>('scanning')
  const [registered, setRegistered] = useState(0)
  const [skippedCount, setSkippedCount] = useState(0)

  useEffect(() => {
    const registry = loadRegistry()
    const existingPaths = new Set(Object.values(registry.projects).map(p => p.path))
    const existingNames = new Set(Object.keys(registry.projects))

    const projects = scanDirectory(directory, existingPaths)

    const d = new Date()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const yy = String(d.getFullYear()).slice(-2)
    const suffix = `_indexed-${mm}${dd}${yy}`

    const renamed = projects.map(p =>
      existingNames.has(p.name) ? { ...p, name: `${p.name}${suffix}` } : p
    )

    setSkippedCount(0)
    setDetected(renamed)
    setSelected(new Set(renamed.map((_, i) => i)))
    setPhase(renamed.length > 0 ? 'selecting' : 'done')
  }, [directory])

  useInput((input, key) => {
    if (phase !== 'selecting') return

    if (key.upArrow) {
      setCursor(prev => Math.max(0, prev - 1))
    } else if (key.downArrow) {
      setCursor(prev => Math.min(detected.length - 1, prev + 1))
    } else if (input === ' ') {
      setSelected(prev => {
        const next = new Set(prev)
        if (next.has(cursor)) {
          next.delete(cursor)
        } else {
          next.add(cursor)
        }
        return next
      })
    } else if (input === 'a') {
      setSelected(prev => {
        if (prev.size === detected.length) {
          return new Set()
        }
        return new Set(detected.map((_, i) => i))
      })
    } else if (key.return) {
      // Register selected projects
      let count = 0
      for (const idx of selected) {
        const p = detected[idx]!
        const now = new Date().toISOString()
        const commits = getCommitCount(p.path)
        const stage: Stage = commits > 0 ? 'scaffolding' : 'planning'

        createProject(p.name, p.path, {
          stage,
          tags: p.tags,
          venv: p.venv,
          remote: p.remote,
          aiConfig: p.aiConfig,
          stats: { switches: 0, commitsAtRegistration: commits },
          milestones: {
            born: now,
            ...(p.hasGit ? { git_linked: now } : {}),
            ...(p.venv ? { venv_linked: now } : {}),
            ...(p.aiConfig ? { ai_configured: now } : {}),
          },
        })
        count++
      }
      setRegistered(count)
      setPhase('done')
    } else if (input === 'q') {
      exit()
    }
  })

  if (phase === 'scanning') {
    return (
      <Box padding={1}>
        <Text color="yellow">Scanning {directory}...</Text>
      </Box>
    )
  }

  if (phase === 'done' && detected.length === 0) {
    return (
      <Box padding={1} flexDirection="column">
        {skippedCount > 0 ? (
          <Text dimColor>All {skippedCount} detected projects are already registered.</Text>
        ) : (
          <Text dimColor>No projects detected in {directory}.</Text>
        )}
      </Box>
    )
  }

  if (phase === 'done') {
    return (
      <Box padding={1}>
        <Text color="green">Registered {registered} project{registered !== 1 ? 's' : ''}.</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>
        Found {detected.length} new project{detected.length !== 1 ? 's' : ''}
        {skippedCount > 0 ? <Text dimColor> ({skippedCount} already registered)</Text> : ''}
      </Text>
      <Text dimColor> </Text>

      {detected.map((project, idx) => {
        const isSelected = selected.has(idx)
        const isCursor = cursor === idx
        const indicator = isSelected ? '◉' : '○'
        const tags = project.tags.length > 0 ? `[${project.tags.join(', ')}]` : '[unknown]'

        return (
          <Text key={project.path}>
            {isCursor ? <Text color="cyan">❯ </Text> : '  '}
            <Text color={isSelected ? 'green' : 'gray'}>{indicator} </Text>
            <Text bold={isCursor}>{project.name.padEnd(24)}</Text>
            <Text dimColor>{tags}</Text>
          </Text>
        )
      })}

      <Text dimColor> </Text>
      <Text dimColor>↑↓ navigate  space toggle  a all  enter confirm  q quit</Text>
    </Box>
  )
}
