import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

const PINA_DIR = path.join(os.homedir(), '.pina')
const FILE = path.join(PINA_DIR, 'menu-defaults.json')

type Defaults = Record<string, string>

function load(): Defaults {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf-8')) as Defaults
  } catch {
    return {}
  }
}

function save(d: Defaults): void {
  fs.mkdirSync(PINA_DIR, { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify(d, null, 2), 'utf-8')
}

export function getMenuDefault(title: string): string | undefined {
  return load()[title]
}

export function setMenuDefault(title: string, label: string): void {
  const d = load()
  d[title] = label
  save(d)
}

export function clearMenuDefault(title: string): void {
  const d = load()
  delete d[title]
  save(d)
}
