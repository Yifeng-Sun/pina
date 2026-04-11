import type { MenuItem } from '../components/ContextMenu.js'
import type { Project, Stage } from '../types.js'
import { getLocalBranches, getRemoteBranches, getCurrentBranch } from './git.js'
import { listAgents, listSkills, type Scope, type Asset } from './claudeAssets.js'


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
  | { type: 'complete_objective'; projectName: string; objectiveIndex: number }
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
  | { type: 'open_agent_detail'; scope: Scope; name: string }
  | { type: 'edit_agent_prompt'; scope: Scope; name: string }
  | { type: 'edit_agent_description'; scope: Scope; name: string }
  | { type: 'new_agent'; scope: Scope }
  | { type: 'delete_agent'; scope: Scope; name: string }
  | { type: 'open_skill_detail'; scope: Scope; name: string }
  | { type: 'edit_skill_prompt'; scope: Scope; name: string }
  | { type: 'edit_skill_description'; scope: Scope; name: string }
  | { type: 'new_skill'; scope: Scope }
  | { type: 'delete_skill'; scope: Scope; name: string }
  | { type: 'run_quick_action'; projectName: string; actionId: string }
  | { type: 'toggle_default_action'; projectName: string; actionId: string }
  | { type: 'add_quick_action'; projectName: string }
  | { type: 'delete_quick_action'; projectName: string; actionId: string }
  | { type: 'generate_actions_agent'; projectName: string }
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
    case 'subagents': return 'Sub-Agents'
    case 'skills': return 'Skills'
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
        { key: 'rename_project', label: 'Rename project', action: () => dispatch({ type: 'rename_project', projectName: name }) },
        ...STAGES.filter(s => s !== project.stage).map(stage => ({
          key: `set_stage:${stage}`,
          label: `Set stage to '${stage}'`,
          action: () => dispatch({ type: 'set_stage', projectName: name, stage }),
        })),
        {
          key: 'toggle_pause',
          label: project.status === 'paused' ? 'Resume project' : 'Pause project',
          action: () => dispatch({ type: 'toggle_pause', projectName: name }),
        },
      ]

    case 'path':
      return [
        { key: 'open_folder', label: 'Open project folder', action: () => dispatch({ type: 'open_folder', projectPath: project.path }) },
        { key: 'open_vscode', label: 'Open in VS Code', action: () => dispatch({ type: 'open_vscode', projectPath: project.path }) },
        { key: 'open_terminal_tab', label: 'Open in new tab', action: () => dispatch({ type: 'open_terminal_tab', projectPath: project.path }) },
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
        { key: 'git_add', label: 'git add .', action: () => dispatch({ type: 'git_add', projectName: name }) },
        { key: 'git_commit', label: 'git commit', action: () => dispatch({ type: 'git_commit', projectName: name }) },
        { key: 'git_push', label: 'git push', action: () => dispatch({ type: 'git_push', projectName: name }) },
        { key: 'git_add_commit', label: 'git add + commit', action: () => dispatch({ type: 'git_add_commit', projectName: name }) },
        { key: 'git_add_commit_push', label: 'git add + commit + push', action: () => dispatch({ type: 'git_add_commit_push', projectName: name }) },
        { key: 'git_pull', label: 'git pull', action: () => dispatch({ type: 'git_pull', projectName: name }) },
        { key: 'git_fetch', label: 'git fetch', action: () => dispatch({ type: 'git_fetch', projectName: name }) },
        ...otherLocalBranches.map(branch => ({
          key: `checkout:${branch}`,
          label: `Checkout '${branch}'`,
          action: () => dispatch({ type: 'git_checkout', projectName: name, branch }),
        })),
        ...remoteOnly.map(remote => ({
          key: `track_remote:${remote}`,
          label: `Track remote '${remote}'`,
          action: () => dispatch({ type: 'git_checkout', projectName: name, branch: remote, trackRemote: true }),
        })),
      ]
      items.push({
        key: 'refresh_branches',
        label: 'Refresh branch list (fetch --all)',
        action: () => dispatch({ type: 'git_refresh_branches', projectName: name }),
      })
      return items
    }

    case 'remote':
      return [
        { key: 'open_remote_browser', label: 'Open in browser', action: () => dispatch({ type: 'open_remote_browser', projectName: name }) },
      ]

    case 'milestones':
      return [
        { key: 'show_milestones', label: 'Show all milestones', action: () => dispatch({ type: 'show_milestones', projectName: name }) },
      ]

    case 'tags':
      return [
        { key: 'add_tag', label: 'Add tag', action: () => dispatch({ type: 'add_tag', projectName: name }) },
        ...project.tags.map(tag => ({
          key: `remove_tag:${tag}`,
          label: `Remove tag '${tag}'`,
          action: () => dispatch({ type: 'remove_tag', projectName: name, tag }),
        })),
      ]

    case 'subagents': {
      const agents = listAgents(project.path)
      const items: MenuItem[] = []
      const order = [
        ...agents.filter(a => a.scope === 'project'),
        ...agents.filter(a => a.scope === 'personal'),
      ]
      for (const a of order) {
        const tag = a.scope === 'project' ? 'project' : 'personal'
        const suffix = a.shadowedBy ? ' [shadowed]' : ''
        items.push({
          key: `open_agent:${a.scope}:${a.name}`,
          label: `${a.name}  (${tag})${suffix}`,
          action: () => dispatch({ type: 'open_agent_detail', scope: a.scope, name: a.name }),
        })
      }
      items.push({ key: 'new_agent_project', label: 'New project sub-agent…', action: () => dispatch({ type: 'new_agent', scope: 'project' }) })
      items.push({ key: 'new_agent_personal', label: 'New personal sub-agent…', action: () => dispatch({ type: 'new_agent', scope: 'personal' }) })
      return items
    }

    case 'skills': {
      const skills = listSkills(project.path)
      const items: MenuItem[] = []
      const order = [
        ...skills.filter(s => s.scope === 'project'),
        ...skills.filter(s => s.scope === 'personal'),
      ]
      for (const s of order) {
        const tag = s.scope === 'project' ? 'project' : 'personal'
        const suffix = s.shadowedBy ? ' [shadowed]' : ''
        items.push({
          key: `open_skill:${s.scope}:${s.name}`,
          label: `${s.name}  (${tag})${suffix}`,
          action: () => dispatch({ type: 'open_skill_detail', scope: s.scope, name: s.name }),
        })
      }
      items.push({ key: 'new_skill_project', label: 'New project skill…', action: () => dispatch({ type: 'new_skill', scope: 'project' }) })
      items.push({ key: 'new_skill_personal', label: 'New personal skill…', action: () => dispatch({ type: 'new_skill', scope: 'personal' }) })
      return items
    }

    default:
      if (selectableKey.startsWith('note:')) {
        const noteContent = selectableKey.slice(5)
        const noteIndex = project.notes.indexOf(noteContent)
        return [
          { key: 'delete_note', label: 'Delete note', action: () => dispatch({ type: 'delete_note', projectName: name, noteIndex }) },
          { key: 'add_note', label: 'Add new note', action: () => dispatch({ type: 'add_note', projectName: name }) },
        ]
      }

      // For non-actionable items (commits, switches, xp, milestones, branch)
      return [
        { key: 'rename_project', label: 'Rename project', action: () => dispatch({ type: 'rename_project', projectName: name }) },
        { key: 'add_note', label: 'Add note', action: () => dispatch({ type: 'add_note', projectName: name }) },
      ]
  }
}

function formatObjectiveDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function getObjectivesMenuItems(
  objectiveIndex: number,
  project: Project,
  dispatch: (action: MenuAction) => void,
  isHiddenList?: boolean,
): MenuItem[] {
  const name = project.name
  const obj = project.objectives[objectiveIndex]
  const infoItems: MenuItem[] = []
  if (obj?.createdAt) {
    infoItems.push({ key: 'info_started', label: `Started: ${formatObjectiveDate(obj.createdAt)}`, action: () => {}, info: true })
  }
  if (obj?.completedAt) {
    infoItems.push({ key: 'info_completed', label: `Completed: ${formatObjectiveDate(obj.completedAt)}`, action: () => {}, info: true })
  }
  if (isHiddenList) {
    return [
      ...infoItems,
      { key: 'unhide_objective', label: 'Unhide objective', action: () => dispatch({ type: 'unhide_objective', projectName: name, objectiveIndex }) },
      { key: 'complete_objective', label: 'Complete objective', action: () => dispatch({ type: 'complete_objective', projectName: name, objectiveIndex }) },
    ]
  }
  const items: MenuItem[] = [
    ...infoItems,
    { key: 'complete_objective', label: 'Complete objective', action: () => dispatch({ type: 'complete_objective', projectName: name, objectiveIndex }) },
    { key: 'edit_objective', label: 'Edit objective', action: () => dispatch({ type: 'edit_objective', projectName: name, objectiveIndex }) },
    {
      key: 'toggle_focus',
      label: obj?.focused ? 'Unfocus objective' : 'Focus objective',
      action: () => dispatch({ type: 'focus_objective', projectName: name, objectiveIndex }),
    },
    { key: 'hide_objective', label: 'Hide objective', action: () => dispatch({ type: 'hide_objective', projectName: name, objectiveIndex }) },
    { key: 'add_objective', label: 'Add new objective', action: () => dispatch({ type: 'add_objective', projectName: name }) },
  ]
  if (project.objectives.some(o => o.hidden)) {
    items.push({ key: 'show_hidden_objectives', label: 'Show hidden objectives', action: () => dispatch({ type: 'show_hidden_objectives', projectName: name }) })
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
    items.push({ key: 'switch_project', label: 'Switch to this project', action: () => dispatch({ type: 'switch_project', projectName: name }) })
  }

  items.push(
    { key: 'rename_project', label: 'Rename project', action: () => dispatch({ type: 'rename_project', projectName: name }) },
  )

  for (const stage of STAGES) {
    if (stage !== project.stage) {
      items.push({
        key: `set_stage:${stage}`,
        label: `Set stage to '${stage}'`,
        action: () => dispatch({ type: 'set_stage', projectName: name, stage }),
      })
    }
  }

  items.push({
    key: 'toggle_pause',
    label: project.status === 'paused' ? 'Resume project' : 'Pause project',
    action: () => dispatch({ type: 'toggle_pause', projectName: name }),
  })

  if (project.stage !== 'archived') {
    items.push({ key: 'archive_project', label: 'Archive project', action: () => dispatch({ type: 'archive_project', projectName: name }) })
  }

  items.push({ key: 'delete_project', label: 'Delete project', action: () => dispatch({ type: 'delete_project', projectName: name }) })

  return items
}

export function getAssetDetailTitle(asset: Asset): string {
  const kind = asset.kind === 'agent' ? 'Sub-Agent' : 'Skill'
  return `${kind}: ${asset.name} (${asset.scope})`
}

export function getAssetDetailMenuItems(asset: Asset, dispatch: (action: MenuAction) => void): MenuItem[] {
  const items: MenuItem[] = []
  const desc = asset.description ? asset.description : '(no description)'
  const truncDesc = desc.length > 60 ? desc.slice(0, 57) + '…' : desc
  items.push({ key: 'info_description', label: `Description: ${truncDesc}`, action: () => {}, info: true })
  if (asset.kind === 'agent') {
    if (asset.model) items.push({ key: 'info_model', label: `Model: ${asset.model}`, action: () => {}, info: true })
    if (asset.tools && asset.tools.length > 0) {
      items.push({ key: 'info_tools', label: `Tools: ${asset.tools.join(', ')}`, action: () => {}, info: true })
    }
  }
  const bodyLines = asset.body.split('\n').length
  items.push({ key: 'info_prompt', label: `Prompt: ${bodyLines} line${bodyLines === 1 ? '' : 's'}`, action: () => {}, info: true })
  if (asset.shadowedBy) {
    items.push({ key: 'info_shadowed', label: `Shadowed by ${asset.shadowedBy} entry`, action: () => {}, info: true })
  }
  if (asset.kind === 'agent') {
    items.push({
      key: 'edit_prompt',
      label: 'Edit prompt',
      action: () => dispatch({ type: 'edit_agent_prompt', scope: asset.scope, name: asset.name }),
    })
    items.push({
      key: 'edit_description',
      label: 'Edit description',
      action: () => dispatch({ type: 'edit_agent_description', scope: asset.scope, name: asset.name }),
    })
    items.push({
      key: 'delete_asset',
      label: 'Delete sub-agent',
      action: () => dispatch({ type: 'delete_agent', scope: asset.scope, name: asset.name }),
    })
  } else {
    items.push({
      key: 'edit_prompt',
      label: 'Edit prompt',
      action: () => dispatch({ type: 'edit_skill_prompt', scope: asset.scope, name: asset.name }),
    })
    items.push({
      key: 'edit_description',
      label: 'Edit description',
      action: () => dispatch({ type: 'edit_skill_description', scope: asset.scope, name: asset.name }),
    })
    items.push({
      key: 'delete_asset',
      label: 'Delete skill',
      action: () => dispatch({ type: 'delete_skill', scope: asset.scope, name: asset.name }),
    })
  }
  return items
}

export function getActiveMenuKind(selectableKey: string): string {
  if (selectableKey.startsWith('note:')) return 'active:note'
  return `active:${selectableKey}`
}
