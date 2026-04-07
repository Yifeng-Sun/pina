// Pina visual theme — supports multiple palette presets.
// Consumers import `theme`, `sectionColor`, `SHIMMER_COLORS`, `STAGE_COLOR` —
// these are mutable objects/arrays whose contents are swapped by setPalette().

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { Stage } from '../types.js'

export type PaletteName = 'ube-matcha' | 'colada' | 'cyberpunk'

interface Palette {
  cream: string
  oat: string
  dimCream: string
  matcha: string
  slushie: string
  ube: string
  peach: string
  rose: string
  butter: string
  shimmer: readonly string[]
  stage: Record<Stage, string>
}

const PALETTES: Record<PaletteName, Palette> = {
  'ube-matcha': {
    cream: '#ede6d8',
    oat: '#a8a090',
    dimCream: '#7a7468',
    matcha: '#a3c585',
    slushie: '#a6b8e8',
    ube: '#b89bd9',
    peach: '#e8b89c',
    rose: '#e09a9a',
    butter: '#e8d49c',
    shimmer: ['#b8d49a', '#a3c585', '#8fb56e', '#a3c585', '#b8d49a', '#cce4af', '#b8d49a', '#a3c585'],
    stage: {
      planning: '#b89bd9',
      scaffolding: '#e8d49c',
      development: '#a6b8e8',
      stable: '#a3c585',
      complete: '#a3c585',
      archived: '#7a7468',
    },
  },
  // Piña colada — tropical: coconut cream, pineapple, palm green, rum gold.
  'colada': {
    cream: '#fef6e4',
    oat: '#c8b89a',
    dimCream: '#8a7a5a',
    matcha: '#7fb069',     // palm green
    slushie: '#5fb3a8',    // ocean teal
    ube: '#f4a261',        // pineapple
    peach: '#ee8959',      // mango
    rose: '#e76f51',       // hibiscus
    butter: '#f6c453',     // rum gold
    shimmer: ['#f4a261', '#f6c453', '#fce38a', '#f6c453', '#f4a261', '#ee8959', '#f4a261', '#f6c453'],
    stage: {
      planning: '#5fb3a8',
      scaffolding: '#f6c453',
      development: '#f4a261',
      stable: '#7fb069',
      complete: '#7fb069',
      archived: '#8a7a5a',
    },
  },
  // Cyberpunk — neon blue and pink on near-black sensibility.
  'cyberpunk': {
    cream: '#e8f1ff',
    oat: '#4a4d6a',
    dimCream: '#6a6d8a',
    matcha: '#00f0ff',     // neon cyan
    slushie: '#3a86ff',    // electric blue
    ube: '#ff006e',        // hot pink
    peach: '#ff4081',      // magenta-pink
    rose: '#ff2e63',       // alarm red-pink
    butter: '#fbff12',     // neon yellow
    shimmer: ['#ff006e', '#ff4081', '#ff70a6', '#ff4081', '#ff006e', '#d4006e', '#ff006e', '#ff4081'],
    stage: {
      planning: '#ff006e',
      scaffolding: '#fbff12',
      development: '#3a86ff',
      stable: '#00f0ff',
      complete: '#00f0ff',
      archived: '#4a4d6a',
    },
  },
}

export const PALETTE_ORDER: PaletteName[] = ['ube-matcha', 'colada', 'cyberpunk']

// Mutable exports — call sites read these at render time.
export const theme = {
  cream: '',
  oat: '',
  dimCream: '',
  matcha: '',
  slushie: '',
  ube: '',
  peach: '',
  rose: '',
  butter: '',
}

export const sectionColor = {
  active: '',
  objectives: '',
  projects: '',
}

export const SHIMMER_COLORS: string[] = []

export const STAGE_COLOR: Record<Stage, string> = {
  planning: '',
  scaffolding: '',
  development: '',
  stable: '',
  complete: '',
  archived: '',
}

// ---- persistence ----
const PINA_DIR = path.join(os.homedir(), '.pina')
const FILE = path.join(PINA_DIR, 'palette.json')

function loadSaved(): PaletteName {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf-8'))
    if (data && typeof data.palette === 'string' && data.palette in PALETTES) {
      return data.palette as PaletteName
    }
  } catch {}
  return 'ube-matcha'
}

function saveSelection(name: PaletteName): void {
  try {
    fs.mkdirSync(PINA_DIR, { recursive: true })
    fs.writeFileSync(FILE, JSON.stringify({ palette: name }, null, 2), 'utf-8')
  } catch {}
}

let currentName: PaletteName = 'ube-matcha'

export function setPalette(name: PaletteName): void {
  const p = PALETTES[name]
  if (!p) return
  currentName = name
  theme.cream = p.cream
  theme.oat = p.oat
  theme.dimCream = p.dimCream
  theme.matcha = p.matcha
  theme.slushie = p.slushie
  theme.ube = p.ube
  theme.peach = p.peach
  theme.rose = p.rose
  theme.butter = p.butter
  sectionColor.active = p.matcha
  sectionColor.objectives = p.slushie
  sectionColor.projects = p.ube
  SHIMMER_COLORS.length = 0
  SHIMMER_COLORS.push(...p.shimmer)
  Object.assign(STAGE_COLOR, p.stage)
  saveSelection(name)
}

export function getPaletteName(): PaletteName {
  return currentName
}

export function cyclePalette(): PaletteName {
  const idx = PALETTE_ORDER.indexOf(currentName)
  const next = PALETTE_ORDER[(idx + 1) % PALETTE_ORDER.length]!
  setPalette(next)
  return next
}

// Initialize from saved selection on module load.
setPalette(loadSaved())
