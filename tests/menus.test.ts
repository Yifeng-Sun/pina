import { describe, it, expect, vi } from 'vitest'
import {
  getMenuTitle,
  getActiveMenuItems,
  getActiveMenuKind,
  getProjectsMenuItems,
  getObjectivesMenuItems,
  getAssetDetailTitle,
  getAssetDetailMenuItems,
  type MenuAction,
} from '../src/lib/menus.js'
import { makeProject } from './helpers.js'

vi.mock('../src/lib/git.js', () => ({
  getCurrentBranch: () => 'main',
  getLocalBranches: () => ['main', 'feature'],
  getRemoteBranches: () => ['origin/main', 'origin/feature', 'origin/wip'],
  getRemoteUrl: () => undefined,
}))

vi.mock('../src/lib/claudeAssets.js', () => ({
  listAgents: () => [
    { scope: 'project', name: 'alpha', kind: 'agent', body: '', description: '', shadowedBy: undefined },
    { scope: 'personal', name: 'beta', kind: 'agent', body: '', description: '', shadowedBy: 'project' },
  ],
  listSkills: () => [
    { scope: 'project', name: 'sk1', kind: 'skill', body: '', description: '', shadowedBy: undefined },
  ],
}))

function collect() {
  const calls: MenuAction[] = []
  return { dispatch: (a: MenuAction) => calls.push(a), calls }
}

describe('getMenuTitle', () => {
  it('returns project name + stage when on projects panel', () => {
    const p = makeProject({ name: 'demo', stage: 'stable' })
    expect(getMenuTitle('projects', 'name', p)).toBe('demo [stable]')
  })

  it('returns Objective for objectives panel', () => {
    expect(getMenuTitle('objectives', 'whatever')).toBe('Objective')
  })

  it('returns titles for known selectable keys', () => {
    expect(getMenuTitle('active', 'path')).toBe('Path')
    expect(getMenuTitle('active', 'branch')).toBe('Branch')
    expect(getMenuTitle('active', 'remote')).toBe('Remote')
    expect(getMenuTitle('active', 'milestones')).toBe('Milestones')
    expect(getMenuTitle('active', 'tags')).toBe('Tags')
    expect(getMenuTitle('active', 'subagents')).toBe('Sub-Agents')
    expect(getMenuTitle('active', 'skills')).toBe('Skills')
  })

  it('returns Note for note: keys', () => {
    expect(getMenuTitle('active', 'note:hello')).toBe('Note')
  })

  it('returns the project name for the name key', () => {
    expect(getMenuTitle('active', 'name', makeProject({ name: 'p' }))).toBe('p')
  })
})

describe('getActiveMenuKind', () => {
  it('namespaces note keys', () => {
    expect(getActiveMenuKind('note:hi')).toBe('active:note')
  })
  it('namespaces other keys directly', () => {
    expect(getActiveMenuKind('branch')).toBe('active:branch')
  })
})

describe('getActiveMenuItems — name', () => {
  it('lists rename, all other stages, and pause toggle', () => {
    const project = makeProject({ stage: 'development', status: 'active' })
    const { dispatch } = collect()
    const items = getActiveMenuItems('name', project, dispatch)
    const labels = items.map(i => i.label)
    expect(labels).toContain('Rename project')
    expect(labels).toContain('Pause project')
    expect(labels.filter(l => l.startsWith('Set stage'))).toHaveLength(5)
    expect(labels.some(l => l.includes("'development'"))).toBe(false)
  })

  it('shows resume label when paused', () => {
    const project = makeProject({ status: 'paused' })
    const { dispatch } = collect()
    const items = getActiveMenuItems('name', project, dispatch)
    expect(items.some(i => i.label === 'Resume project')).toBe(true)
  })

  it('dispatches set_stage with the chosen stage', () => {
    const project = makeProject({ stage: 'development' })
    const { dispatch, calls } = collect()
    const items = getActiveMenuItems('name', project, dispatch)
    items.find(i => i.label === "Set stage to 'stable'")!.action()
    expect(calls).toEqual([{ type: 'set_stage', projectName: 'demo', stage: 'stable' }])
  })
})

describe('getActiveMenuItems — path', () => {
  it('exposes folder, vscode, and terminal actions', () => {
    const project = makeProject({ path: '/tmp/foo' })
    const { dispatch, calls } = collect()
    const items = getActiveMenuItems('path', project, dispatch)
    expect(items.map(i => i.label)).toEqual([
      'Open project folder',
      'Open in VS Code',
      'Open in new tab',
    ])
    items[0]!.action()
    expect(calls[0]).toEqual({ type: 'open_folder', projectPath: '/tmp/foo' })
  })
})

describe('getActiveMenuItems — branch', () => {
  it('lists git ops, then other branches and untracked remotes, then refresh', () => {
    const project = makeProject()
    const { dispatch } = collect()
    const items = getActiveMenuItems('branch', project, dispatch)
    const labels = items.map(i => i.label)
    expect(labels.slice(0, 7)).toEqual([
      'git add .',
      'git commit',
      'git push',
      'git add + commit',
      'git add + commit + push',
      'git pull',
      'git fetch',
    ])
    expect(labels).toContain("Checkout 'feature'")
    expect(labels).toContain("Track remote 'origin/wip'")
    expect(labels).not.toContain("Track remote 'origin/main'")
    expect(labels).not.toContain("Track remote 'origin/feature'")
    expect(labels[labels.length - 1]).toBe('Refresh branch list (fetch --all)')
  })

  it('dispatches checkout with trackRemote for remote-only branches', () => {
    const project = makeProject()
    const { dispatch, calls } = collect()
    const items = getActiveMenuItems('branch', project, dispatch)
    items.find(i => i.label === "Track remote 'origin/wip'")!.action()
    expect(calls[0]).toMatchObject({ type: 'git_checkout', branch: 'origin/wip', trackRemote: true })
  })
})

describe('getActiveMenuItems — remote', () => {
  it('contains only Open in browser', () => {
    const project = makeProject()
    const { dispatch, calls } = collect()
    const items = getActiveMenuItems('remote', project, dispatch)
    expect(items).toHaveLength(1)
    expect(items[0]!.label).toBe('Open in browser')
    items[0]!.action()
    expect(calls).toEqual([{ type: 'open_remote_browser', projectName: 'demo' }])
  })
})

describe('getActiveMenuItems — tags', () => {
  it('lists add tag plus remove for each existing tag', () => {
    const project = makeProject({ tags: ['rust', 'cli'] })
    const { dispatch, calls } = collect()
    const items = getActiveMenuItems('tags', project, dispatch)
    expect(items.map(i => i.label)).toEqual(['Add tag', "Remove tag 'rust'", "Remove tag 'cli'"])
    items[1]!.action()
    expect(calls[0]).toEqual({ type: 'remove_tag', projectName: 'demo', tag: 'rust' })
  })
})

describe('getActiveMenuItems — note: prefix', () => {
  it('returns delete + add note for an existing note', () => {
    const project = makeProject({ notes: ['first', 'second'] })
    const { dispatch, calls } = collect()
    const items = getActiveMenuItems('note:second', project, dispatch)
    expect(items.map(i => i.label)).toEqual(['Delete note', 'Add new note'])
    items[0]!.action()
    expect(calls[0]).toEqual({ type: 'delete_note', projectName: 'demo', noteIndex: 1 })
  })
})

describe('getActiveMenuItems — subagents and skills', () => {
  it('lists project agents before personal, with shadow suffix', () => {
    const project = makeProject()
    const items = getActiveMenuItems('subagents', project, () => {})
    const labels = items.map(i => i.label)
    expect(labels[0]).toContain('alpha')
    expect(labels[0]).toContain('(project)')
    expect(labels[1]).toContain('beta')
    expect(labels[1]).toContain('[shadowed]')
    expect(labels).toContain('New project sub-agent…')
    expect(labels).toContain('New personal sub-agent…')
  })

  it('lists skills with new-skill entries appended', () => {
    const items = getActiveMenuItems('skills', makeProject(), () => {})
    const labels = items.map(i => i.label)
    expect(labels[0]).toContain('sk1')
    expect(labels).toContain('New project skill…')
    expect(labels).toContain('New personal skill…')
  })
})

describe('getProjectsMenuItems', () => {
  it('omits switch entry when active', () => {
    const project = makeProject({ stage: 'development' })
    const items = getProjectsMenuItems(project, true, () => {})
    expect(items.some(i => i.label === 'Switch to this project')).toBe(false)
  })

  it('includes switch entry when inactive', () => {
    const items = getProjectsMenuItems(makeProject(), false, () => {})
    expect(items[0]!.label).toBe('Switch to this project')
  })

  it('omits archive when already archived', () => {
    const items = getProjectsMenuItems(makeProject({ stage: 'archived' }), true, () => {})
    expect(items.some(i => i.label === 'Archive project')).toBe(false)
  })

  it('always includes delete project at the end', () => {
    const items = getProjectsMenuItems(makeProject(), true, () => {})
    expect(items[items.length - 1]!.label).toBe('Delete project')
  })

  it('lists all stages other than the current one', () => {
    const items = getProjectsMenuItems(makeProject({ stage: 'planning' }), true, () => {})
    const stageLabels = items.filter(i => i.label.startsWith('Set stage')).map(i => i.label)
    expect(stageLabels).toHaveLength(5)
    expect(stageLabels.some(l => l.includes("'planning'"))).toBe(false)
  })
})

describe('getObjectivesMenuItems', () => {
  it('returns unhide + complete for hidden list', () => {
    const project = makeProject({
      objectives: [{ text: 'a', hidden: true, focused: false }],
    })
    const items = getObjectivesMenuItems(0, project, () => {}, true)
    expect(items.map(i => i.label)).toEqual(['Unhide objective', 'Complete objective'])
  })

  it('shows Unfocus when objective is focused', () => {
    const project = makeProject({
      objectives: [{ text: 'a', hidden: false, focused: true }],
    })
    const items = getObjectivesMenuItems(0, project, () => {})
    expect(items.some(i => i.label === 'Unfocus objective')).toBe(true)
  })

  it('shows Focus when objective is not focused', () => {
    const project = makeProject({
      objectives: [{ text: 'a', hidden: false, focused: false }],
    })
    const items = getObjectivesMenuItems(0, project, () => {})
    expect(items.some(i => i.label === 'Focus objective')).toBe(true)
  })

  it('appends Show hidden objectives when any are hidden', () => {
    const project = makeProject({
      objectives: [
        { text: 'a', hidden: false, focused: false },
        { text: 'b', hidden: true, focused: false },
      ],
    })
    const items = getObjectivesMenuItems(0, project, () => {})
    expect(items[items.length - 1]!.label).toBe('Show hidden objectives')
  })
})

describe('getAssetDetailTitle and getAssetDetailMenuItems', () => {
  const agent: any = {
    kind: 'agent',
    name: 'alpha',
    scope: 'project',
    description: 'an agent',
    body: 'line1\nline2\nline3',
    model: 'sonnet',
    tools: ['Read', 'Edit'],
  }

  it('formats the title', () => {
    expect(getAssetDetailTitle(agent)).toBe('Sub-Agent: alpha (project)')
  })

  it('lists info rows and edit/delete actions for an agent', () => {
    const items = getAssetDetailMenuItems(agent, () => {})
    const labels = items.map(i => i.label)
    expect(labels).toContain('Description: an agent')
    expect(labels).toContain('Model: sonnet')
    expect(labels).toContain('Tools: Read, Edit')
    expect(labels).toContain('Prompt: 3 lines')
    expect(labels).toContain('Edit prompt')
    expect(labels).toContain('Edit description')
    expect(labels).toContain('Delete sub-agent')
  })

  it('renders truncated description when long', () => {
    const long = { ...agent, description: 'x'.repeat(100) }
    const items = getAssetDetailMenuItems(long, () => {})
    const desc = items.find(i => i.key === 'info_description')!.label
    expect(desc.endsWith('…')).toBe(true)
  })

  it('uses skill labels for skills', () => {
    const skill: any = { kind: 'skill', name: 's', scope: 'personal', description: 'd', body: 'one' }
    expect(getAssetDetailTitle(skill)).toBe('Skill: s (personal)')
    const items = getAssetDetailMenuItems(skill, () => {})
    expect(items.some(i => i.label === 'Delete skill')).toBe(true)
    expect(items.some(i => i.label === 'Prompt: 1 line')).toBe(true)
  })
})
