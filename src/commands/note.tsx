import React, { useEffect, useState } from 'react'
import { Text, Box } from 'ink'
import { getActiveProject, loadRegistry, setProject } from '../lib/config.js'

interface Props {
  text: string
}

export function NoteCommand({ text }: Props) {
  const [status, setStatus] = useState<'loading' | 'no_project' | 'done'>('loading')

  useEffect(() => {
    const registry = loadRegistry()
    const activeProjectName = registry.config.activeProject

    if (!activeProjectName || !registry.projects[activeProjectName]) {
      setStatus('no_project')
      return
    }

    const project = registry.projects[activeProjectName]!
    const now = new Date().toISOString()

    project.notes.push(`[${now}] ${text}`)
    project.xp += 1

    if (!project.milestones.first_note) {
      project.milestones.first_note = now
    }

    setProject(activeProjectName, project)
    setStatus('done')
  }, [text])

  return (
    <Box padding={1}>
      {status === 'loading' && <Text color="yellow">Adding note...</Text>}
      {status === 'no_project' && <Text color="red">No active project. Run `pina switch &lt;name&gt;` first.</Text>}
      {status === 'done' && <Text color="green">Note added.</Text>}
    </Box>
  )
}
