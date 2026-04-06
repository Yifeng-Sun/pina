import React, { useState, useMemo, useCallback } from 'react'
import { Text, Box, useInput, useApp } from 'ink'
import {
  loadRegistry,
  setProject,
  removeProject,
  renameProject,
  setActiveProject,
} from '../lib/config.js'
import { getCurrentBranch, isDirty, getCommitCount } from '../lib/git.js'
import { updateSymlink } from '../lib/symlink.js'
import { StatusBadge } from '../components/StatusBadge.js'
import { ContextMenu } from '../components/ContextMenu.js'
import { TextInput } from '../components/TextInput.js'
import { MILESTONE_LABELS } from '../types.js'
import { playSound, toggleMute, isMuted } from '../lib/sound.js'
import type { Project, MilestoneKey, Stage, PinaRegistry } from '../types.js'
import type { MenuItem } from '../components/ContextMenu.js'
import {
  getMenuTitle,
  getActiveMenuItems,
  getObjectivesMenuItems,
  getProjectsMenuItems,
  type MenuAction,
} from '../lib/menus.js'

type PanelId = 'active' | 'objectives' | 'projects'
type OverlayMode =
  | { type: 'menu'; title: string; items: MenuItem[] }
  | { type: 'text_input'; prompt: string; defaultValue?: string; onSubmit: (value: string) => void }
  | null

const PANEL_ORDER: PanelId[] = ['active', 'objectives', 'projects']

function getActiveSelectables(project: Project | undefined): string[] {
  if (!project) return []
  const items: string[] = ['name', 'path']
  if (getCurrentBranch(project.path)) items.push('branch')
  if (project.remote) items.push('remote')
  items.push('commits', 'switches', 'xp')
  if (project.tags.length > 0) items.push('tags')
  for (const note of project.notes.slice(-3)) {
    items.push(`note:${note}`)
  }
  for (const key of Object.keys(project.milestones).slice(-4)) {
    items.push(`milestone:${key}`)
  }
  return items
}

function ActiveProjectPanel({
  project,
  entered,
  selectedIndex,
}: {
  project: Project | undefined
  entered: boolean
  selectedIndex: number
}) {
  if (!project) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text dimColor>No active project.</Text>
        <Text dimColor>Run `pina switch &lt;name&gt;` to select one.</Text>
      </Box>
    )
  }

  const branch = getCurrentBranch(project.path)
  const dirty = isDirty(project.path)
  const commits = getCommitCount(project.path)
  const selectables = getActiveSelectables(project)
  const hi = (key: string) => entered && selectables[selectedIndex] === key

  const notes = project.notes.slice(-3)
  const milestones = Object.entries(project.milestones).slice(-4)

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box gap={2}>
        <Text bold color="green" inverse={hi('name')}>{project.name}</Text>
        <StatusBadge stage={project.stage} stale={project.stale} status={project.status} />
      </Box>

      <Text dimColor inverse={hi('path')}>{project.path}</Text>
      <Text> </Text>

      {branch && (
        <Text inverse={hi('branch')}>
          <Text dimColor>Branch   </Text>
          <Text color="cyan">{branch}</Text>
          {dirty ? <Text color="yellow"> (dirty)</Text> : ''}
        </Text>
      )}
      {project.remote && (
        <Text inverse={hi('remote')}>
          <Text dimColor>Remote   </Text>
          <Text color="blue">{project.remote}</Text>
        </Text>
      )}
      <Text inverse={hi('commits')}>
        <Text dimColor>Commits  </Text>
        <Text>{commits}</Text>
      </Text>
      <Text inverse={hi('switches')}>
        <Text dimColor>Switches </Text>
        <Text>{project.stats.switches}</Text>
      </Text>
      <Text inverse={hi('xp')}>
        <Text dimColor>XP       </Text>
        <Text color="yellow">{project.xp}</Text>
      </Text>
      {project.tags.length > 0 && (
        <Text inverse={hi('tags')}>
          <Text dimColor>Tags     </Text>
          <Text>{project.tags.join(', ')}</Text>
        </Text>
      )}

      {notes.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold dimColor>Recent Notes</Text>
          {notes.map((note, i) => (
            <Text key={`note-${i}`} dimColor inverse={hi(`note:${note}`)}>  {note}</Text>
          ))}
        </Box>
      )}

      {milestones.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold dimColor>Milestones</Text>
          {milestones.map(([key, date]) => (
            <Text key={`ms-${key}`} dimColor inverse={hi(`milestone:${key}`)}>
              {'  '}{MILESTONE_LABELS[key as MilestoneKey] ?? key} <Text italic>{date}</Text>
            </Text>
          ))}
        </Box>
      )}
    </Box>
  )
}

function ObjectivesPanel({
  project,
  entered,
  selectedIndex,
}: {
  project: Project | undefined
  entered: boolean
  selectedIndex: number
}) {
  const objectives = project?.objectives ?? []
  const addIndex = objectives.length // [+] is always the last selectable
  const isAddSelected = entered && selectedIndex === addIndex

  return (
    <Box flexDirection="column" paddingX={1}>
      {objectives.length === 0 && (
        <Text dimColor>No objectives set.</Text>
      )}
      {objectives.map((obj, i) => {
        const isSelected = entered && selectedIndex === i
        return (
          <Text key={`obj-${i}`} inverse={isSelected}>
            <Text dimColor>{`${i + 1}. `}</Text>
            <Text>{obj}</Text>
          </Text>
        )
      })}
      <Text> </Text>
      <Text inverse={isAddSelected} color={isAddSelected ? 'green' : 'green'}>
        {'  [+] Add objective'}
      </Text>
    </Box>
  )
}

function AllProjectsPanel({
  projects,
  activeProjectName,
  entered,
  selectedIndex,
}: {
  projects: Project[]
  activeProjectName?: string
  entered: boolean
  selectedIndex: number
}) {
  if (projects.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text dimColor>No projects registered.</Text>
        <Text dimColor>Run `pina init` or `pina scan` to get started.</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {projects.map((project, i) => {
        const isActive = project.name === activeProjectName
        const marker = isActive ? '▸' : ' '
        const isSelected = entered && selectedIndex === i

        return (
          <Box key={project.name} gap={1}>
            <Text color={isActive ? 'green' : undefined} inverse={isSelected}>
              {marker} {project.name}
            </Text>
            <StatusBadge stage={project.stage} stale={project.stale} status={project.status} />
            {project.tags.length > 0 && (
              <Text dimColor>{project.tags.join(', ')}</Text>
            )}
          </Box>
        )
      })}
    </Box>
  )
}

export function Dashboard() {
  const { exit } = useApp()

  // Mutable registry — reload on every action to stay fresh
  const [refreshKey, setRefreshKey] = useState(0)
  const registry = useMemo(() => loadRegistry(), [refreshKey])
  const projects = useMemo(() => Object.values(registry.projects), [registry])
  const activeProject = registry.config.activeProject
    ? registry.projects[registry.config.activeProject]
    : undefined

  const refresh = useCallback(() => setRefreshKey(k => k + 1), [])

  // Navigation state
  const [focusedPanel, setFocusedPanel] = useState<PanelId>('active')
  const [enteredPanel, setEnteredPanel] = useState<PanelId | null>(null)
  const [selectedIndices, setSelectedIndices] = useState<Record<PanelId, number>>({
    active: 0,
    objectives: 0,
    projects: 0,
  })

  // Overlay state (menu or text input)
  const [overlay, setOverlay] = useState<OverlayMode>(null)

  const selectableCounts = useMemo<Record<PanelId, number>>(() => ({
    active: getActiveSelectables(activeProject).length,
    objectives: activeProject ? (activeProject.objectives.length + 1) : 0, // +1 for [+] add button
    projects: projects.length,
  }), [activeProject, projects])

  // Action dispatcher — handles all mutations from menus
  const dispatch = useCallback((action: MenuAction) => {
    switch (action.type) {
      case 'rename_project': {
        const project = registry.projects[action.projectName]
        if (!project) break
        setOverlay({
          type: 'text_input',
          prompt: `Rename "${action.projectName}" to:`,
          defaultValue: action.projectName,
          onSubmit: (newName: string) => {
            renameProject(action.projectName, newName)
            setOverlay(null)
            refresh()
          },
        })
        return // don't close overlay
      }

      case 'set_stage': {
        const project = registry.projects[action.projectName]
        if (!project) break
        project.stage = action.stage
        if (action.stage === 'archived') {
          project.milestones.archived = new Date().toISOString().split('T')[0]!
        }
        if (action.stage === 'complete') {
          project.milestones.completed = new Date().toISOString().split('T')[0]!
        }
        setProject(action.projectName, project)
        playSound('success')
        break
      }

      case 'toggle_pause': {
        const project = registry.projects[action.projectName]
        if (!project) break
        project.status = project.status === 'paused' ? 'active' : 'paused'
        setProject(action.projectName, project)
        playSound('toggle')
        break
      }

      case 'archive_project': {
        const project = registry.projects[action.projectName]
        if (!project) break
        project.stage = 'archived'
        project.status = 'paused'
        project.milestones.archived = new Date().toISOString().split('T')[0]!
        setProject(action.projectName, project)
        playSound('success')
        break
      }

      case 'delete_project': {
        removeProject(action.projectName)
        if (registry.config.activeProject === action.projectName) {
          setActiveProject(undefined)
        }
        playSound('delete')
        break
      }

      case 'switch_project': {
        const project = registry.projects[action.projectName]
        if (!project) break
        const now = new Date().toISOString().split('T')[0]!
        project.stats.switches += 1
        project.lastSwitched = now
        project.xp += 1
        if (!project.milestones.first_switch) {
          project.milestones.first_switch = now
        }
        if (project.stats.switches >= 10 && !project.milestones.ten_switches) {
          project.milestones.ten_switches = now
        }
        setProject(action.projectName, project)
        setActiveProject(action.projectName)
        try { updateSymlink(project.path) } catch {}
        playSound('success')
        break
      }

      case 'add_tag': {
        setOverlay({
          type: 'text_input',
          prompt: 'Add tag:',
          onSubmit: (tag: string) => {
            const project = registry.projects[action.projectName]
            if (project && !project.tags.includes(tag)) {
              project.tags.push(tag)
              setProject(action.projectName, project)
            }
            setOverlay(null)
            refresh()
          },
        })
        return
      }

      case 'remove_tag': {
        const project = registry.projects[action.projectName]
        if (!project) break
        project.tags = project.tags.filter(t => t !== action.tag)
        setProject(action.projectName, project)
        playSound('delete')
        break
      }

      case 'add_note': {
        setOverlay({
          type: 'text_input',
          prompt: 'Add note:',
          onSubmit: (text: string) => {
            const project = registry.projects[action.projectName]
            if (project) {
              const now = new Date().toISOString().split('T')[0]!
              project.notes.push(`[${now}] ${text}`)
              project.xp += 1
              if (!project.milestones.first_note) {
                project.milestones.first_note = now
              }
              setProject(action.projectName, project)
            }
            setOverlay(null)
            refresh()
          },
        })
        return
      }

      case 'delete_note': {
        const project = registry.projects[action.projectName]
        if (!project || action.noteIndex < 0) break
        project.notes.splice(action.noteIndex, 1)
        setProject(action.projectName, project)
        playSound('delete')
        break
      }

      case 'add_objective': {
        setOverlay({
          type: 'text_input',
          prompt: 'Add objective:',
          onSubmit: (text: string) => {
            const project = registry.projects[action.projectName]
            if (project) {
              project.objectives.push(text)
              setProject(action.projectName, project)
            }
            setOverlay(null)
            refresh()
          },
        })
        return
      }

      case 'edit_objective': {
        const project = registry.projects[action.projectName]
        if (!project) break
        const current = project.objectives[action.objectiveIndex] ?? ''
        setOverlay({
          type: 'text_input',
          prompt: 'Edit objective:',
          defaultValue: current,
          onSubmit: (text: string) => {
            const p = registry.projects[action.projectName]
            if (p) {
              p.objectives[action.objectiveIndex] = text
              setProject(action.projectName, p)
            }
            setOverlay(null)
            refresh()
          },
        })
        return
      }

      case 'delete_objective': {
        const project = registry.projects[action.projectName]
        if (!project) break
        project.objectives.splice(action.objectiveIndex, 1)
        setProject(action.projectName, project)
        playSound('delete')
        break
      }

      case 'set_remote': {
        const project = registry.projects[action.projectName]
        setOverlay({
          type: 'text_input',
          prompt: 'Set remote URL:',
          defaultValue: project?.remote ?? '',
          onSubmit: (url: string) => {
            const p = registry.projects[action.projectName]
            if (p) {
              p.remote = url
              if (!p.milestones.git_linked) {
                p.milestones.git_linked = new Date().toISOString().split('T')[0]!
              }
              setProject(action.projectName, p)
            }
            setOverlay(null)
            refresh()
          },
        })
        return
      }

      case 'close':
        break
    }

    setOverlay(null)
    refresh()
  }, [registry, refresh])

  // Open context menu for the current selection
  const openMenu = useCallback(() => {
    if (!enteredPanel) return

    if (enteredPanel === 'active' && activeProject) {
      const selectables = getActiveSelectables(activeProject)
      const key = selectables[selectedIndices.active]
      if (!key) return
      const title = getMenuTitle('active', key, activeProject)
      const items = getActiveMenuItems(key, activeProject, dispatch)
      setOverlay({ type: 'menu', title, items })
    }

    if (enteredPanel === 'objectives' && activeProject) {
      const idx = selectedIndices.objectives
      // [+] add button is at the end
      if (idx === activeProject.objectives.length) {
        dispatch({ type: 'add_objective', projectName: activeProject.name })
        return
      }
      if (idx >= activeProject.objectives.length) return
      const title = `Objective: ${activeProject.objectives[idx]}`
      const items = getObjectivesMenuItems(idx, activeProject, dispatch)
      setOverlay({ type: 'menu', title, items })
    }

    if (enteredPanel === 'projects') {
      const project = projects[selectedIndices.projects]
      if (!project) return
      const isActive = project.name === registry.config.activeProject
      const title = getMenuTitle('projects', '', project)
      const items = getProjectsMenuItems(project, isActive, dispatch)
      setOverlay({ type: 'menu', title, items })
    }
  }, [enteredPanel, activeProject, projects, selectedIndices, registry, dispatch])

  // Mute state (local for display, persisted via toggleMute)
  const [muted, setMutedState] = useState(() => isMuted())

  // Main input handler — disabled when overlay is showing
  useInput((input, key) => {
    if (overlay) return

    // Toggle mute from anywhere (not in overlay)
    if (input === 'm' && !enteredPanel) {
      const nowMuted = toggleMute()
      setMutedState(nowMuted)
      if (!nowMuted) playSound('toggle')
      return
    }

    if (input === 'q' && !enteredPanel) {
      exit()
      return
    }

    if (key.escape) {
      playSound('back')
      if (enteredPanel) {
        setEnteredPanel(null)
      } else {
        exit()
      }
      return
    }

    if (key.tab) {
      playSound('navigate')
      if (enteredPanel) {
        const count = selectableCounts[enteredPanel]
        if (count > 0) {
          setSelectedIndices(prev => ({
            ...prev,
            [enteredPanel]: (prev[enteredPanel] + 1) % count,
          }))
        }
      } else {
        const currentIdx = PANEL_ORDER.indexOf(focusedPanel)
        const nextIdx = (currentIdx + 1) % PANEL_ORDER.length
        setFocusedPanel(PANEL_ORDER[nextIdx]!)
      }
      return
    }

    if (key.return) {
      playSound('enter')
      if (!enteredPanel) {
        const count = selectableCounts[focusedPanel]
        if (count > 0) {
          setEnteredPanel(focusedPanel)
          setSelectedIndices(prev => ({ ...prev, [focusedPanel]: 0 }))
        }
      } else {
        openMenu()
      }
      return
    }

    if (enteredPanel && (key.upArrow || key.downArrow)) {
      playSound('navigate')
      const count = selectableCounts[enteredPanel]
      if (count > 0) {
        setSelectedIndices(prev => {
          const current = prev[enteredPanel]
          const next = key.upArrow
            ? (current - 1 + count) % count
            : (current + 1) % count
          return { ...prev, [enteredPanel]: next }
        })
      }
      return
    }
  })

  const borderColor = (panel: PanelId) => {
    if (enteredPanel === panel) return 'cyan'
    if (!enteredPanel && focusedPanel === panel) return 'white'
    return 'gray'
  }

  const muteIndicator = muted ? ' [muted]' : ''
  const helpText = overlay
    ? ''
    : enteredPanel
      ? `↑↓/tab navigate  enter action  esc back${muteIndicator}`
      : `tab focus panel  enter open  m ${muted ? 'unmute' : 'mute'}  q quit${muteIndicator}`

  const dashboardContent = (
    <>
      <Box flexGrow={1}>
        {/* Left: Active Project */}
        <Box
          flexDirection="column"
          width="50%"
          borderStyle="round"
          borderColor={borderColor('active')}
          paddingY={1}
        >
          <Box paddingX={1} marginBottom={1}>
            <Text bold color={borderColor('active')}>Active Project</Text>
          </Box>
          <ActiveProjectPanel
            project={activeProject}
            entered={enteredPanel === 'active'}
            selectedIndex={selectedIndices.active}
          />
        </Box>

        {/* Right: Objectives + All Projects */}
        <Box flexDirection="column" width="50%">
          <Box
            flexDirection="column"
            borderStyle="round"
            borderColor={borderColor('objectives')}
            paddingY={1}
          >
            <Box paddingX={1} marginBottom={1}>
              <Text bold color={borderColor('objectives')}>Objectives</Text>
            </Box>
            <ObjectivesPanel
              project={activeProject}
              entered={enteredPanel === 'objectives'}
              selectedIndex={selectedIndices.objectives}
            />
          </Box>

          <Box
            flexDirection="column"
            borderStyle="round"
            borderColor={borderColor('projects')}
            paddingY={1}
            flexGrow={1}
          >
            <Box paddingX={1} marginBottom={1}>
              <Text bold color={borderColor('projects')}>All Projects</Text>
              <Text dimColor> ({projects.length})</Text>
            </Box>
            <AllProjectsPanel
              projects={projects}
              activeProjectName={registry.config.activeProject}
              entered={enteredPanel === 'projects'}
              selectedIndex={selectedIndices.projects}
            />
          </Box>
        </Box>
      </Box>

      {helpText && (
        <Box paddingX={2} paddingY={1} justifyContent="center">
          <Text dimColor>{helpText}</Text>
        </Box>
      )}
    </>
  )

  const overlayContent = overlay ? (
    <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1} paddingY={2}>
      <Box flexDirection="column" width={50}>
        {overlay.type === 'menu' && (
          <ContextMenu
            title={overlay.title}
            items={overlay.items}
            onClose={() => { setOverlay(null); refresh() }}
          />
        )}
        {overlay.type === 'text_input' && (
          <TextInput
            prompt={overlay.prompt}
            defaultValue={overlay.defaultValue}
            onSubmit={overlay.onSubmit}
            onCancel={() => { setOverlay(null) }}
          />
        )}
      </Box>
    </Box>
  ) : null

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray">
      <Box justifyContent="center" paddingY={1}>
        <Text bold color="cyan"> pina </Text>
        <Text dimColor>— project dashboard</Text>
      </Box>

      {overlayContent ?? dashboardContent}
    </Box>
  )
}
