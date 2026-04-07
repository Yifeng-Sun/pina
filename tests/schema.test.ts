import { describe, it, expect } from 'vitest'
import {
  ProjectSchema,
  PinaConfigSchema,
  PinaRegistrySchema,
  StageSchema,
  StatusSchema,
  SoundProfileSchema,
} from '../src/lib/schema.js'

describe('StageSchema', () => {
  it('accepts valid stages', () => {
    for (const s of ['planning', 'scaffolding', 'development', 'stable', 'complete', 'archived']) {
      expect(StageSchema.parse(s)).toBe(s)
    }
  })
  it('rejects unknown stages', () => {
    expect(() => StageSchema.parse('unknown')).toThrow()
  })
})

describe('StatusSchema', () => {
  it('accepts active and paused', () => {
    expect(StatusSchema.parse('active')).toBe('active')
    expect(StatusSchema.parse('paused')).toBe('paused')
  })
  it('rejects other values', () => {
    expect(() => StatusSchema.parse('done')).toThrow()
  })
})

describe('SoundProfileSchema', () => {
  it('accepts known profiles', () => {
    for (const p of ['default', 'cyberpunk', 'forest', 'dreamy']) {
      expect(SoundProfileSchema.parse(p)).toBe(p)
    }
  })
})

describe('ProjectSchema', () => {
  const minimal = {
    name: 'p',
    path: '/x',
    stage: 'development',
    status: 'active',
    created: '2026-01-01',
  }

  it('fills defaults for omitted fields', () => {
    const parsed = ProjectSchema.parse(minimal)
    expect(parsed.tags).toEqual([])
    expect(parsed.notes).toEqual([])
    expect(parsed.objectives).toEqual([])
    expect(parsed.milestones).toEqual({})
    expect(parsed.xp).toBe(0)
    expect(parsed.stale).toBe(false)
    expect(parsed.stats).toEqual({ switches: 0, commitsAtRegistration: 0 })
  })

  it('coerces a string objective into an objective object', () => {
    const parsed = ProjectSchema.parse({ ...minimal, objectives: ['ship it'] })
    expect(parsed.objectives[0]).toMatchObject({
      text: 'ship it',
      hidden: false,
      focused: false,
      completed: false,
    })
  })

  it('preserves a structured objective', () => {
    const parsed = ProjectSchema.parse({
      ...minimal,
      objectives: [{ text: 'a', hidden: true, focused: true, completed: true }],
    })
    expect(parsed.objectives[0]).toMatchObject({ text: 'a', hidden: true, focused: true, completed: true })
  })

  it('rejects when required fields are missing', () => {
    expect(() => ProjectSchema.parse({ name: 'p' })).toThrow()
  })

  it('rejects an invalid stage', () => {
    expect(() => ProjectSchema.parse({ ...minimal, stage: 'nope' })).toThrow()
  })
})

describe('PinaConfigSchema', () => {
  it('applies defaults from an empty object', () => {
    const cfg = PinaConfigSchema.parse({})
    expect(cfg.symlinkPath).toBe('~/current')
    expect(cfg.scanDirs).toEqual([])
    expect(cfg.muted).toBe(false)
    expect(cfg.soundProfile).toBe('default')
    expect(cfg.activeProject).toBeUndefined()
  })

  it('preserves provided values', () => {
    const cfg = PinaConfigSchema.parse({
      activeProject: 'p',
      symlinkPath: '~/foo',
      scanDirs: ['~/dev'],
      muted: true,
      soundProfile: 'forest',
    })
    expect(cfg.activeProject).toBe('p')
    expect(cfg.scanDirs).toEqual(['~/dev'])
    expect(cfg.muted).toBe(true)
    expect(cfg.soundProfile).toBe('forest')
  })
})

describe('PinaRegistrySchema', () => {
  it('parses an empty registry to defaults', () => {
    const reg = PinaRegistrySchema.parse({})
    expect(reg.config.symlinkPath).toBe('~/current')
    expect(reg.projects).toEqual({})
  })
})
