import React, { useEffect, useState } from 'react'
import { Text, Box } from 'ink'
import { getProject, setProject, setActiveProject, loadRegistry } from '../lib/config.js'
import { updateSymlink } from '../lib/symlink.js'
import { getActivateCommand } from '../lib/venv.js'

interface Props {
  name: string
}

export function SwitchCommand({ name }: Props) {
  const [status, setStatus] = useState<'loading' | 'not_found' | 'done'>('loading')
  const [venvCommand, setVenvCommand] = useState<string>()

  useEffect(() => {
    const project = getProject(name)
    if (!project) {
      setStatus('not_found')
      return
    }

    const now = new Date().toISOString()

    // Update stats
    project.stats.switches += 1
    project.lastSwitched = now
    project.xp += 1

    // Check milestones
    if (!project.milestones.first_switch) {
      project.milestones.first_switch = now
    }
    if (project.stats.switches >= 10 && !project.milestones.ten_switches) {
      project.milestones.ten_switches = now
    }

    // Update symlink
    try {
      updateSymlink(project.path)
    } catch {
      // Symlink update is best-effort
    }

    // Set active
    setActiveProject(name)
    setProject(name, project)

    // Venv hint
    if (project.venv) {
      setVenvCommand(getActivateCommand(project.path, project.venv))
    }

    setStatus('done')
  }, [name])

  return (
    <Box flexDirection="column" padding={1}>
      {status === 'loading' && <Text color="yellow">Switching...</Text>}
      {status === 'not_found' && <Text color="red">Project "{name}" not found.</Text>}
      {status === 'done' && (
        <Box flexDirection="column">
          <Text color="green">Switched to "{name}"</Text>
          {venvCommand && (
            <Text dimColor>Activate venv: {venvCommand}</Text>
          )}
        </Box>
      )}
    </Box>
  )
}
