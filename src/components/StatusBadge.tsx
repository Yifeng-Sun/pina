import React from 'react'
import { Text } from 'ink'
import type { Stage, Status } from '../types.js'
import { STAGE_COLOR, theme } from '../lib/theme.js'

interface Props {
  stage: Stage
  stale: boolean
  status: Status
}

export function StatusBadge({ stage, stale, status }: Props) {
  if (status === 'paused') {
    return <Text color={theme.butter} bold>[paused]</Text>
  }

  if (stale) {
    return <Text color={theme.rose}>[{stage} · stale]</Text>
  }

  return <Text color={STAGE_COLOR[stage]}>[{stage}]</Text>
}
