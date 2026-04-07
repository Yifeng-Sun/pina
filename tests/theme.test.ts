import { describe, it, expect } from 'vitest'
import {
  setPalette,
  getPaletteName,
  cyclePalette,
  PALETTE_ORDER,
  theme,
  sectionColor,
  SHIMMER_COLORS,
  STAGE_COLOR,
} from '../src/lib/theme.js'

describe('setPalette', () => {
  it('updates theme exports for ube-matcha', () => {
    setPalette('ube-matcha')
    expect(getPaletteName()).toBe('ube-matcha')
    expect(theme.matcha).toBe('#a3c585')
    expect(theme.ube).toBe('#b89bd9')
    expect(sectionColor.active).toBe(theme.matcha)
    expect(sectionColor.objectives).toBe(theme.slushie)
    expect(sectionColor.projects).toBe(theme.ube)
    expect(SHIMMER_COLORS.length).toBeGreaterThan(0)
    expect(STAGE_COLOR.development).toBe('#a6b8e8')
  })

  it('swaps all theme exports when changing palette', () => {
    setPalette('cyberpunk')
    expect(theme.matcha).toBe('#00f0ff')
    expect(theme.ube).toBe('#ff006e')
    expect(STAGE_COLOR.planning).toBe('#ff006e')
  })

  it('ignores an unknown palette name', () => {
    setPalette('ube-matcha')
    setPalette('not-a-palette' as any)
    expect(getPaletteName()).toBe('ube-matcha')
  })
})

describe('cyclePalette', () => {
  it('advances to the next palette in order and wraps', () => {
    setPalette(PALETTE_ORDER[0]!)
    const next = cyclePalette()
    expect(next).toBe(PALETTE_ORDER[1])
    cyclePalette()
    const wrapped = cyclePalette()
    expect(wrapped).toBe(PALETTE_ORDER[0])
  })
})
