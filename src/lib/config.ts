import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { parse, stringify } from 'yaml'
import { PinaRegistrySchema } from './schema.js'
import type { PinaRegistry, Project } from '../types.js'

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
  return PinaRegistrySchema.parse(parsed)
}

export function saveRegistry(registry: PinaRegistry): void {
  ensurePinaDir()
  const content = stringify(registry, { indent: 2 })
  fs.writeFileSync(REGISTRY_PATH, content, 'utf-8')
}

export function getProject(name: string): Project | undefined {
  const registry = loadRegistry()
  return registry.projects[name]
}

export function setProject(name: string, project: Project): void {
  const registry = loadRegistry()
  registry.projects[name] = project
  saveRegistry(registry)
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
  const now = new Date().toISOString().split('T')[0]!
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
