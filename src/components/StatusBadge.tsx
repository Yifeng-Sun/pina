import React from 'react'
import { Text } from 'ink'
import type { Stage, Status } from '../types.js'

interface Props {
  stage: Stage
  stale: boolean
  status: Status
}

const STAGE_COLORS: Record<Stage, string> = {
  planning: 'magenta',
  scaffolding: 'yellow',
  development: 'cyan',
  stable: 'green',
  complete: 'blue',
  archived: 'gray',
}

export function StatusBadge({ stage, stale, status }: Props) {
  if (status === 'paused') {
    return <Text color="yellow" bold>[paused]</Text>
  }

  if (stale) {
    return <Text color="red">[{stage} · stale]</Text>
  }

  const color = STAGE_COLORS[stage]
  return <Text color={color}>[{stage}]</Text>
}
