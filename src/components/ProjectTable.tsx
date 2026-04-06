import React from 'react'
import { Text, Box } from 'ink'
import type { Project } from '../types.js'
import { StatusBadge } from './StatusBadge.js'

interface Props {
  projects: Project[]
  activeProject?: string
}

export function ProjectTable({ projects, activeProject }: Props) {
  const maxName = Math.max(...projects.map(p => p.name.length), 4)
  const maxPath = Math.max(...projects.map(p => p.path.length), 4)

  return (
    <Box flexDirection="column">
      <Box gap={2}>
        <Text bold dimColor>{'  '}{'Name'.padEnd(maxName)}</Text>
        <Text bold dimColor>{'Stage'.padEnd(14)}</Text>
        <Text bold dimColor>{'Tags'.padEnd(20)}</Text>
        <Text bold dimColor>{'Last Switched'.padEnd(12)}</Text>
        <Text bold dimColor>XP</Text>
      </Box>

      {projects.map(project => {
        const isActive = project.name === activeProject
        const marker = isActive ? '▸' : ' '

        return (
          <Box key={project.name} gap={2}>
            <Text color={isActive ? 'green' : undefined}>
              {marker} {project.name.padEnd(maxName)}
            </Text>
            <Box width={14}>
              <StatusBadge stage={project.stage} stale={project.stale} status={project.status} />
            </Box>
            <Text dimColor>{(project.tags.join(', ') || '—').padEnd(20)}</Text>
            <Text dimColor>{(project.lastSwitched ?? '—').padEnd(12)}</Text>
            <Text color="yellow">{project.xp}</Text>
          </Box>
        )
      })}
    </Box>
  )
}
