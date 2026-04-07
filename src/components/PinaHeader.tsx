import React, { useEffect, useState } from 'react'
import { Text, Box, useStdout } from 'ink'
import { theme } from '../lib/theme.js'

const PRIMARY_ART = [
  '   ___  _          ',
  '  / _ \\(_)__  ___ _',
  ' / ___/ / _ \\/ _ `/',
  '/_/  /_/_//_/\\_,_/',
]

const STAGE_ADVANCED_ART = [
  '       __                          __                          __',
  `  ___ / /____ ____ ____   ___ ____/ /  _____ ____  _______ ___/ /`,
  ' (_-</ __/ _ `/ _ `/ -_) / _ `/ _  / |/ / _ `/ _ \\ /__/ -_) _  / ',
  ` /__/\\__/\\_,_/\\_, /\\__/  \\_,_/\\_,_/|___/\\_,_/_//_/\\__\\__/\\_,_/  `,
]

const PROJECT_COMPLETED_ART = [
  '                    _         __                        __    __         __',
  '   ___  _______    (_)__ ____/ /_  _______  __ _  ___  / /__ / /____ ___/ /',
  '  / _ \\/ __/ _ \\  / / -_) __/ __/ / __/ _ \\/  \' \\/ _ \\/ / -_) __/ -_) _  / ',
  ' / .__/_/  \\___/_/ /\\__\\__/\\__/  \\__/\\___/_/_/_/ .__/_/\\__/\\__/\\__/\\_,_/  ',
]

const PROJECT_ARCHIVED_ART = [
  '                    _         __                 __   _             __',
  '   ___  _______    (_)__ ____/ /_  ___ _________/ /  (_)  _____ ___/ /',
  '  / _ \\/ __/ _ \\  / / -_) __/ __/ / _ `/ __/ __/ _ \\/ / |/ / -_) _  / ',
  ' / .__/_/  \\___/_/ /\\__/\\__/\\__/  \\_,_/_/  \\__/_//_/_/|___/\\__/\\_,_/  ',
]

const MIN_WIDTH = PRIMARY_ART.reduce((max, line) => Math.max(max, line.length), 0)
const COLOR_INTERVAL_MS = 90
const COLOR_DURATION_MS = 1200

const PROJECT_SWITCHED_ART = [
  '                    _         __              _ __      __          __',
  '   ___  _______    (_)__ ____/ /_  ____    __(_) /_____/ /  ___ ___/ /',
  '  / _ \\/ __/ _ \\  / / -_) __/ __/ (_-< |/|/ / / __/ __/ _ \\/ -_) _  / ',
  ' / .__/_/  \\___/_/ /\\__/\\__/\\__/ /___/__,__/_/\\__/\\__/_//_/\\__/\\_,_/  ',
]

const FOLDER_OPENED_ART = [
  '   ___     __   __                                    __',
  '  / _/__  / /__/ /__ ____  ___  ___  ___ ___  ___ ___/ /',
  ' / _/ _ \\/ / _  / -_) __/ / _ \\/ _ \\/ -_) _ \\/ -_) _  / ',
  '/_/ \\___/_/\\_,_/\\__/\\_/    \\___/ .__/\\__/_//_/\\__/\\_,_/  ',
]

const VSCODE_OPENED_ART = [
  '  _   ______  _____        __                                __',
  ' | | / / __/ / ___/__  ___/ /__   ___  ___  ___ ___  ___ ___/ /',
  ' | |/ /\ \  / /__/ _ \\/ _  / -_) / _ \\/ _ \\/ -_) _ \\/ -_) _  / ',
  ' |___/___/  \\___/\\___/\\_,_/\\__/  \\___/ .__/\\__/_//_/\\__/\\_,_/  ',
]

const TERMINAL_OPENED_ART = [
  '  __                _           __                            __',
  ' / /____ ______ _  (_)__  ___ _/ / ___  ___  ___ ___  ___ ___/ /',
  '/ __/ -_) __/  \' \\/ / _ \\/ _ `/ / / _ \\/ _ \\/ -_) _ \\/ -_) _  / ',
  '\\__/\\__/_/ /_/_/_/_/_//_/\\_,_/_/  \\___/ .__/\\__/_//_/\\__/\\_,_/  ',
]

const GIT_ADD_ART = [
  '        _ __            __   __       __  ',
  '  ___ _(_) /_  ___ ____/ /__/ / ___  / /__',
  ' / _ `/ / __/ / _ `/ _  / _  / / _ \\/  \'_/',
  ' \\_, /_/\\__/  \\_,_/\\_,_/\\_,_/  \\___/_/\\_/ ',
]

const GIT_COMMIT_ART = [
  '        _ __                         _ __         __  ',
  '  ___ _(_) /_  _______  __ _  __ _  (_) /_  ___  / /__',
  ' / _ `/ / __/ / __/ _ \\/  \' \\/  \' \\/ / __/ / _ \\/  \'_/',
  ' \\_, /_/\\__/  \\__/\\___/_/_/_/_/_/_/_/\\__/  \\___/_/\\_/ ',
]

const GIT_PUSH_ART = [
  '        _ __                  __          __  ',
  '  ___ _(_) /_  ___  __ _____ / /    ___  / /__',
  ' / _ `/ / __/ / _ \\ // (_-</ _ \\  / _ \\/  \'_/',
  ' \\_, /_/\\__/ / .__/\\_,_/___/_//_/  \\___/_/\\_/ ',
]

const BROWSER_OPENED_ART = [
  '   __                                                          __',
  '  / /  _______ _    _____ ___ ____  ___  ___  ___ ___  ___ ___/ /',
  ' / _ \\/ __/ _ \\ |/|/ (_-</ -_) __/ / _ \\/ _ \\/ -_) _ \\/ -_) _  / ',
  '/_.__/_/  \\___/__,__/___/\\__/\\_/   \\___/ .__/\\__/_//_/\\__/\\_,_/  ',
]

const GIT_PULL_ART = [
  '        _ __              ____       __  ',
  '  ___ _(_) /_  ___  __ __/ / / ___  / /__',
  ' / _ `/ / __/ / _ \\ // / / / / _ \\/  \'_/',
  ' \\_, /_/\\__/ / .__/_\\_,_/_/_/  \\___/_/\\_/ ',
]

const GIT_FETCH_ART = [
  '        _ __    ___    __      __          __  ',
  '  ___ _(_) /_  / _/__ / /_____/ /    ___  / /__',
  ' / _ `/ / __/ / _/ -_) __/ __/ _ \\  / _ \\/  \'_/',
  ' \\_, /_/\\__/ /_/ \\__/\\__/\\__/_//_/  \\___/_/\\_/ ',
]

const GIT_REFRESH_ART = [
  '        _ __            ___            __          __  ',
  '  ___ _(_) /_  _______ / _/______ ___ / /    ___  / /__',
  ' / _ `/ / __/ / __/ -_) _/ __/ -_|_-</ _ \\  / _ \\/  \'_/',
  ' \\_, /_/\\__/ /_/  \\__/_//_/  \\__/___/_//_/  \\___/_/\\_/ ',
]

const GIT_CHECKOUT_ART = [
  '        _ __        __           __             __         __  ',
  '  ___ _(_) /_  ____/ /  ___ ____/ /_____  __ __/ /_  ___  / /__',
  ' / _ `/ / __/ / __/ _ \\ / -_) __/  \'_/ _ \\/ // / __/ / _ \\/  \'_/',
  ' \\_, /_/\\__/  \\__/_//_/\\__/_\\__/_/\\_/\\___/\\_,_/\\__/  \\___/_/\\_/ ',
]

const ASSET_CREATED_ART = [
  '                   __                     __         __',
  ' ___ ____ ___ ___ / /_  ___________ ___ _/ /____ ___/ /',
  '/ _ `(_-<(_-</ -_) __/ / __/ __/ -_) _ `/ __/ -_) _  / ',
  '\\_,_/___/___/\\__/\\__/  \\__/_/  \\__/\\_,_/\\__/\\__/\\_,_/ ',
]

const OBJECTIVE_ADDED_ART = [
  '       __     _         __  _                    __   __       __',
  ' ___  / /    (_)__ ____/ /_(_)  _____   ___ ____/ /__/ /__ ___/ /',
  '/ _ \\/ _ \\  / / -_) __/ __/ / |/ / -_) / _ `/ _  / _  / -_) _  / ',
  '\\___/_.__/_/ /\\__/\\__/\\__/_/|___/\\__/  \\_,_/\\_,_/\\_,_/\\__/\\_,_/  ',
]

const OBJECTIVE_COMPLETED_ART = [
  '       __     _         __  _                                __    __         __',
  ' ___  / /    (_)__ ____/ /_(_)  _____   _______  __ _  ___  / /__ / /____ ___/ /',
  '/ _ \\/ _ \\  / / -_) __/ __/ / |/ / -_) / __/ _ \\/  \' \\/ _ \\/ / -_) __/ -_) _  / ',
  '\\___/_.__/_/ /\\__/\\__/\\__/_/|___/\\__/  \\__/_\\___/_/_/_/ .__/_/\\__/\\__/\\__/\\_,_/  ',
]

const TITLE_VARIANTS = {
  default: { art: PRIMARY_ART, compactLabel: 'pina' },
  stageAdvanced: { art: STAGE_ADVANCED_ART, compactLabel: 'stage advanced' },
  projectCompleted: { art: PROJECT_COMPLETED_ART, compactLabel: 'project completed' },
  projectArchived: { art: PROJECT_ARCHIVED_ART, compactLabel: 'project archived' },
  projectSwitched: { art: PROJECT_SWITCHED_ART, compactLabel: 'project switched' },
  folderOpened: { art: FOLDER_OPENED_ART, compactLabel: 'folder opened' },
  vscodeOpened: { art: VSCODE_OPENED_ART, compactLabel: 'VS Code opened' },
  terminalOpened: { art: TERMINAL_OPENED_ART, compactLabel: 'terminal opened' },
  gitAdd: { art: GIT_ADD_ART, compactLabel: 'git add ok' },
  gitCommit: { art: GIT_COMMIT_ART, compactLabel: 'git commit ok' },
  gitPush: { art: GIT_PUSH_ART, compactLabel: 'git push ok' },
  browserOpened: { art: BROWSER_OPENED_ART, compactLabel: 'browser opened' },
  gitPull: { art: GIT_PULL_ART, compactLabel: 'git pull ok' },
  gitFetch: { art: GIT_FETCH_ART, compactLabel: 'git fetch ok' },
  gitRefresh: { art: GIT_REFRESH_ART, compactLabel: 'git refresh ok' },
  gitCheckout: { art: GIT_CHECKOUT_ART, compactLabel: 'git checkout ok' },
  assetCreated: { art: ASSET_CREATED_ART, compactLabel: 'asset created' },
  objectiveAdded: { art: OBJECTIVE_ADDED_ART, compactLabel: 'objective added' },
  objectiveCompleted: { art: OBJECTIVE_COMPLETED_ART, compactLabel: 'objective completed' },
} as const

export type TitleVariant = keyof typeof TITLE_VARIANTS

function getLineColor(index: number, compact: boolean, shift: number, palette: string[]) {
  if (palette.length === 0) return theme.matcha
  if (compact) return palette[shift % palette.length]
  return palette[(index + shift) % palette.length]
}

type PinaHeaderProps = {
  variant?: TitleVariant
}

export function PinaHeader({ variant = 'default' }: PinaHeaderProps) {
  const { stdout } = useStdout()
  const cols = stdout?.columns ?? 80
  const [colorShift, setColorShift] = useState(0)
  const paletteColors = React.useMemo(
    () => [theme.matcha, theme.slushie, theme.ube, theme.peach],
    [theme.matcha, theme.slushie, theme.ube, theme.peach],
  )
  const paletteLength = paletteColors.length || 1

  const config = TITLE_VARIANTS[variant] ?? TITLE_VARIANTS.default
  const artWidth = config.art.reduce((max, line) => Math.max(max, line.length), 0)
  const minWidth = Math.max(artWidth, MIN_WIDTH)
  const useCompact = cols < minWidth + 4
  const lines = useCompact ? [config.compactLabel] : config.art
  const paddingX = 1

  useEffect(() => {
    setColorShift(0)
    const interval = setInterval(() => {
      setColorShift(shift => (shift + 1) % paletteLength)
    }, COLOR_INTERVAL_MS)
    const timeout = setTimeout(() => {
      clearInterval(interval)
      setColorShift(0)
    }, COLOR_DURATION_MS)
    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [variant, paletteLength])

  return (
    <Box paddingX={paddingX} paddingY={0} marginBottom={1}>
      <Box flexDirection="column" alignItems="flex-start">
        {lines.map((line, idx) => (
          <Text
            key={`pina-row-${variant}-${idx}`}
            bold
            color={getLineColor(idx, useCompact, colorShift, paletteColors)}
          >
            {line}
          </Text>
        ))}
      </Box>
    </Box>
  )
}
