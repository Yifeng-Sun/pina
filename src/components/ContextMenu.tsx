import React, { useState, useEffect } from 'react'
import { Text, Box, useInput } from 'ink'
import { playSound } from '../lib/sound.js'
import { getMenuDefault, setMenuDefault, clearMenuDefault } from '../lib/menuDefaults.js'
import { theme, SHIMMER_COLORS } from '../lib/theme.js'

function useShimmerColor() {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % SHIMMER_COLORS.length), 200)
    return () => clearInterval(t)
  }, [])
  return SHIMMER_COLORS[idx]
}

export interface MenuItem {
  label: string
  action: () => void
  key?: string
  info?: boolean
}

interface Props {
  title: string
  items: MenuItem[]
  onClose: () => void
  menuKind?: string
  onToggleDefault?: (item: MenuItem) => void
  onDelete?: (item: MenuItem) => void
}

export function ContextMenu({ title, items, onClose, menuKind, onToggleDefault, onDelete }: Props) {
  const goldenColor = useShimmerColor()
  const storeKey = menuKind ?? title
  const [defaultKey, setDefaultKey] = useState<string | undefined>(() => getMenuDefault(storeKey))
  const isSelectable = (i: number) => !!items[i] && !items[i]!.info
  const findFirstSelectable = () => items.findIndex(it => !it.info)
  const stepCursor = (start: number, dir: 1 | -1): number => {
    if (items.length === 0) return start
    let i = start
    for (let n = 0; n < items.length; n++) {
      i = (i + dir + items.length) % items.length
      if (isSelectable(i)) return i
    }
    return start
  }
  const [cursor, setCursor] = useState(() => {
    const def = getMenuDefault(storeKey)
    if (def) {
      const idx = items.findIndex(i => (i.key ?? i.label) === def)
      if (idx >= 0 && isSelectable(idx)) return idx
    }
    const first = findFirstSelectable()
    return first >= 0 ? first : 0
  })

  useInput((input, key) => {
    if (key.escape) {
      playSound('back')
      onClose()
      return
    }

    if (key.upArrow) {
      const next = stepCursor(cursor, -1)
      if (next !== cursor) {
        playSound('navigate', next)
        setCursor(next)
      }
      return
    }

    if (key.downArrow || key.tab) {
      const next = stepCursor(cursor, 1)
      if (next !== cursor) {
        playSound('navigate', next)
        setCursor(next)
      }
      return
    }

    if (key.return) {
      const item = items[cursor]
      if (!item || item.info) return
      playSound('action')
      item.action()
      return
    }

    if (key.delete && onDelete) {
      const item = items[cursor]
      if (item && !item.info) onDelete(item)
      return
    }

    if (input === 'd' && !key.ctrl && !key.meta) {
      const item = items[cursor]
      if (item && !item.info) {
        if (onToggleDefault) {
          onToggleDefault(item)
        } else {
          const id = item.key ?? item.label
          if (defaultKey === id) {
            clearMenuDefault(storeKey)
            setDefaultKey(undefined)
          } else {
            setMenuDefault(storeKey, id)
            setDefaultKey(id)
          }
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
      borderColor={theme.matcha}
      paddingX={2}
      paddingY={1}
    >
      <Text bold color={theme.matcha}>{title}</Text>
      <Text> </Text>
      {items.map((item, i) => {
        if (item.info) {
          return (
            <Text key={i} dimColor>
              {`  ${item.label}`}
            </Text>
          )
        }
        const isCursor = cursor === i
        const isDefault = (item.key ?? item.label) === defaultKey
        return (
          <Text key={i}>
            <Text color={theme.matcha}>{isCursor ? '❯ ' : '  '}</Text>
            <Text inverse={isCursor} color={isDefault ? goldenColor : undefined}>{item.label}</Text>
            {isDefault && <Text color={goldenColor}> ★</Text>}
          </Text>
        )
      })}
      <Text> </Text>
      <Text color={theme.dimCream}>{'↑↓ navigate  enter select  d set default'}{onDelete ? '  del delete' : ''}{'  esc cancel'}</Text>
    </Box>
  )
}
