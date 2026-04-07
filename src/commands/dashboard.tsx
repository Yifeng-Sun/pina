import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { execSync } from 'node:child_process'
import { Text, Box, useInput, useApp } from 'ink'
import {
  loadRegistry,
  setProject,
  removeProject,
  renameProject,
  setActiveProject,
} from '../lib/config.js'
import { getCurrentBranch, isDirty, getUpstreamStatus, getRemoteBrowserUrl, getRemoteUrl, isGitRepo } from '../lib/git.js'
import { updateSymlink } from '../lib/symlink.js'
import { StatusBadge } from '../components/StatusBadge.js'
import { ContextMenu } from '../components/ContextMenu.js'
import { TextInput } from '../components/TextInput.js'
import {
  listAgents,
  listSkills,
  writeAsset,
  createAsset,
  deleteAsset,
  type Scope,
  type Asset,
} from '../lib/claudeAssets.js'
import { getMilestoneLabel } from '../types.js'
import { playSound, toggleMute, isMuted, cycleSoundProfile, getSoundProfile } from '../lib/sound.js'
import type { Project, Stage, PinaRegistry, SoundProfile } from '../types.js'
import type { MenuItem } from '../components/ContextMenu.js'
import {
  getMenuTitle,
  getActiveMenuItems,
  getObjectivesMenuItems,
  getProjectsMenuItems,
  getAssetDetailTitle,
  getAssetDetailMenuItems,
  type MenuAction,
} from '../lib/menus.js'

type PanelId = 'active' | 'objectives' | 'projects'
type OverlayMode =
  | { type: 'menu'; title: string; items: MenuItem[] }
  | { type: 'text_input'; prompt: string; defaultValue?: string; multiline?: boolean; onSubmit: (value: string) => void }
  | { type: 'error'; message: string }
  | { type: 'timeline'; milestones: [string, string][] }
  | { type: 'hidden_objectives'; projectName: string }
  | { type: 'completed_objectives'; projectName: string }
  | null

const PANEL_ORDER: PanelId[] = ['active', 'objectives', 'projects']
const RAINBOW_COLORS = ['red', 'magenta', 'yellow', 'green', 'cyan', 'blue']
const COMPLETED_GLOW_DURATION = 4000
const NEW_OBJECTIVE_GLOW_DURATION = 3500

function detectTerminalApp(): string {
  const termProgram = process.env.TERM_PROGRAM ?? ''
  switch (termProgram) {
    case 'ghostty': return 'Ghostty'
    case 'iTerm.app': return 'iTerm'
    case 'WarpTerminal': return 'Warp'
    case 'Apple_Terminal': return 'Terminal'
    case 'kitty': return 'kitty'
    case 'Hyper': return 'Hyper'
    case 'Alacritty': return 'Alacritty'
    default: return 'Terminal'
  }
}

function openTerminalTab(app: string, dir: string): void {
  const escaped = dir.replace(/"/g, '\\"')
  switch (app) {
    case 'iTerm':
      execSync(`osascript -e 'tell application "iTerm2" to tell current window to create tab with default profile command "cd \\"${escaped}\\" && exec $SHELL"'`, { stdio: 'pipe' })
      break
    case 'Apple_Terminal':
    case 'Terminal':
      execSync(`osascript -e 'tell application "Terminal" to do script "cd \\"${escaped}\\""'`, { stdio: 'pipe' })
      break
    default:
      execSync(`open -a "${app}" "${escaped}"`, { stdio: 'pipe' })
  }
}

function formatMilestoneDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
}

function getActiveSelectables(project: Project | undefined): string[] {
  if (!project) return []
  const items: string[] = ['name', 'path']
  if (isGitRepo(project.path)) items.push('branch')
  if (getRemoteUrl(project.path)) items.push('remote')
  if (project.tags.length > 0) items.push('tags')
  items.push('subagents')
  items.push('skills')
  for (const note of project.notes.slice(-3)) {
    items.push(`note:${note}`)
  }
  if (Object.keys(project.milestones).length > 0) items.push('milestones')
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
  const upstream = getUpstreamStatus(project.path)
  const remoteUrl = getRemoteUrl(project.path)
  const inGitRepo = isGitRepo(project.path)
  const selectables = getActiveSelectables(project)
  const hi = (key: string) => entered && selectables[selectedIndex] === key

  const notes = project.notes.slice(-3)
  const allMilestones = Object.entries(project.milestones).sort((a, b) => b[1].localeCompare(a[1]))
  const recentMilestones = allMilestones.slice(0, 2)

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box gap={2}>
        <Text bold color="green" inverse={hi('name')}>{project.name}</Text>
        <StatusBadge stage={project.stage} stale={project.stale} status={project.status} />
      </Box>

      <Text dimColor inverse={hi('path')}>{project.path}</Text>
      <Text> </Text>

      {inGitRepo && (
        <Text inverse={hi('branch')}>
          <Text dimColor>Branch   </Text>
          {branch
            ? <Text color="cyan">{branch}</Text>
            : <Text color="yellow">detached HEAD</Text>}
          {dirty ? <Text color="yellow"> (dirty)</Text> : ''}
        </Text>
      )}
      {remoteUrl && (
        <Text inverse={hi('remote')}>
          <Text dimColor>Remote   </Text>
          {upstream ? (
            <>
              <Text color={upstream.ahead > 0 || upstream.behind > 0 ? 'yellow' : 'green'}>
                {upstream.ahead === 0 && upstream.behind === 0
                  ? 'up to date'
                  : `${upstream.ahead > 0 ? `${upstream.ahead} ahead` : ''}${upstream.ahead > 0 && upstream.behind > 0 ? ', ' : ''}${upstream.behind > 0 ? `${upstream.behind} behind` : ''}`
                }
              </Text>
              <Text dimColor> ({upstream.tracking})</Text>
            </>
          ) : (
            <Text dimColor>not tracking</Text>
          )}
        </Text>
      )}
      {project.tags.length > 0 && (
        <Text inverse={hi('tags')}>
          <Text dimColor>Tags     </Text>
          <Text>{project.tags.join(', ')}</Text>
        </Text>
      )}
      {(() => {
        const agents = listAgents(project.path)
        const skills = listSkills(project.path)
        const agentProj = agents.filter(a => a.scope === 'project').length
        const agentPers = agents.filter(a => a.scope === 'personal' && !a.shadowedBy).length
        const skillProj = skills.filter(s => s.scope === 'project').length
        const skillPers = skills.filter(s => s.scope === 'personal' && !s.shadowedBy).length
        return (
          <>
            <Text inverse={hi('subagents')}>
              <Text dimColor>Agents   </Text>
              <Text>{agentPers} personal · {agentProj} project</Text>
            </Text>
            <Text inverse={hi('skills')}>
              <Text dimColor>Skills   </Text>
              <Text>{skillPers} personal · {skillProj} project</Text>
            </Text>
          </>
        )
      })()}

      {notes.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold dimColor>Recent Notes</Text>
          {notes.map((note, i) => (
            <Text key={`note-${i}`} dimColor inverse={hi(`note:${note}`)}>  {note}</Text>
          ))}
        </Box>
      )}

      {recentMilestones.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold dimColor inverse={hi('milestones')}>Milestones</Text>
          {recentMilestones.map(([key, date]) => (
            <Text key={`ms-${key}`} dimColor inverse={hi('milestones')}>
              {'  '}{getMilestoneLabel(key)} <Text italic>{formatMilestoneDate(date)}</Text>
            </Text>
          ))}
        </Box>
      )}
    </Box>
  )
}

const GOLDEN_COLORS = ['#FFD700', '#FFC125', '#FFB90F', '#EEAD0E', '#CDAD00', '#EEAD0E', '#FFB90F', '#FFC125'] as const

function useFocusedObjectiveColor() {
  const [colorIdx, setColorIdx] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setColorIdx(i => (i + 1) % GOLDEN_COLORS.length), 200)
    return () => clearInterval(timer)
  }, [])
  return GOLDEN_COLORS[colorIdx]
}

function ObjectivesPanel({
  project,
  entered,
  selectedIndex,
  completedHighlightColor,
  newObjectiveHighlightId,
  newObjectivePulse,
}: {
  project: Project | undefined
  entered: boolean
  selectedIndex: number
  completedHighlightColor?: string
  newObjectiveHighlightId?: string
  newObjectivePulse?: boolean
}) {
  const allObjectives = project?.objectives ?? []
  const visible = allObjectives.filter(o => !o.hidden && !o.completed)
  const hiddenCount = allObjectives.filter(o => o.hidden).length
  const completedCount = allObjectives.filter(o => o.completed).length
  // Sort: focused first, then rest
  const sorted = [...visible].sort((a, b) => (a.focused === b.focused ? 0 : a.focused ? -1 : 1))
  const addIndex = sorted.length // [+] is after visible objectives
  const completedIndex = sorted.length + 1 // completed bucket
  const hiddenIndex = completedIndex + 1 // optional hidden bucket
  const focusedColor = useFocusedObjectiveColor()
  const isAddSelected = entered && selectedIndex === addIndex
  const isCompletedSelected = entered && selectedIndex === completedIndex
  const isHiddenSelected = entered && selectedIndex === hiddenIndex

  return (
    <Box flexDirection="column" paddingX={1}>
      {sorted.length === 0 && hiddenCount === 0 && completedCount === 0 && (
        <Text dimColor>No objectives set.</Text>
      )}
      {sorted.map((obj, i) => {
        const isSelected = entered && selectedIndex === i
        const objectiveId = obj.createdAt ?? `${obj.text}-${i}`
        const isNewlyAdded = newObjectiveHighlightId && objectiveId === newObjectiveHighlightId
        const color = isNewlyAdded ? (newObjectivePulse ? 'magenta' : 'green') : undefined
        return (
          <Box key={`obj-${i}`}>
            <Text inverse={isSelected} color={obj.focused ? focusedColor : color}>
              {`${i + 1}. ${obj.focused ? '★ ' : ''}${obj.text}`}
            </Text>
          </Box>
        )
      })}
      <Text> </Text>
      <Text inverse={isAddSelected} color="green">
        {'  [+] Add objective'}
      </Text>
      <Text
        inverse={isCompletedSelected}
        color={completedHighlightColor ?? (completedCount > 0 ? 'cyan' : undefined)}
        dimColor={!completedHighlightColor && completedCount === 0}
      >
        {'  '}
        {`Completed objectives(${completedCount})`}
      </Text>
      {hiddenCount > 0 && (
        <Text inverse={isHiddenSelected} dimColor>
          {'  '}{`[${hiddenCount} hidden]`}
        </Text>
      )}
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
          </Box>
        )
      })}
    </Box>
  )
}

function TimelineOverlay({ milestones, onClose }: { milestones: [string, string][]; onClose: () => void }) {
  useInput((input, key) => {
    if (key.escape || key.return) {
      onClose()
    }
  })

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
    >
      <Text bold color="cyan">Milestone Timeline</Text>
      <Text> </Text>
      {milestones.map(([key, date], i) => {
        const label = getMilestoneLabel(key)
        const isLast = i === milestones.length - 1
        return (
          <Box key={key} flexDirection="column">
            <Box>
              <Text color="cyan">  ● </Text>
              <Text bold>{label}</Text>
              <Text dimColor>  {formatMilestoneDate(date)}</Text>
            </Box>
            {!isLast && <Text color="cyan">  │</Text>}
          </Box>
        )
      })}
      <Text> </Text>
      <Text dimColor>enter/esc dismiss</Text>
    </Box>
  )
}

function HiddenObjectivesOverlay({
  project,
  onUnhide,
  onClose,
}: {
  project: Project
  onUnhide: (realIndex: number) => void
  onClose: () => void
}) {
  const hidden = project.objectives
    .map((obj, i) => ({ obj, realIndex: i }))
    .filter(({ obj }) => obj.hidden)
  const [selected, setSelected] = useState(0)

  useInput((input, key) => {
    if (key.escape) { onClose(); return }
    if (key.upArrow && selected > 0) { setSelected(selected - 1); playSound('navigate', selected - 1) }
    if (key.downArrow && selected < hidden.length - 1) { setSelected(selected + 1); playSound('navigate', selected + 1) }
    if (key.return && hidden.length > 0) {
      onUnhide(hidden[selected]!.realIndex)
    }
  })

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={2} paddingY={1}>
      <Text bold color="yellow">Hidden Objectives</Text>
      <Text> </Text>
      {hidden.length === 0 && <Text dimColor>No hidden objectives.</Text>}
      {hidden.map(({ obj, realIndex }, i) => (
        <Text key={realIndex} inverse={selected === i}>
          {`  ${obj.text}`}
        </Text>
      ))}
      <Text> </Text>
      <Text dimColor>enter unhide  esc back</Text>
    </Box>
  )
}

function CompletedObjectivesOverlay({
  project,
  onRelist,
  onClose,
}: {
  project: Project
  onRelist: (realIndex: number) => void
  onClose: () => void
}) {
  const completed = project.objectives
    .map((obj, i) => ({ obj, realIndex: i }))
    .filter(({ obj }) => obj.completed)
  const [selected, setSelected] = useState(0)

  useInput((input, key) => {
    if (key.escape) { onClose(); return }
    if (key.upArrow && selected > 0) { setSelected(selected - 1); playSound('navigate', selected - 1) }
    if (key.downArrow && selected < completed.length - 1) { setSelected(selected + 1); playSound('navigate', selected + 1) }
    if (key.return && completed.length > 0) {
      onRelist(completed[selected]!.realIndex)
    }
  })

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={2} paddingY={1}>
      <Text bold color="green">Completed Objectives</Text>
      <Text> </Text>
      {completed.length === 0 && <Text dimColor>No completed objectives.</Text>}
      {completed.map(({ obj, realIndex }, i) => (
        <Text key={realIndex} inverse={selected === i}>
          {`  ${obj.text}`}
        </Text>
      ))}
      <Text> </Text>
      <Text dimColor>enter re-list  esc back</Text>
    </Box>
  )
}

function ErrorOverlay({ message, onClose }: { message: string; onClose: () => void }) {
  useInput((input, key) => {
    if (key.escape || key.return) {
      onClose()
    }
  })

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="red"
      paddingX={1}
    >
      <Text bold color="red">Error</Text>
      <Text> </Text>
      <Text>{message}</Text>
      <Text> </Text>
      <Text dimColor>enter/esc dismiss</Text>
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
  const [completedGlow, setCompletedGlow] = useState<{ project?: string; until: number }>({ project: undefined, until: 0 })
  const [rainbowIndex, setRainbowIndex] = useState(0)
  const recentlyCompletedText = useRef<string | null>(null)
  const [recentAddition, setRecentAddition] = useState<{ project: string; objectiveId: string; until: number } | null>(null)
  const [recentAdditionPulse, setRecentAdditionPulse] = useState(false)

  useEffect(() => {
    if (!completedGlow.project) return
    const remaining = completedGlow.until - Date.now()
    if (remaining <= 0) {
      setCompletedGlow({ project: undefined, until: 0 })
      return
    }
    const interval = setInterval(() => setRainbowIndex(i => i + 1), 120)
    const timeout = setTimeout(() => setCompletedGlow({ project: undefined, until: 0 }), remaining)
    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [completedGlow])

  useEffect(() => {
    if (!recentAddition) {
      setRecentAdditionPulse(false)
      return
    }
    const remaining = recentAddition.until - Date.now()
    if (remaining <= 0) {
      setRecentAddition(null)
      setRecentAdditionPulse(false)
      return
    }
    const interval = setInterval(() => setRecentAdditionPulse(p => !p), 200)
    const timeout = setTimeout(() => {
      setRecentAddition(null)
      setRecentAdditionPulse(false)
    }, remaining)
    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [recentAddition])

  const selectableCounts = useMemo<Record<PanelId, number>>(() => ({
    active: getActiveSelectables(activeProject).length,
    objectives: activeProject ? (() => {
      const visible = activeProject.objectives.filter(o => !o.hidden && !o.completed).length
      const hasHidden = activeProject.objectives.some(o => o.hidden)
      return visible + 1 + 1 + (hasHidden ? 1 : 0) // visible + [+] + [completed] + optional [hidden]
    })() : 0,
    projects: projects.length,
  }), [activeProject, projects])

  const completedHighlightColor = activeProject && completedGlow.project === activeProject.name
    ? RAINBOW_COLORS[rainbowIndex % RAINBOW_COLORS.length]
    : undefined
  const newObjectiveHighlightId = activeProject && recentAddition && recentAddition.project === activeProject.name
    ? recentAddition.objectiveId
    : undefined

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
        const now = new Date().toISOString()
        const stageKey = `stage:${action.stage}:${Date.now()}`
        project.milestones[stageKey] = now
        setProject(action.projectName, project)
        if (action.stage === 'complete') {
          playSound('ultra-completion')
        } else {
          playSound('success')
        }
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
        project.milestones[`stage:archived:${Date.now()}`] = new Date().toISOString()
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
        const now = new Date().toISOString()
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
              const now = new Date().toISOString()
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
              const createdAt = new Date().toISOString()
              project.objectives.push({ text, hidden: false, focused: false, completed: false, createdAt })
              setProject(action.projectName, project)
              setRecentAddition({ project: action.projectName, objectiveId: createdAt, until: Date.now() + NEW_OBJECTIVE_GLOW_DURATION })
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
        const current = project.objectives[action.objectiveIndex]?.text ?? ''
        setOverlay({
          type: 'text_input',
          prompt: 'Edit objective:',
          defaultValue: current,
          onSubmit: (text: string) => {
            const p = registry.projects[action.projectName]
            if (p && p.objectives[action.objectiveIndex]) {
              p.objectives[action.objectiveIndex].text = text
              setProject(action.projectName, p)
            }
            setOverlay(null)
            refresh()
          },
        })
        return
      }

      case 'complete_objective': {
        const project = registry.projects[action.projectName]
        if (!project) break
        const objective = project.objectives[action.objectiveIndex]
        if (!objective) break
        objective.completed = true
        objective.hidden = false
        objective.focused = false
        objective.completedAt = new Date().toISOString()
        setProject(action.projectName, project)
        recentlyCompletedText.current = objective.text
        playSound('completion')
        setCompletedGlow({ project: action.projectName, until: Date.now() + COMPLETED_GLOW_DURATION })
        if (isDirty(project.path)) {
          const openGitMenu = () => {
            const latest = loadRegistry().projects[action.projectName] ?? project
            setOverlay({
              type: 'menu',
              title: getMenuTitle('active', 'remote', latest),
              items: getActiveMenuItems('remote', latest, dispatch),
            })
          }
          setOverlay({
            type: 'menu',
            title: 'Branch has uncommitted changes',
            items: [
              { label: 'Open git menu', action: () => openGitMenu() },
              { label: 'Later', action: () => { setOverlay(null) } },
            ],
          })
          refresh()
          return
        }
        break
      }

      case 'hide_objective': {
        const project = registry.projects[action.projectName]
        if (!project || !project.objectives[action.objectiveIndex]) break
        project.objectives[action.objectiveIndex].hidden = true
        project.objectives[action.objectiveIndex].focused = false
        setProject(action.projectName, project)
        playSound('toggle')
        break
      }

      case 'unhide_objective': {
        const project = registry.projects[action.projectName]
        if (!project || !project.objectives[action.objectiveIndex]) break
        project.objectives[action.objectiveIndex].hidden = false
        setProject(action.projectName, project)
        playSound('toggle')
        break
      }

      case 'focus_objective': {
        const project = registry.projects[action.projectName]
        if (!project || !project.objectives[action.objectiveIndex]) break
        const wasFocused = project.objectives[action.objectiveIndex].focused
        // Unfocus all others
        for (const obj of project.objectives) obj.focused = false
        project.objectives[action.objectiveIndex].focused = !wasFocused
        setProject(action.projectName, project)
        playSound('toggle')
        break
      }

      case 'show_hidden_objectives': {
        setOverlay({ type: 'hidden_objectives', projectName: action.projectName })
        playSound('enter')
        return
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
                p.milestones.git_linked = new Date().toISOString()
              }
              setProject(action.projectName, p)
            }
            setOverlay(null)
            refresh()
          },
        })
        return
      }

      case 'open_folder': {
        try {
          execSync(`open "${action.projectPath}"`, { stdio: 'pipe' })
          playSound('success')
        } catch (err) {
          playSound('error')
          const msg = err instanceof Error ? err.message : String(err)
          setOverlay({ type: 'error', message: `Failed to open folder:\n${msg}` })
          return
        }
        break
      }

      case 'open_vscode': {
        try {
          execSync(`code "${action.projectPath}"`, { stdio: 'pipe' })
          playSound('success')
        } catch (err) {
          playSound('error')
          const msg = err instanceof Error ? err.message : String(err)
          setOverlay({ type: 'error', message: `Failed to open VS Code:\n${msg}` })
          return
        }
        break
      }

      case 'open_terminal_tab': {
        try {
          const termApp = detectTerminalApp()
          openTerminalTab(termApp, action.projectPath)
          playSound('success')
        } catch (err) {
          playSound('error')
          const msg = err instanceof Error ? err.message : String(err)
          setOverlay({ type: 'error', message: `Failed to open terminal tab:\n${msg}` })
          return
        }
        break
      }

      case 'git_add': {
        const project = registry.projects[action.projectName]
        if (!project) break
        try {
          execSync('git add .', { cwd: project.path, stdio: 'pipe' })
          playSound('success')
        } catch (err) {
          playSound('error')
          const msg = err instanceof Error ? err.message : String(err)
          setOverlay({ type: 'error', message: `git add failed:\n${msg}` })
          return
        }
        break
      }

      case 'git_commit': {
        const project = registry.projects[action.projectName]
        if (!project) break
        const justCompleted = recentlyCompletedText.current
        recentlyCompletedText.current = null
        const focusedObj = project.objectives.find(o => o.focused && !o.hidden && !o.completed)
        const firstVisible = project.objectives.find(o => !o.hidden && !o.completed)
        const defaultMsg = justCompleted
          ? `complete: ${justCompleted}`
          : focusedObj ? `work on ${focusedObj.text}` : firstVisible ? `work on ${firstVisible.text}` : 'update'
        setOverlay({
          type: 'text_input',
          prompt: 'Commit message:',
          defaultValue: defaultMsg,
          onSubmit: (msg: string) => {
            try {
              execSync(`git commit -m "${msg.replace(/"/g, '\\"')}"`, { cwd: project.path, stdio: 'pipe' })
              playSound('success')
            } catch (err) {
              playSound('error')
              const errMsg = err instanceof Error ? err.message : String(err)
              setOverlay({ type: 'error', message: `git commit failed:\n${errMsg}` })
              return
            }
            setOverlay(null)
            refresh()
          },
        })
        return
      }

      case 'git_push': {
        const project = registry.projects[action.projectName]
        if (!project) break
        try {
          execSync('git push', { cwd: project.path, stdio: 'pipe' })
          playSound('success')
        } catch (err) {
          playSound('error')
          const msg = err instanceof Error ? err.message : String(err)
          setOverlay({ type: 'error', message: `git push failed:\n${msg}` })
          return
        }
        break
      }

      case 'git_add_commit': {
        const project = registry.projects[action.projectName]
        if (!project) break
        const justCompleted = recentlyCompletedText.current
        recentlyCompletedText.current = null
        const focusedObj = project.objectives.find(o => o.focused && !o.hidden && !o.completed)
        const firstVisible = project.objectives.find(o => !o.hidden && !o.completed)
        const defaultMsg = justCompleted
          ? `complete: ${justCompleted}`
          : focusedObj ? `work on ${focusedObj.text}` : firstVisible ? `work on ${firstVisible.text}` : 'update'
        setOverlay({
          type: 'text_input',
          prompt: 'Commit message:',
          defaultValue: defaultMsg,
          onSubmit: (msg: string) => {
            try {
              execSync('git add .', { cwd: project.path, stdio: 'pipe' })
              execSync(`git commit -m "${msg.replace(/"/g, '\\"')}"`, { cwd: project.path, stdio: 'pipe' })
              playSound('success')
            } catch (err) {
              playSound('error')
              const errMsg = err instanceof Error ? err.message : String(err)
              setOverlay({ type: 'error', message: `git add+commit failed:\n${errMsg}` })
              return
            }
            setOverlay(null)
            refresh()
          },
        })
        return
      }

      case 'git_add_commit_push': {
        const project = registry.projects[action.projectName]
        if (!project) break
        const justCompleted = recentlyCompletedText.current
        recentlyCompletedText.current = null
        const focusedObj = project.objectives.find(o => o.focused && !o.hidden && !o.completed)
        const firstVisible = project.objectives.find(o => !o.hidden && !o.completed)
        const defaultMsg = justCompleted
          ? `complete: ${justCompleted}`
          : focusedObj ? `work on ${focusedObj.text}` : firstVisible ? `work on ${firstVisible.text}` : 'update'
        setOverlay({
          type: 'text_input',
          prompt: 'Commit message:',
          defaultValue: defaultMsg,
          onSubmit: (msg: string) => {
            try {
              execSync('git add .', { cwd: project.path, stdio: 'pipe' })
              execSync(`git commit -m "${msg.replace(/"/g, '\\"')}"`, { cwd: project.path, stdio: 'pipe' })
              execSync('git push', { cwd: project.path, stdio: 'pipe' })
              playSound('success')
            } catch (err) {
              playSound('error')
              const errMsg = err instanceof Error ? err.message : String(err)
              setOverlay({ type: 'error', message: `git add+commit+push failed:\n${errMsg}` })
              return
            }
            setOverlay(null)
            refresh()
          },
        })
        return
      }

      case 'open_remote_browser': {
        const project = registry.projects[action.projectName]
        if (!project) break
        const browserUrl = getRemoteBrowserUrl(project.path)
        if (!browserUrl) {
          playSound('error')
          setOverlay({ type: 'error', message: 'No remote URL found for this project.' })
          return
        }
        try {
          execSync(`open "${browserUrl}"`, { stdio: 'pipe' })
          playSound('success')
        } catch (err) {
          playSound('error')
          const errMsg = err instanceof Error ? err.message : String(err)
          setOverlay({ type: 'error', message: `Failed to open browser:\n${errMsg}` })
          return
        }
        break
      }

      case 'git_pull': {
        const project = registry.projects[action.projectName]
        if (!project) break
        try {
          execSync('git pull', { cwd: project.path, stdio: 'pipe' })
          playSound('success')
        } catch (err) {
          playSound('error')
          const errMsg = err instanceof Error ? err.message : String(err)
          setOverlay({ type: 'error', message: `git pull failed:\n${errMsg}` })
          return
        }
        break
      }

      case 'git_fetch': {
        const project = registry.projects[action.projectName]
        if (!project) break
        try {
          execSync('git fetch', { cwd: project.path, stdio: 'pipe' })
          playSound('success')
        } catch (err) {
          playSound('error')
          const errMsg = err instanceof Error ? err.message : String(err)
          setOverlay({ type: 'error', message: `git fetch failed:\n${errMsg}` })
          return
        }
        break
      }

      case 'git_refresh_branches': {
        const project = registry.projects[action.projectName]
        if (!project) break
        try {
          execSync('git fetch --all --prune', { cwd: project.path, stdio: 'pipe' })
          playSound('success')
        } catch (err) {
          playSound('error')
          const errMsg = err instanceof Error ? err.message : String(err)
          setOverlay({ type: 'error', message: `Failed to refresh branches:\n${errMsg}` })
          return
        }
        break
      }

      case 'git_checkout': {
        const project = registry.projects[action.projectName]
        if (!project) break
        try {
          const escapedBranch = action.branch.replace(/"/g, '\\"')
          const command = action.trackRemote
            ? `git checkout --track "${escapedBranch}"`
            : `git checkout "${escapedBranch}"`
          execSync(command, { cwd: project.path, stdio: 'pipe' })
          playSound('success')
        } catch (err) {
          playSound('error')
          const errMsg = err instanceof Error ? err.message : String(err)
          setOverlay({ type: 'error', message: `git checkout failed:\n${errMsg}` })
          return
        }
        break
      }

      case 'show_milestones': {
        const project = registry.projects[action.projectName]
        if (!project) break
        const sorted = Object.entries(project.milestones)
          .sort((a, b) => a[1].localeCompare(b[1])) as [string, string][]
        setOverlay({ type: 'timeline', milestones: sorted })
        playSound('enter')
        return
      }

      case 'open_agent_detail':
      case 'open_skill_detail': {
        const isAgent = action.type === 'open_agent_detail'
        const projectPath = activeProject?.path
        const list = isAgent ? listAgents(projectPath) : listSkills(projectPath)
        const asset = list.find(a => a.scope === action.scope && a.name === action.name)
        if (!asset) break
        setOverlay({
          type: 'menu',
          title: getAssetDetailTitle(asset),
          items: getAssetDetailMenuItems(asset, dispatch),
        })
        return
      }

      case 'edit_agent_prompt':
      case 'edit_skill_prompt': {
        const isAgent = action.type === 'edit_agent_prompt'
        const projectPath = activeProject?.path
        const list = isAgent ? listAgents(projectPath) : listSkills(projectPath)
        const asset = list.find(a => a.scope === action.scope && a.name === action.name)
        if (!asset) break
        setOverlay({
          type: 'text_input',
          prompt: `Edit ${isAgent ? 'sub-agent' : 'skill'} '${asset.name}' prompt (${asset.scope}):`,
          defaultValue: asset.body,
          multiline: true,
          onSubmit: (text: string) => {
            writeAsset(asset, { body: text })
            setOverlay(null)
            refresh()
          },
        })
        return
      }

      case 'edit_agent_description':
      case 'edit_skill_description': {
        const isAgent = action.type === 'edit_agent_description'
        const projectPath = activeProject?.path
        const list = isAgent ? listAgents(projectPath) : listSkills(projectPath)
        const asset = list.find(a => a.scope === action.scope && a.name === action.name)
        if (!asset) break
        setOverlay({
          type: 'text_input',
          prompt: `Edit '${asset.name}' description (${asset.scope}):`,
          defaultValue: asset.description,
          onSubmit: (text: string) => {
            writeAsset(asset, { description: text })
            setOverlay(null)
            refresh()
          },
        })
        return
      }

      case 'new_agent':
      case 'new_skill': {
        const isAgent = action.type === 'new_agent'
        if (action.scope === 'project' && !activeProject) {
          setOverlay({ type: 'error', message: 'No active project for project-scope asset.' })
          return
        }
        const kind: 'agent' | 'skill' = isAgent ? 'agent' : 'skill'
        setOverlay({
          type: 'text_input',
          prompt: `New ${isAgent ? 'sub-agent' : 'skill'} name (${action.scope}):`,
          onSubmit: (name: string) => {
            const cleanName = name.trim().replace(/\s+/g, '-')
            if (!cleanName) { setOverlay(null); return }
            setOverlay({
              type: 'text_input',
              prompt: `Description for '${cleanName}':`,
              onSubmit: (description: string) => {
                setOverlay({
                  type: 'text_input',
                  prompt: `Prompt body for '${cleanName}':`,
                  multiline: true,
                  onSubmit: (body: string) => {
                    try {
                      createAsset({
                        kind,
                        scope: action.scope,
                        name: cleanName,
                        description,
                        body,
                        projectPath: activeProject?.path,
                      })
                      playSound('success')
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : String(err)
                      setOverlay({ type: 'error', message: `Create failed:\n${msg}` })
                      return
                    }
                    setOverlay(null)
                    refresh()
                  },
                })
              },
            })
          },
        })
        return
      }

      case 'delete_agent':
      case 'delete_skill': {
        const isAgent = action.type === 'delete_agent'
        const projectPath = activeProject?.path
        const list = isAgent ? listAgents(projectPath) : listSkills(projectPath)
        const asset = list.find(a => a.scope === action.scope && a.name === action.name)
        if (!asset) break
        try {
          deleteAsset(asset)
          playSound('delete')
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          setOverlay({ type: 'error', message: `Delete failed:\n${msg}` })
          return
        }
        break
      }

      case 'close':
        break
    }

    setOverlay(null)
    refresh()
  }, [registry, refresh, setCompletedGlow, setRecentAddition, activeProject])

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
      const visible = activeProject.objectives.filter(o => !o.hidden && !o.completed)
      const sorted = [...visible].sort((a, b) => (a.focused === b.focused ? 0 : a.focused ? -1 : 1))
      const hiddenCount = activeProject.objectives.filter(o => o.hidden).length
      const idx = selectedIndices.objectives
      const addIndex = sorted.length
      const completedIndex = sorted.length + 1
      const hiddenIndex = completedIndex + 1

      if (idx === addIndex) {
        dispatch({ type: 'add_objective', projectName: activeProject.name })
        return
      }
      if (idx === completedIndex) {
        setOverlay({ type: 'completed_objectives', projectName: activeProject.name })
        return
      }
      if (hiddenCount > 0 && idx === hiddenIndex) {
        dispatch({ type: 'show_hidden_objectives', projectName: activeProject.name })
        return
      }
      if (idx >= sorted.length) return
      // Map sorted visible index back to real index
      const obj = sorted[idx]!
      const realIndex = activeProject.objectives.indexOf(obj)
      const title = `Objective: ${obj.text}`
      const items = getObjectivesMenuItems(realIndex, activeProject, dispatch)
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
  const [soundProfile, setSoundProfileState] = useState<SoundProfile>(() => getSoundProfile())

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

    // Cycle sound profile
    if (input === 's' && !enteredPanel) {
      const next = cycleSoundProfile()
      setSoundProfileState(next)
      playSound('enter')
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
      if (enteredPanel) {
        const count = selectableCounts[enteredPanel]
        if (count > 0) {
          const nextIdx = (selectedIndices[enteredPanel] + 1) % count
          playSound('navigate', nextIdx)
          setSelectedIndices(prev => ({
            ...prev,
            [enteredPanel]: nextIdx,
          }))
        }
      } else {
        const currentIdx = PANEL_ORDER.indexOf(focusedPanel)
        const nextIdx = (currentIdx + 1) % PANEL_ORDER.length
        playSound('navigate', nextIdx)
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
      const count = selectableCounts[enteredPanel]
      if (count > 0) {
        setSelectedIndices(prev => {
          const current = prev[enteredPanel]
          const next = key.upArrow
            ? (current - 1 + count) % count
            : (current + 1) % count
          playSound('navigate', next)
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
  const profileIndicator = ` [${soundProfile}]`
  const helpText = overlay
    ? ''
    : enteredPanel
      ? `↑↓/tab navigate  enter action  esc back${profileIndicator}${muteIndicator}`
      : `tab panel  enter open  s sound${profileIndicator}  m ${muted ? 'unmute' : 'mute'}  q quit`

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
              completedHighlightColor={completedHighlightColor}
              newObjectiveHighlightId={newObjectiveHighlightId}
              newObjectivePulse={!!newObjectiveHighlightId && recentAdditionPulse}
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
            multiline={overlay.multiline}
            onSubmit={overlay.onSubmit}
            onCancel={() => { setOverlay(null) }}
          />
        )}
        {overlay.type === 'error' && (
          <ErrorOverlay
            message={overlay.message}
            onClose={() => { setOverlay(null) }}
          />
        )}
        {overlay.type === 'timeline' && (
          <TimelineOverlay
            milestones={overlay.milestones}
            onClose={() => { setOverlay(null) }}
          />
        )}
        {overlay.type === 'hidden_objectives' && registry.projects[overlay.projectName] && (
          <HiddenObjectivesOverlay
            project={registry.projects[overlay.projectName]!}
            onUnhide={(realIndex) => {
              const project = registry.projects[overlay.projectName]
              if (project && project.objectives[realIndex]) {
                project.objectives[realIndex].hidden = false
                setProject(overlay.projectName, project)
                playSound('toggle')
                refresh()
                // If no more hidden, close overlay
                if (!project.objectives.some(o => o.hidden)) {
                  setOverlay(null)
                }
              }
            }}
            onClose={() => { setOverlay(null) }}
          />
        )}
        {overlay.type === 'completed_objectives' && registry.projects[overlay.projectName] && (
          <CompletedObjectivesOverlay
            project={registry.projects[overlay.projectName]!}
            onRelist={(realIndex) => {
              const project = registry.projects[overlay.projectName]
              const objective = project?.objectives[realIndex]
              if (project && objective) {
                objective.completed = false
                objective.hidden = false
                objective.focused = false
                if (!objective.createdAt) {
                  objective.createdAt = new Date().toISOString()
                }
                setProject(overlay.projectName, project)
                setRecentAddition({
                  project: overlay.projectName,
                  objectiveId: objective.createdAt,
                  until: Date.now() + NEW_OBJECTIVE_GLOW_DURATION,
                })
                playSound('toggle')
                refresh()
                if (!project.objectives.some(o => o.completed)) {
                  setOverlay(null)
                }
              }
            }}
            onClose={() => { setOverlay(null) }}
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
