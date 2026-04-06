import React, { useEffect, useState } from 'react'
import { Text, Box } from 'ink'
import { getProject, setProject, loadRegistry, setActiveProject } from '../lib/config.js'
import { removeSymlink } from '../lib/symlink.js'

interface Props {
  name: string
}

export function ArchiveCommand({ name }: Props) {
  const [status, setStatus] = useState<'loading' | 'not_found' | 'done'>('loading')

  useEffect(() => {
    const project = getProject(name)
    if (!project) {
      setStatus('not_found')
      return
    }

    const now = new Date().toISOString()

    project.stage = 'archived'
    project.status = 'paused'
    project.milestones[`stage:archived:${Date.now()}`] = now

    setProject(name, project)

    // If this was the active project, deactivate
    const registry = loadRegistry()
    if (registry.config.activeProject === name) {
      setActiveProject(undefined)
      try {
        removeSymlink()
      } catch {
        // Best effort
      }
    }

    setStatus('done')
  }, [name])

  return (
    <Box padding={1}>
      {status === 'loading' && <Text color="yellow">Archiving...</Text>}
      {status === 'not_found' && <Text color="red">Project "{name}" not found.</Text>}
      {status === 'done' && <Text color="green">Archived "{name}".</Text>}
    </Box>
  )
}
