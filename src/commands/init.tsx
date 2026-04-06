import React, { useEffect, useState } from 'react'
import { Text, Box } from 'ink'
import path from 'node:path'
import { createProject, getProject } from '../lib/config.js'
import { isGitRepo, getRemoteUrl, getCommitCount } from '../lib/git.js'
import { detectVenv } from '../lib/venv.js'
import type { Stage } from '../types.js'

interface Props {
  path: string
}

export function InitCommand({ path: projectPath }: Props) {
  const [status, setStatus] = useState<'loading' | 'exists' | 'done'>('loading')
  const [projectName, setProjectName] = useState('')

  useEffect(() => {
    const name = path.basename(projectPath)
    setProjectName(name)

    const existing = getProject(name)
    if (existing) {
      setStatus('exists')
      return
    }

    const remote = getRemoteUrl(projectPath)
    const venv = detectVenv(projectPath)
    const commits = getCommitCount(projectPath)
    const stage: Stage = commits > 0 ? 'scaffolding' : 'planning'

    createProject(name, projectPath, {
      stage,
      remote,
      venv,
      stats: { switches: 0, commitsAtRegistration: commits },
      milestones: {
        born: new Date().toISOString(),
        ...(isGitRepo(projectPath) ? { git_linked: new Date().toISOString() } : {}),
        ...(venv ? { venv_linked: new Date().toISOString() } : {}),
      },
    })

    setStatus('done')
  }, [projectPath])

  return (
    <Box flexDirection="column" padding={1}>
      {status === 'loading' && (
        <Text color="yellow">Initializing project...</Text>
      )}
      {status === 'exists' && (
        <Text color="red">Project "{projectName}" is already registered.</Text>
      )}
      {status === 'done' && (
        <Box flexDirection="column">
          <Text color="green">Registered "{projectName}" as a pina project.</Text>
          <Text dimColor>Path: {projectPath}</Text>
        </Box>
      )}
    </Box>
  )
}
