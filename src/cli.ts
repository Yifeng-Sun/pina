import { Command } from 'commander'
import { render } from 'ink'
import React from 'react'
import { Dashboard } from './commands/dashboard.js'
import { InitCommand } from './commands/init.js'
import { ListCommand } from './commands/list.js'
import { SwitchCommand } from './commands/switch.js'
import { StatusCommand } from './commands/status.js'
import { NewCommand } from './commands/new.js'
import { ArchiveCommand } from './commands/archive.js'
import { NoteCommand } from './commands/note.js'
import { ScanCommand } from './commands/scan.js'

const program = new Command()

program
  .name('pina')
  .description('Personal project management CLI')
  .version('0.1.0')
  .action(() => {
    render(React.createElement(Dashboard))
  })

program
  .command('init')
  .description('Register the current directory as a pina project')
  .action(() => {
    render(React.createElement(InitCommand, { path: process.cwd() }))
  })

program
  .command('new <name>')
  .description('Register an existing directory as a project')
  .option('-p, --path <path>', 'Path to the project directory')
  .action((name: string, opts: { path?: string }) => {
    render(React.createElement(NewCommand, { name, path: opts.path }))
  })

program
  .command('scan <directory>')
  .description('Scan a directory and detect projects')
  .action((directory: string) => {
    render(React.createElement(ScanCommand, { directory }))
  })

program
  .command('switch <name>')
  .description('Switch to a project')
  .action((name: string) => {
    render(React.createElement(SwitchCommand, { name }))
  })

program
  .command('list')
  .alias('ls')
  .description('List all projects')
  .option('-s, --stage <stage>', 'Filter by stage')
  .option('-t, --tag <tag>', 'Filter by tag')
  .action((opts: { stage?: string; tag?: string }) => {
    render(React.createElement(ListCommand, opts))
  })

program
  .command('status')
  .description('Show current project status')
  .action(() => {
    render(React.createElement(StatusCommand))
  })

program
  .command('note <text>')
  .description('Add a note to the current project')
  .action((text: string) => {
    render(React.createElement(NoteCommand, { text }))
  })

program
  .command('archive <name>')
  .description('Archive a project')
  .action((name: string) => {
    render(React.createElement(ArchiveCommand, { name }))
  })

program.parse()
