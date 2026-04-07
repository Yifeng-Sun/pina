import React from 'react'
import { Text, Box, useStdout } from 'ink'
import { theme } from '../lib/theme.js'

const ASCII_ART = [
  '   ___  _          ',
  '  / _ \\(_)__  ___ _',
  ' / ___/ / _ \\/ _ `/',
  '/_/  /_/_//_/\\_,_/',
]

const MIN_WIDTH = ASCII_ART.reduce((max, line) => Math.max(max, line.length), 0)

export function PinaHeader() {
  const { stdout } = useStdout()
  const cols = stdout?.columns ?? 80

  const useCompact = cols < MIN_WIDTH + 4
  const lines = useCompact ? ['pina'] : ASCII_ART

  return (
    <Box paddingX={1} paddingY={0}>
      <Box flexDirection="column" alignItems="flex-start">
        {lines.map((line, idx) => (
          <Text key={`pina-wordmark-${idx}`} bold color={idx % 2 === 0 ? theme.matcha : theme.slushie}>
            {line}
          </Text>
        ))}
      </Box>
    </Box>
  )
}
