function wrapProjectName(text: string, width: number): string[] {
  if (width <= 0) return [text]
  if (!text.includes(' ')) {
    return softWrap(text, width)
  }
  return softWrapByWords(text, width)
}

function softWrapByWords(text: string, width: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if (word.length > width) {
      lines.push(...softWrap(word, width))
      current = ''
      continue
    }
    if (!current) {
      current = word
      continue
    }
    if (current.length + 1 + word.length <= width) {
      current += ` ${word}`
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines.length > 0 ? lines : ['']
}

function softWrap(text: string, width: number): string[] {
  if (text.length <= width) return [text]
  const lines: string[] = []
  let remaining = text
  const ellipsis = '...'
  while (remaining.length > width) {
    const segmentWidth = width - ellipsis.length
    if (segmentWidth <= 0) break
    const prefix = remaining.slice(0, segmentWidth)
    const suffixSlice = remaining.slice(-(ellipsis.length))
    lines.push(`${prefix}${ellipsis}${suffixSlice}`)
    remaining = remaining.slice(segmentWidth + ellipsis.length)
  }
  if (remaining) lines.push(remaining)
  return lines
}

console.log(wrapProjectName('codecrafters-claude-code-py', 20))
