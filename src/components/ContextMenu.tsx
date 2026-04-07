import React, { useState, useEffect } from 'react'
import { Text, Box, useInput } from 'ink'
import { playSound } from '../lib/sound.js'
import { getMenuDefault, setMenuDefault, clearMenuDefault } from '../lib/menuDefaults.js'

const GOLDEN_COLORS = ['#FFD700', '#FFC125', '#FFB90F', '#EEAD0E', '#CDAD00', '#EEAD0E', '#FFB90F', '#FFC125'] as const

function useGoldenColor() {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % GOLDEN_COLORS.length), 200)
    return () => clearInterval(t)
  }, [])
  return GOLDEN_COLORS[idx]
}

export interface MenuItem {
  label: string
  action: () => void
  key?: string
}

interface Props {
  title: string
  items: MenuItem[]
  onClose: () => void
  menuKind?: string
}

export function ContextMenu({ title, items, onClose, menuKind }: Props) {
  const goldenColor = useGoldenColor()
  const storeKey = menuKind ?? title
  const [defaultKey, setDefaultKey] = useState<string | undefined>(() => getMenuDefault(storeKey))
  const [cursor, setCursor] = useState(() => {
    const def = getMenuDefault(storeKey)
    if (def) {
      const idx = items.findIndex(i => (i.key ?? i.label) === def)
      if (idx >= 0) return idx
    }
    return 0
  })

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

    if (input === 'd' && !key.ctrl && !key.meta) {
      const item = items[cursor]
      if (item) {
        const id = item.key ?? item.label
        if (defaultKey === id) {
          clearMenuDefault(storeKey)
          setDefaultKey(undefined)
        } else {
          setMenuDefault(storeKey, id)
          setDefaultKey(id)
        }
        playSound('toggle')
      }
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
        const isDefault = (item.key ?? item.label) === defaultKey
        return (
          <Text key={i}>
            <Text color="cyan">{isCursor ? '❯ ' : '  '}</Text>
            <Text inverse={isCursor} color={isDefault ? goldenColor : undefined}>{item.label}</Text>
            {isDefault && <Text color={goldenColor}> ★</Text>}
          </Text>
        )
      })}
      <Text> </Text>
      <Text dimColor>↑↓ navigate  enter select  d set default  esc cancel</Text>
    </Box>
  )
}
