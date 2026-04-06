export type Stage = 'planning' | 'scaffolding' | 'development' | 'stable' | 'complete' | 'archived'

export type Status = 'active' | 'paused'

export interface Objective {
  text: string
  hidden: boolean
  focused: boolean
  completed?: boolean
  completedAt?: string
  createdAt?: string
}

export type MilestoneKey =
  // Creation & Setup
  | 'born'
  | 'first_note'
  | 'git_linked'
  | 'venv_linked'
  | 'ai_configured'
  // Development
  | 'first_switch'
  | 'ten_switches'
  | 'first_commit'
  | 'fifty_commits'
  | 'first_branch'
  // Longevity
  | 'one_week'
  | 'one_month'
  | 'one_year'
  | 'revived'
  // Completion
  | 'first_release'
  | 'completed'
  | 'archived'

export interface Project {
  name: string
  path: string
  stage: Stage
  status: Status
  stale: boolean
  tags: string[]
  venv?: string
  remote?: string
  aiConfig?: string
  created: string
  lastSwitched?: string
  xp: number
  notes: string[]
  objectives: Objective[]
  milestones: Record<string, string> // key → ISO datetime
  stats: {
    switches: number
    commitsAtRegistration: number
  }
}

export type SoundProfile = 'default' | 'cyberpunk' | 'forest' | 'dreamy'

export interface PinaConfig {
  activeProject?: string
  symlinkPath: string // default ~/current
  scanDirs: string[]
  muted: boolean
  soundProfile: SoundProfile
}

export interface PinaRegistry {
  config: PinaConfig
  projects: Record<string, Project>
}

export interface DetectedProject {
  name: string
  path: string
  tags: string[]
  venv?: string
  remote?: string
  hasGit: boolean
  aiConfig?: string
}

export interface ProjectLocalConfig {
  venvPath?: string
  envFile?: string
  hooks?: {
    onSwitchIn?: string
    onSwitchOut?: string
  }
  ai?: {
    model?: string
    claudeMd?: string
  }
}

export const MILESTONE_LABELS: Record<MilestoneKey, string> = {
  born: 'Project created',
  first_note: 'First note',
  git_linked: 'Git connected',
  venv_linked: 'Environment set up',
  ai_configured: 'AI skills linked',
  first_switch: 'First switched to',
  ten_switches: 'Frequent flyer',
  first_commit: 'First commit',
  fifty_commits: 'Fifty commits deep',
  first_branch: 'First branch',
  one_week: 'One week old',
  one_month: 'One month in',
  one_year: 'Survived a year',
  revived: 'Back from the dead',
  first_release: 'First release',
  completed: 'Completed',
  archived: 'Put to rest',
}

const STAGE_LABELS: Record<string, string> = {
  planning: 'Moved to planning',
  scaffolding: 'Moved to scaffolding',
  development: 'Moved to development',
  stable: 'Reached stable',
  complete: 'Completed',
  archived: 'Archived',
}

export function getMilestoneLabel(key: string): string {
  if (key in MILESTONE_LABELS) return MILESTONE_LABELS[key as MilestoneKey]
  // Dynamic stage keys like "stage:development:1712345678"
  const stageMatch = key.match(/^stage:(\w+):/)
  if (stageMatch) return STAGE_LABELS[stageMatch[1]!] ?? `Stage: ${stageMatch[1]}`
  return key
}
