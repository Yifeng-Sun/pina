import React from 'react'
import { Text, Box } from 'ink'
import { loadRegistry, getActiveProject } from '../lib/config.js'
import { getCurrentBranch, isDirty, getCommitCount } from '../lib/git.js'
import { StatusBadge } from '../components/StatusBadge.js'
import { MILESTONE_LABELS } from '../types.js'
import type { MilestoneKey } from '../types.js'

export function StatusCommand() {
  const registry = loadRegistry()
  const project = getActiveProject()

  if (!project) {
    return (
      <Box padding={1}>
        <Text dimColor>No active project. Run `pina switch &lt;name&gt;` to select one.</Text>
      </Box>
    )
  }

  const branch = getCurrentBranch(project.path)
  const dirty = isDirty(project.path)
  const commits = getCommitCount(project.path)

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Box flexDirection="column">
        <Box gap={2}>
          <Text bold>{project.name}</Text>
          <StatusBadge stage={project.stage} stale={project.stale} status={project.status} />
        </Box>
        <Text dimColor>{project.path}</Text>
      </Box>

      <Box flexDirection="column">
        {branch && <Text>Branch: <Text color="cyan">{branch}</Text>{dirty ? <Text color="yellow"> (dirty)</Text> : ''}</Text>}
        {project.remote && <Text>Remote: <Text color="blue">{project.remote}</Text></Text>}
        <Text>Commits: {commits} | Switches: {project.stats.switches} | XP: {project.xp}</Text>
        {project.tags.length > 0 && <Text>Tags: {project.tags.join(', ')}</Text>}
      </Box>

      {project.notes.length > 0 && (
        <Box flexDirection="column">
          <Text bold>Notes:</Text>
          {project.notes.slice(-3).map((note, i) => (
            <Text key={i} dimColor>  - {note}</Text>
          ))}
        </Box>
      )}

      {Object.keys(project.milestones).length > 0 && (
        <Box flexDirection="column">
          <Text bold>Milestones:</Text>
          {Object.entries(project.milestones).map(([key, date]) => (
            <Text key={key} dimColor>
              {'  '}{MILESTONE_LABELS[key as MilestoneKey] ?? key}: {date}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  )
}
