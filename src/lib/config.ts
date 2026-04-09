import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { parse, stringify } from 'yaml'
import { PinaRegistrySchema, ProjectLocalDataSchema } from './schema.js'
import type { PinaRegistry, Project, ProjectLocalData } from '../types.js'

const PINA_DIR = path.join(os.homedir(), '.pina')
const REGISTRY_PATH = path.join(PINA_DIR, 'projects.yml')

export function ensurePinaDir(): void {
  if (!fs.existsSync(PINA_DIR)) {
    fs.mkdirSync(PINA_DIR, { recursive: true })
  }
}

export function loadRegistry(): PinaRegistry {
  ensurePinaDir()

  if (!fs.existsSync(REGISTRY_PATH)) {
    const empty = PinaRegistrySchema.parse({})
    saveRegistry(empty)
    return empty
  }

  const raw = fs.readFileSync(REGISTRY_PATH, 'utf-8')
  const parsed = parse(raw) ?? {}
  const registry = PinaRegistrySchema.parse(parsed)

  // Migrate: move local data from central registry to per-project .pina/project.yml
  let migrated = false
  for (const [, project] of Object.entries(registry.projects)) {
    const hasLocal = project.objectives.length > 0 || project.notes.length > 0
      || project.tags.length > 0 || Object.keys(project.milestones).length > 0
    if (hasLocal && fs.existsSync(project.path)) {
      const existing = loadProjectLocal(project.path)
      // Only migrate if per-project file doesn't already have data
      if (existing.objectives.length === 0 && existing.notes.length === 0
        && existing.tags.length === 0 && Object.keys(existing.milestones).length === 0) {
        saveProjectLocal(project.path, {
          objectives: project.objectives,
          notes: project.notes,
          tags: project.tags,
          milestones: project.milestones,
        })
      }
      project.objectives = []
      project.notes = []
      project.tags = []
      project.milestones = {}
      migrated = true
    }
  }
  if (migrated) saveRegistry(registry)

  // Merge per-project local data into each project
  for (const [, project] of Object.entries(registry.projects)) {
    if (fs.existsSync(project.path)) {
      const local = loadProjectLocal(project.path)
      ;(project as any).objectives = local.objectives
      project.notes = local.notes
      project.tags = local.tags
      project.milestones = local.milestones
    }
  }

  return registry
}

export function saveRegistry(registry: PinaRegistry): void {
  ensurePinaDir()
  const content = stringify(registry, { indent: 2 })
  fs.writeFileSync(REGISTRY_PATH, content, 'utf-8')
}

export function getProject(name: string): Project | undefined {
  const registry = loadRegistry()
  const project = registry.projects[name]
  if (!project) return undefined
  const local = loadProjectLocal(project.path)
  return { ...project, ...local }
}

export function setProject(name: string, project: Project): void {
  const { objectives, notes, tags, milestones, ...registryData } = project
  const registry = loadRegistry()
  registry.projects[name] = { ...registryData, objectives: [], notes: [], tags: [], milestones: {} } as Project
  saveRegistry(registry)
  if (fs.existsSync(registryData.path)) {
    saveProjectLocal(registryData.path, { objectives, notes, tags, milestones })
  }
}

export function removeProject(name: string): boolean {
  const registry = loadRegistry()
  if (!(name in registry.projects)) return false
  delete registry.projects[name]
  saveRegistry(registry)
  return true
}

export function listProjects(): Record<string, Project> {
  return loadRegistry().projects
}

export function getActiveProject(): Project | undefined {
  const registry = loadRegistry()
  if (!registry.config.activeProject) return undefined
  return registry.projects[registry.config.activeProject]
}

export function setActiveProject(name: string | undefined): void {
  const registry = loadRegistry()
  registry.config.activeProject = name
  saveRegistry(registry)
}

export function renameProject(oldName: string, newName: string): boolean {
  const registry = loadRegistry()
  const project = registry.projects[oldName]
  if (!project || newName in registry.projects) return false
  project.name = newName
  registry.projects[newName] = project
  delete registry.projects[oldName]
  if (registry.config.activeProject === oldName) {
    registry.config.activeProject = newName
  }
  saveRegistry(registry)
  return true
}

export function createProject(
  name: string,
  projectPath: string,
  options: Partial<Project> = {},
): Project {
  const now = new Date().toISOString()
  const project: Project = {
    name,
    path: projectPath,
    stage: 'planning',
    status: 'active',
    stale: false,
    tags: [],
    xp: 0,
    notes: [],
    objectives: [],
    milestones: { born: now },
    stats: { switches: 0, commitsAtRegistration: 0 },
    created: now,
    ...options,
  }
  setProject(name, project)
  return project
}

// ---- Per-project local data (.pina/project.yml) ----

const PROJECT_LOCAL_DIR = '.pina'
const PROJECT_LOCAL_FILE = 'project.yml'

function projectLocalPath(projectPath: string): string {
  return path.join(projectPath, PROJECT_LOCAL_DIR, PROJECT_LOCAL_FILE)
}

export function loadProjectLocal(projectPath: string): ProjectLocalData {
  const fp = projectLocalPath(projectPath)
  if (!fs.existsSync(fp)) return { objectives: [], notes: [], tags: [], milestones: {} }
  try {
    const raw = fs.readFileSync(fp, 'utf-8')
    const parsed = parse(raw) ?? {}
    return ProjectLocalDataSchema.parse(parsed)
  } catch {
    return { objectives: [], notes: [], tags: [], milestones: {} }
  }
}

export function saveProjectLocal(projectPath: string, data: ProjectLocalData): void {
  const dir = path.join(projectPath, PROJECT_LOCAL_DIR)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(projectLocalPath(projectPath), stringify(data, { indent: 2 }), 'utf-8')
}

