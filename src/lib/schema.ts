import { z } from 'zod'

export const StageSchema = z.enum([
  'planning',
  'scaffolding',
  'development',
  'stable',
  'complete',
  'archived',
])

export const StatusSchema = z.enum(['active', 'paused'])

export const ProjectSchema = z.object({
  name: z.string(),
  path: z.string(),
  stage: StageSchema,
  status: StatusSchema,
  stale: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  venv: z.string().optional(),
  remote: z.string().optional(),
  aiConfig: z.string().optional(),
  created: z.string(),
  lastSwitched: z.string().optional(),
  xp: z.number().default(0),
  notes: z.array(z.string()).default([]),
  objectives: z.array(z.string()).default([]),
  milestones: z.record(z.string(), z.string()).default({}),
  stats: z.object({
    switches: z.number().default(0),
    commitsAtRegistration: z.number().default(0),
  }).default({ switches: 0, commitsAtRegistration: 0 }),
})

export const PinaConfigSchema = z.object({
  activeProject: z.string().optional(),
  symlinkPath: z.string().default('~/current'),
  scanDirs: z.array(z.string()).default([]),
})

export const PinaRegistrySchema = z.object({
  config: PinaConfigSchema.default({
    symlinkPath: '~/current',
    scanDirs: [],
  }),
  projects: z.record(z.string(), ProjectSchema).default({}),
})
