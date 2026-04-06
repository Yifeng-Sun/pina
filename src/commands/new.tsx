import React, { useEffect, useState } from 'react'
import { Text, Box } from 'ink'
import path from 'node:path'
import fs from 'node:fs'
import { createProject, getProject } from '../lib/config.js'
import { getRemoteUrl, getCommitCount, isGitRepo } from '../lib/git.js'
import { detectVenv } from '../lib/venv.js'
import type { Stage } from '../types.js'

interface Props {
  name: string
  path?: string
}

export function NewCommand({ name, path: inputPath }: Props) {
  const [status, setStatus] = useState<'loading' | 'exists' | 'not_found' | 'done'>('loading')
  const [resolvedPath, setResolvedPath] = useState('')

  useEffect(() => {
    const projectPath = inputPath
      ? path.resolve(inputPath.replace(/^~/, process.env['HOME'] ?? ''))
      : process.cwd()

    setResolvedPath(projectPath)

    if (!fs.existsSync(projectPath)) {
      setStatus('not_found')
      return
    }

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
        born: new Date().toISOString().split('T')[0],
        ...(isGitRepo(projectPath) ? { git_linked: new Date().toISOString().split('T')[0] } : {}),
        ...(venv ? { venv_linked: new Date().toISOString().split('T')[0] } : {}),
      },
    })

    setStatus('done')
  }, [name, inputPath])

  return (
    <Box flexDirection="column" padding={1}>
      {status === 'loading' && <Text color="yellow">Registering project...</Text>}
      {status === 'not_found' && <Text color="red">Directory not found: {resolvedPath}</Text>}
      {status === 'exists' && <Text color="red">Project "{name}" already exists.</Text>}
      {status === 'done' && (
        <Box flexDirection="column">
          <Text color="green">Registered "{name}" as a pina project.</Text>
          <Text dimColor>Path: {resolvedPath}</Text>
        </Box>
      )}
    </Box>
  )
}
