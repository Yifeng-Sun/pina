import type { MenuItem } from '../components/ContextMenu.js'
import type { Project, Stage } from '../types.js'
import { getLocalBranches, getRemoteBranches, getCurrentBranch } from './git.js'

const STAGES: Stage[] = ['planning', 'scaffolding', 'development', 'stable', 'complete', 'archived']

export type MenuAction =
  | { type: 'rename_project'; projectName: string }
  | { type: 'set_stage'; projectName: string; stage: Stage }
  | { type: 'toggle_pause'; projectName: string }
  | { type: 'archive_project'; projectName: string }
  | { type: 'delete_project'; projectName: string }
  | { type: 'switch_project'; projectName: string }
  | { type: 'add_tag'; projectName: string }
  | { type: 'remove_tag'; projectName: string; tag: string }
  | { type: 'add_note'; projectName: string }
  | { type: 'delete_note'; projectName: string; noteIndex: number }
  | { type: 'add_objective'; projectName: string }
  | { type: 'edit_objective'; projectName: string; objectiveIndex: number }
  | { type: 'delete_objective'; projectName: string; objectiveIndex: number }
  | { type: 'hide_objective'; projectName: string; objectiveIndex: number }
  | { type: 'unhide_objective'; projectName: string; objectiveIndex: number }
  | { type: 'focus_objective'; projectName: string; objectiveIndex: number }
  | { type: 'show_hidden_objectives'; projectName: string }
  | { type: 'set_remote'; projectName: string }
  | { type: 'open_folder'; projectPath: string }
  | { type: 'open_vscode'; projectPath: string }
  | { type: 'open_terminal_tab'; projectPath: string }
  | { type: 'git_add'; projectName: string }
  | { type: 'git_commit'; projectName: string }
  | { type: 'git_push'; projectName: string }
  | { type: 'git_add_commit'; projectName: string }
  | { type: 'git_add_commit_push'; projectName: string }
  | { type: 'git_pull'; projectName: string }
  | { type: 'git_fetch'; projectName: string }
  | { type: 'open_remote_browser'; projectName: string }
  | { type: 'git_checkout'; projectName: string; branch: string; trackRemote?: boolean }
  | { type: 'git_refresh_branches'; projectName: string }
  | { type: 'show_milestones'; projectName: string }
  | { type: 'close' }

export function getMenuTitle(panel: string, selectableKey: string, project?: Project): string {
  if (panel === 'projects' && project) {
    return `${project.name} [${project.stage}]`
  }
  if (panel === 'objectives') {
    return 'Objective'
  }
  switch (selectableKey) {
    case 'name': return project?.name ?? 'Project'
    case 'path': return 'Path'
    case 'branch': return 'Branch'
    case 'remote': return 'Remote'
    case 'milestones': return 'Milestones'
    case 'switches': return 'Switches'
    case 'xp': return 'XP'
    case 'tags': return 'Tags'
    default:
      if (selectableKey.startsWith('note:')) return 'Note'
      return selectableKey
  }
}

export function getActiveMenuItems(
  selectableKey: string,
  project: Project,
  dispatch: (action: MenuAction) => void,
): MenuItem[] {
  const name = project.name

  switch (selectableKey) {
    case 'name':
      return [
        { label: 'Rename project', action: () => dispatch({ type: 'rename_project', projectName: name }) },
        ...STAGES.filter(s => s !== project.stage).map(stage => ({
          label: `Set stage to '${stage}'`,
          action: () => dispatch({ type: 'set_stage', projectName: name, stage }),
        })),
        {
          label: project.status === 'paused' ? 'Resume project' : 'Pause project',
          action: () => dispatch({ type: 'toggle_pause', projectName: name }),
        },
      ]

    case 'path':
      return [
        { label: 'Open project folder', action: () => dispatch({ type: 'open_folder', projectPath: project.path }) },
        { label: 'Open in VS Code', action: () => dispatch({ type: 'open_vscode', projectPath: project.path }) },
        { label: 'Open in new tab', action: () => dispatch({ type: 'open_terminal_tab', projectPath: project.path }) },
      ]

    case 'branch': {
      const currentBranch = getCurrentBranch(project.path)
      const localBranches = getLocalBranches(project.path)
      const localBranchSet = new Set(localBranches)
      const otherLocalBranches = localBranches.filter(b => b && b !== currentBranch)
      const remoteBranches = getRemoteBranches(project.path)
      const remoteOnly = remoteBranches
        .map(remote => remote.trim())
        .filter(remote => remote.length > 0)
        .filter(remote => {
          const short = remote.includes('/') ? remote.split('/').slice(1).join('/') : remote
          if (short === currentBranch) return false
          return !localBranchSet.has(short)
        })
      const items: MenuItem[] = [
        ...otherLocalBranches.map(branch => ({
          label: `Checkout '${branch}'`,
          action: () => dispatch({ type: 'git_checkout', projectName: name, branch }),
        })),
        ...remoteOnly.map(remote => ({
          label: `Track remote '${remote}'`,
          action: () => dispatch({ type: 'git_checkout', projectName: name, branch: remote, trackRemote: true }),
        })),
      ]
      if (items.length === 0) {
        items.push({ label: 'No other branches available', action: () => {} })
      }
      items.push({
        label: 'Refresh branch list (fetch --all)',
        action: () => dispatch({ type: 'git_refresh_branches', projectName: name }),
      })
      return items
    }

    case 'remote':
      return [
        { label: 'git add .', action: () => dispatch({ type: 'git_add', projectName: name }) },
        { label: 'git commit', action: () => dispatch({ type: 'git_commit', projectName: name }) },
        { label: 'git push', action: () => dispatch({ type: 'git_push', projectName: name }) },
        { label: 'git add + commit', action: () => dispatch({ type: 'git_add_commit', projectName: name }) },
        { label: 'git add + commit + push', action: () => dispatch({ type: 'git_add_commit_push', projectName: name }) },
        { label: 'git pull', action: () => dispatch({ type: 'git_pull', projectName: name }) },
        { label: 'git fetch', action: () => dispatch({ type: 'git_fetch', projectName: name }) },
        { label: 'Open in browser', action: () => dispatch({ type: 'open_remote_browser', projectName: name }) },
      ]

    case 'milestones':
      return [
        { label: 'Show all milestones', action: () => dispatch({ type: 'show_milestones', projectName: name }) },
      ]

    case 'tags':
      return [
        { label: 'Add tag', action: () => dispatch({ type: 'add_tag', projectName: name }) },
        ...project.tags.map(tag => ({
          label: `Remove tag '${tag}'`,
          action: () => dispatch({ type: 'remove_tag', projectName: name, tag }),
        })),
      ]

    default:
      if (selectableKey.startsWith('note:')) {
        const noteContent = selectableKey.slice(5)
        const noteIndex = project.notes.indexOf(noteContent)
        return [
          { label: 'Delete note', action: () => dispatch({ type: 'delete_note', projectName: name, noteIndex }) },
          { label: 'Add new note', action: () => dispatch({ type: 'add_note', projectName: name }) },
        ]
      }

      // For non-actionable items (commits, switches, xp, milestones, branch)
      return [
        { label: 'Rename project', action: () => dispatch({ type: 'rename_project', projectName: name }) },
        { label: 'Add note', action: () => dispatch({ type: 'add_note', projectName: name }) },
      ]
  }
}

export function getObjectivesMenuItems(
  objectiveIndex: number,
  project: Project,
  dispatch: (action: MenuAction) => void,
  isHiddenList?: boolean,
): MenuItem[] {
  const name = project.name
  if (isHiddenList) {
    return [
      { label: 'Unhide objective', action: () => dispatch({ type: 'unhide_objective', projectName: name, objectiveIndex }) },
      { label: 'Complete objective', action: () => dispatch({ type: 'delete_objective', projectName: name, objectiveIndex }) },
    ]
  }
  const obj = project.objectives[objectiveIndex]
  const items: MenuItem[] = [
    { label: 'Complete objective', action: () => dispatch({ type: 'delete_objective', projectName: name, objectiveIndex }) },
    { label: 'Edit objective', action: () => dispatch({ type: 'edit_objective', projectName: name, objectiveIndex }) },
    {
      label: obj?.focused ? 'Unfocus objective' : 'Focus objective',
      action: () => dispatch({ type: 'focus_objective', projectName: name, objectiveIndex }),
    },
    { label: 'Hide objective', action: () => dispatch({ type: 'hide_objective', projectName: name, objectiveIndex }) },
    { label: 'Add new objective', action: () => dispatch({ type: 'add_objective', projectName: name }) },
  ]
  if (project.objectives.some(o => o.hidden)) {
    items.push({ label: 'Show hidden objectives', action: () => dispatch({ type: 'show_hidden_objectives', projectName: name }) })
  }
  return items
}

export function getProjectsMenuItems(
  project: Project,
  isActive: boolean,
  dispatch: (action: MenuAction) => void,
): MenuItem[] {
  const name = project.name
  const items: MenuItem[] = []

  if (!isActive) {
    items.push({ label: 'Switch to this project', action: () => dispatch({ type: 'switch_project', projectName: name }) })
  }

  items.push(
    { label: 'Rename project', action: () => dispatch({ type: 'rename_project', projectName: name }) },
  )

  for (const stage of STAGES) {
    if (stage !== project.stage) {
      items.push({
        label: `Set stage to '${stage}'`,
        action: () => dispatch({ type: 'set_stage', projectName: name, stage }),
      })
    }
  }

  items.push({
    label: project.status === 'paused' ? 'Resume project' : 'Pause project',
    action: () => dispatch({ type: 'toggle_pause', projectName: name }),
  })

  if (project.stage !== 'archived') {
    items.push({ label: 'Archive project', action: () => dispatch({ type: 'archive_project', projectName: name }) })
  }

  items.push({ label: 'Delete project', action: () => dispatch({ type: 'delete_project', projectName: name }) })

  return items
}
