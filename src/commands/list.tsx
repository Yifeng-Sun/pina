import React from 'react'
import { Text, Box } from 'ink'
import { listProjects, loadRegistry } from '../lib/config.js'
import { ProjectTable } from '../components/ProjectTable.js'

interface Props {
  stage?: string
  tag?: string
}

export function ListCommand({ stage, tag }: Props) {
  const registry = loadRegistry()
  let projects = Object.values(registry.projects)

  if (stage) {
    projects = projects.filter(p => p.stage === stage)
  }
  if (tag) {
    projects = projects.filter(p => p.tags.includes(tag))
  }

  if (projects.length === 0) {
    return (
      <Box padding={1}>
        <Text dimColor>No projects found. Run `pina init` or `pina scan` to add projects.</Text>
      </Box>
    )
  }

  return (
    <Box padding={1}>
      <ProjectTable projects={projects} activeProject={registry.config.activeProject} />
    </Box>
  )
}
