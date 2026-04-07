import type { Project } from '../src/types.js'

export function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    name: 'demo',
    path: '/tmp/demo',
    stage: 'development',
    status: 'active',
    stale: false,
    tags: [],
    created: '2026-01-01T00:00:00Z',
    xp: 0,
    notes: [],
    objectives: [],
    milestones: {},
    stats: { switches: 0, commitsAtRegistration: 0 },
    ...overrides,
  }
}
