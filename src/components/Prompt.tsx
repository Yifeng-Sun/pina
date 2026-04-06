import React from 'react'
import { Text } from 'ink'
import { getActiveProject } from '../lib/config.js'

export function Prompt() {
  const project = getActiveProject()

  if (!project) {
    return <Text dimColor>pina</Text>
  }

  return (
    <Text>
      <Text color="green">{project.name}</Text>
      <Text dimColor> [{project.stage}]</Text>
    </Text>
  )
}
