import React, { useState, useMemo } from 'react'
import { Text, Box, useInput, useApp } from 'ink'
import { loadRegistry } from '../lib/config.js'
import { getCurrentBranch, isDirty, getCommitCount } from '../lib/git.js'
import { StatusBadge } from '../components/StatusBadge.js'
import { MILESTONE_LABELS } from '../types.js'
import type { Project, MilestoneKey } from '../types.js'

type PanelId = 'active' | 'objectives' | 'projects'

const PANEL_ORDER: PanelId[] = ['active', 'objectives', 'projects']

// Selectables for the active project panel
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
  focused,
  entered,
  selectedIndex,
}: {
  project: Project | undefined
  focused: boolean
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
            <Text key={i} dimColor inverse={hi(`note:${note}`)}>  {note}</Text>
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
  focused,
  entered,
  selectedIndex,
}: {
  project: Project | undefined
  focused: boolean
  entered: boolean
  selectedIndex: number
}) {
  if (!project || project.objectives.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text dimColor>No objectives set.</Text>
        <Text dimColor>Run `pina objective "goal"` to add one.</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {project.objectives.map((obj, i) => {
        const isSelected = entered && selectedIndex === i
        return (
          <Text key={i} inverse={isSelected}>
            <Text dimColor>{`${i + 1}. `}</Text>
            <Text>{obj}</Text>
          </Text>
        )
      })}
    </Box>
  )
}

function AllProjectsPanel({
  projects,
  activeProjectName,
  focused,
  entered,
  selectedIndex,
}: {
  projects: Project[]
  activeProjectName?: string
  focused: boolean
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
  const registry = loadRegistry()
  const projects = useMemo(() => Object.values(registry.projects), [])
  const activeProject = registry.config.activeProject
    ? registry.projects[registry.config.activeProject]
    : undefined

  // Panel focus state
  const [focusedPanel, setFocusedPanel] = useState<PanelId>('active')
  const [enteredPanel, setEnteredPanel] = useState<PanelId | null>(null)
  const [selectedIndices, setSelectedIndices] = useState<Record<PanelId, number>>({
    active: 0,
    objectives: 0,
    projects: 0,
  })

  // Count selectables per panel
  const selectableCounts = useMemo<Record<PanelId, number>>(() => ({
    active: getActiveSelectables(activeProject).length,
    objectives: activeProject?.objectives.length ?? 0,
    projects: projects.length,
  }), [activeProject, projects])

  useInput((input, key) => {
    // Quit
    if (input === 'q' && !enteredPanel) {
      exit()
      return
    }

    // Escape exits the current panel
    if (key.escape) {
      if (enteredPanel) {
        setEnteredPanel(null)
      } else {
        exit()
      }
      return
    }

    // Tab: cycle panels (when not entered) or cycle selectables (when entered)
    if (key.tab) {
      if (enteredPanel) {
        // Tab cycles selectables within the panel
        const count = selectableCounts[enteredPanel]
        if (count > 0) {
          setSelectedIndices(prev => ({
            ...prev,
            [enteredPanel]: (prev[enteredPanel] + 1) % count,
          }))
        }
      } else {
        // Tab cycles panels
        const currentIdx = PANEL_ORDER.indexOf(focusedPanel)
        const nextIdx = (currentIdx + 1) % PANEL_ORDER.length
        setFocusedPanel(PANEL_ORDER[nextIdx]!)
      }
      return
    }

    // Enter: enter panel or act on selected item
    if (key.return) {
      if (!enteredPanel) {
        const count = selectableCounts[focusedPanel]
        if (count > 0) {
          setEnteredPanel(focusedPanel)
          setSelectedIndices(prev => ({ ...prev, [focusedPanel]: 0 }))
        }
      }
      // TODO: action on selected item
      return
    }

    // Up/Down: navigate selectables when entered
    if (enteredPanel && (key.upArrow || key.downArrow)) {
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

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray">
      <Box justifyContent="center" paddingY={1}>
        <Text bold color="cyan"> pina </Text>
        <Text dimColor>— project dashboard</Text>
      </Box>

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
            focused={focusedPanel === 'active'}
            entered={enteredPanel === 'active'}
            selectedIndex={selectedIndices.active}
          />
        </Box>

        {/* Right: Objectives + All Projects */}
        <Box flexDirection="column" width="50%">
          {/* Top-right: Objectives */}
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
              focused={focusedPanel === 'objectives'}
              entered={enteredPanel === 'objectives'}
              selectedIndex={selectedIndices.objectives}
            />
          </Box>

          {/* Bottom-right: All Projects */}
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
              focused={focusedPanel === 'projects'}
              entered={enteredPanel === 'projects'}
              selectedIndex={selectedIndices.projects}
            />
          </Box>
        </Box>
      </Box>

      <Box paddingX={2} paddingY={1} justifyContent="center">
        <Text dimColor>
          {enteredPanel
            ? '↑↓/tab navigate  enter select  esc back'
            : 'tab focus panel  enter open  q quit'}
        </Text>
      </Box>
    </Box>
  )
}
