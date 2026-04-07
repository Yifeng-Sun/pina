import { describe, it, expect } from 'vitest'
import { getMilestoneLabel, MILESTONE_LABELS } from '../src/types.js'

describe('getMilestoneLabel', () => {
  it('returns the canonical label for known milestone keys', () => {
    expect(getMilestoneLabel('born')).toBe(MILESTONE_LABELS.born)
    expect(getMilestoneLabel('first_commit')).toBe('First commit')
    expect(getMilestoneLabel('one_year')).toBe('Survived a year')
  })

  it('parses dynamic stage milestone keys', () => {
    expect(getMilestoneLabel('stage:development:1712345678')).toBe('Moved to development')
    expect(getMilestoneLabel('stage:stable:1')).toBe('Reached stable')
    expect(getMilestoneLabel('stage:archived:1')).toBe('Archived')
  })

  it('falls back to a generic stage label for unknown stage names', () => {
    expect(getMilestoneLabel('stage:weird:1')).toBe('Stage: weird')
  })

  it('returns the original key when nothing matches', () => {
    expect(getMilestoneLabel('totally_unknown')).toBe('totally_unknown')
  })
})
