import React, { useState } from 'react'
import { Text, Box, useInput } from 'ink'
import { playSound } from '../lib/sound.js'

interface Props {
  prompt: string
  defaultValue?: string
  multiline?: boolean
  onSubmit: (value: string) => void
  onCancel: () => void
}

export function TextInput({ prompt, defaultValue = '', multiline = false, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState(defaultValue)
  const [cursor, setCursor] = useState(defaultValue.length)

  useInput((input, key) => {
    if (key.escape) {
      playSound('back')
      onCancel()
      return
    }

    // Ctrl+D submits in multiline; Enter submits in single-line
    if (multiline && key.ctrl && input === 'd') {
      playSound('success')
      onSubmit(value)
      return
    }

    if (key.return) {
      if (multiline) {
        // Insert newline
        setValue(prev => prev.slice(0, cursor) + '\n' + prev.slice(cursor))
        setCursor(prev => prev + 1)
        return
      }
      if (value.trim()) {
        playSound('success')
        onSubmit(value.trim())
      }
      return
    }

    if (key.backspace || key.delete) {
      if (cursor > 0) {
        setValue(prev => prev.slice(0, cursor - 1) + prev.slice(cursor))
        setCursor(prev => prev - 1)
      }
      return
    }

    if (key.leftArrow) {
      setCursor(prev => Math.max(0, prev - 1))
      return
    }

    if (key.rightArrow) {
      setCursor(prev => Math.min(value.length, prev + 1))
      return
    }

    if (input && !key.ctrl && !key.meta) {
      setValue(prev => prev.slice(0, cursor) + input + prev.slice(cursor))
      setCursor(prev => prev + input.length)
    }
  })

  const before = value.slice(0, cursor)
  const cursorChar = value[cursor] ?? ' '
  const after = value.slice(cursor + 1)

  if (multiline) {
    // Render full text with cursor highlighted in-place, preserving newlines.
    const renderMultiline = () => {
      const full = before + cursorChar + after
      const parts: React.ReactNode[] = []
      let i = 0
      for (const ch of full) {
        if (i === cursor) {
          parts.push(<Text key={i} inverse>{ch === '\n' ? ' ' : ch}</Text>)
          if (ch === '\n') parts.push(<Text key={`${i}-nl`}>{'\n'}</Text>)
        } else {
          parts.push(<Text key={i}>{ch}</Text>)
        }
        i++
      }
      return parts
    }
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        paddingX={1}
      >
        <Text bold color="cyan">{prompt}</Text>
        <Text> </Text>
        <Text>{renderMultiline()}</Text>
        <Text> </Text>
        <Text dimColor>enter newline  ctrl+d submit  esc cancel</Text>
      </Box>
    )
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
    >
      <Text bold color="cyan">{prompt}</Text>
      <Text> </Text>
      <Text>
        <Text>{before}</Text>
        <Text inverse>{cursorChar}</Text>
        <Text>{after}</Text>
      </Text>
      <Text> </Text>
      <Text dimColor>enter confirm  esc cancel</Text>
    </Box>
  )
}
