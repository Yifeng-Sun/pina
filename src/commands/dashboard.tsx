import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { execSync } from 'node:child_process'
import { Text, Box, useInput, useApp } from 'ink'
import {
  loadRegistry,
  setProject,
  removeProject,
  renameProject,
  setActiveProject,
} from '../lib/config.js'
import { getCurrentBranch, isDirty, getUpstreamStatus, getRemoteBrowserUrl, getRemoteUrl } from '../lib/git.js'
import { updateSymlink } from '../lib/symlink.js'
import { StatusBadge } from '../components/StatusBadge.js'
import { ContextMenu } from '../components/ContextMenu.js'
import { TextInput } from '../components/TextInput.js'
import { getMilestoneLabel } from '../types.js'
import { playSound, toggleMute, isMuted, cycleSoundProfile, getSoundProfile } from '../lib/sound.js'
import type { Project, Stage, PinaRegistry, SoundProfile } from '../types.js'
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
  | { type: 'error'; message: string }
  | { type: 'timeline'; milestones: [string, string][] }
  | { type: 'hidden_objectives'; projectName: string }
  | null

const PANEL_ORDER: PanelId[] = ['active', 'objectives', 'projects']

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
  if (getCurrentBranch(project.path)) items.push('branch')
  if (getRemoteUrl(project.path)) items.push('remote')
  if (project.tags.length > 0) items.push('tags')
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

      {branch && (
        <Text inverse={hi('branch')}>
          <Text dimColor>Branch   </Text>
          <Text color="cyan">{branch}</Text>
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

function FocusedObjectiveText({ text }: { text: string }) {
  const [colorIdx, setColorIdx] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setColorIdx(i => (i + 1) % GOLDEN_COLORS.length), 200)
    return () => clearInterval(timer)
  }, [])
  return <Text color={GOLDEN_COLORS[colorIdx]}>★ {text}</Text>
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
  const allObjectives = project?.objectives ?? []
  const visible = allObjectives.filter(o => !o.hidden)
  const hiddenCount = allObjectives.filter(o => o.hidden).length
  // Sort: focused first, then rest
  const sorted = [...visible].sort((a, b) => (a.focused === b.focused ? 0 : a.focused ? -1 : 1))
  const addIndex = sorted.length // [+] is after visible objectives
  const hiddenIndex = sorted.length + 1 // hidden toggle is after [+]
  const isAddSelected = entered && selectedIndex === addIndex
  const isHiddenSelected = entered && selectedIndex === hiddenIndex

  return (
    <Box flexDirection="column" paddingX={1}>
      {sorted.length === 0 && hiddenCount === 0 && (
        <Text dimColor>No objectives set.</Text>
      )}
      {sorted.map((obj, i) => {
        const isSelected = entered && selectedIndex === i
        return (
          <Box key={`obj-${i}`}>
            <Text inverse={isSelected}>
              <Text dimColor>{`${i + 1}. `}</Text>
              {obj.focused ? <FocusedObjectiveText text={obj.text} /> : <Text>{obj.text}</Text>}
            </Text>
          </Box>
        )
      })}
      <Text> </Text>
      <Text inverse={isAddSelected} color="green">
        {'  [+] Add objective'}
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
            {project.tags.length > 0 && (
              <Text dimColor>{project.tags.join(', ')}</Text>
            )}
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

  const selectableCounts = useMemo<Record<PanelId, number>>(() => ({
    active: getActiveSelectables(activeProject).length,
    objectives: activeProject ? (() => {
      const visible = activeProject.objectives.filter(o => !o.hidden).length
      const hasHidden = activeProject.objectives.some(o => o.hidden)
      return visible + 1 + (hasHidden ? 1 : 0) // visible + [+] + optional [hidden]
    })() : 0,
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
              project.objectives.push({ text, hidden: false, focused: false })
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

      case 'delete_objective': {
        const project = registry.projects[action.projectName]
        if (!project) break
        project.objectives.splice(action.objectiveIndex, 1)
        setProject(action.projectName, project)
        playSound('completion')
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
        const focusedObj = project.objectives.find(o => o.focused && !o.hidden)
        const firstVisible = project.objectives.find(o => !o.hidden)
        const defaultMsg = focusedObj ? `work on ${focusedObj.text}` : firstVisible ? `work on ${firstVisible.text}` : 'update'
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
        const focusedObj = project.objectives.find(o => o.focused && !o.hidden)
        const firstVisible = project.objectives.find(o => !o.hidden)
        const defaultMsg = focusedObj ? `work on ${focusedObj.text}` : firstVisible ? `work on ${firstVisible.text}` : 'update'
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
        const focusedObj = project.objectives.find(o => o.focused && !o.hidden)
        const firstVisible = project.objectives.find(o => !o.hidden)
        const defaultMsg = focusedObj ? `work on ${focusedObj.text}` : firstVisible ? `work on ${firstVisible.text}` : 'update'
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

      case 'git_checkout': {
        const project = registry.projects[action.projectName]
        if (!project) break
        try {
          execSync(`git checkout "${action.branch}"`, { cwd: project.path, stdio: 'pipe' })
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
      const visible = activeProject.objectives.filter(o => !o.hidden)
      const sorted = [...visible].sort((a, b) => (a.focused === b.focused ? 0 : a.focused ? -1 : 1))
      const hiddenCount = activeProject.objectives.filter(o => o.hidden).length
      const idx = selectedIndices.objectives
      const addIndex = sorted.length
      const hiddenIndex = sorted.length + 1

      if (idx === addIndex) {
        dispatch({ type: 'add_objective', projectName: activeProject.name })
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
