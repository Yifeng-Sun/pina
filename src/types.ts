export type Stage = 'planning' | 'scaffolding' | 'development' | 'stable' | 'complete' | 'archived'

export type Status = 'active' | 'paused'

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
  objectives: string[]
  milestones: Partial<Record<MilestoneKey, string>> // key → ISO date
  stats: {
    switches: number
    commitsAtRegistration: number
  }
}

export interface PinaConfig {
  activeProject?: string
  symlinkPath: string // default ~/current
  scanDirs: string[]
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
