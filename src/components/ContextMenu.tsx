import React, { useState } from 'react'
import { Text, Box, useInput } from 'ink'
import { playSound } from '../lib/sound.js'

export interface MenuItem {
  label: string
  action: () => void
}

interface Props {
  title: string
  items: MenuItem[]
  onClose: () => void
}

export function ContextMenu({ title, items, onClose }: Props) {
  const [cursor, setCursor] = useState(0)

  useInput((input, key) => {
    if (key.escape) {
      playSound('back')
      onClose()
      return
    }

    if (key.upArrow) {
      const next = (cursor - 1 + items.length) % items.length
      playSound('navigate', next)
      setCursor(next)
      return
    }

    if (key.downArrow || key.tab) {
      const next = (cursor + 1) % items.length
      playSound('navigate', next)
      setCursor(next)
      return
    }

    if (key.return) {
      playSound('action')
      items[cursor]?.action()
      return
    }
  })

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      paddingY={0}
    >
      <Text bold color="cyan">{title}</Text>
      <Text> </Text>
      {items.map((item, i) => {
        const isCursor = cursor === i
        return (
          <Text key={i}>
            <Text color="cyan">{isCursor ? '❯ ' : '  '}</Text>
            <Text inverse={isCursor}>{item.label}</Text>
          </Text>
        )
      })}
      <Text> </Text>
      <Text dimColor>↑↓ navigate  enter select  esc cancel</Text>
    </Box>
  )
}
