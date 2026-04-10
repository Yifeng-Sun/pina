import fs from 'node:fs'
import path from 'node:path'

export interface QuickAction {
  id: string
  label: string
  icon: string
  command: string
  args: string[]
  source: 'detected' | 'custom'
}

// Nerd Font icons per project type
const ICON_NODE = '\ue718'     //  (nf-dev-nodejs_small)
const ICON_PYTHON = '\ue73c'   //  (nf-dev-python)
const ICON_RUST = '\ue7a8'     //  (nf-dev-rust)
const ICON_GO = '\ue626'       //  (nf-dev-go)
const ICON_JAVA = '\ue738'     //  (nf-dev-java)
const ICON_MAKE = '\uf489'     //  (nf-oct-terminal)
const ICON_CUSTOM = '\uf0ad'   //  (nf-fa-wrench)
const ICON_DOCKER = '\uf308'   //  (nf-linux-docker)
const ICON_RUBY = '\ue739'     //  (nf-dev-ruby)
const ICON_PHP = '\ue73d'      //  (nf-dev-php)
const ICON_SWIFT = '\ue755'    //  (nf-dev-swift)
const ICON_DART = '\ue798'     //  (nf-dev-dart)
const ICON_SCALA = '\ue737'    //  (nf-dev-scala)
const ICON_HASKELL = '\ue777'  //  (nf-dev-haskell)
const ICON_ELIXIR = '\ue62d'   //  (nf-seti-elixir)
const ICON_ERLANG = '\ue7b1'   //  (nf-dev-erlang)
const ICON_INFRA = '\uf0c2'    //  (nf-fa-cloud)
const ICON_DOC = '\uf02d'      //  (nf-fa-book)
const ICON_GAME = '\uf11b'     //  (nf-fa-gamepad)
const ICON_BLOCKCHAIN = '\uf0c1' //  (nf-fa-chain)
const ICON_GIT = '\ue702'       //  (nf-dev-git)
const ICON_DOTNET = '\ue77f'    //  (nf-dev-dotnet)

// Priority order for picking the "most suggested" action
const PRIMARY_IDS = [
  // Run / dev
  'npm:dev', 'npm:start', 'cargo:run', 'go:run', 'swift:run', 'mix:server',
  'gradle:run', 'sbt:run', 'dart:run', 'gleam:run', 'hugo:server', 'mkdocs:serve', 'mdbook:serve',
  // Build
  'npm:build', 'cargo:build', 'mvn:compile', 'make:all', 'make:build',
  'gradle:build', 'swift:build', 'cmake:build', 'zig:build', 'sbt:compile',
  'dune:build', 'gleam:build', 'forge:build', 'crystal:build',
  // Test
  'npm:test', 'cargo:test', 'mvn:test', 'python:test', 'go:test',
  'gradle:test', 'swift:test', 'mix:test', 'dart:test', 'bundle:rspec',
  'sbt:test', 'stack:test', 'dune:test', 'gleam:test', 'forge:test',
  'crystal:spec', 'rebar:test', 'phpunit', 'bazel:test',
  // Frameworks
  'django:runserver', 'laravel:serve', 'rails:server', 'jekyll:serve',
  'django:test', 'laravel:test', 'rails:test',
  // Desktop / mobile
  'tauri:dev', 'xcode:build', 'love:run', 'unity:open',
  // Notebooks
  'jupyter:lab',
  // Install / deps
  'npm:install', 'python:install', 'poetry:install', 'uv:sync', 'pdm:install',
  'pipenv:install', 'pixi:install', 'conda:create',
  'bundle:install', 'composer:install', 'pod:install',
  'mix:deps', 'dart:pub', 'shards:install',
  'poetry:test', 'uv:test', 'pdm:test', 'pipenv:test',
  // Monorepo
  'nx:build', 'turbo:build', 'nx:test', 'turbo:test',
  // .NET
  'dotnet:build', 'dotnet:run', 'dotnet:test',
  // Infra
  'cdk:deploy', 'sls:deploy', 'vagrant:up',
  // Blockchain
  'hardhat:compile', 'anchor:build', 'truffle:compile',
  // Scannable
  'nimble:build', 'cabal:build', 'fpm:build', 'meson:compile',
]

// Preferred script ordering for node projects
const NODE_SCRIPT_ORDER = ['dev', 'start', 'build', 'test', 'lint', 'typecheck', 'check', 'format']

function detectPackageManager(dir: string): string {
  if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm'
  if (fs.existsSync(path.join(dir, 'yarn.lock'))) return 'yarn'
  if (fs.existsSync(path.join(dir, 'bun.lockb'))) return 'bun'
  return 'npm'
}

function detectNode(dir: string): QuickAction[] {
  const pkgPath = path.join(dir, 'package.json')
  if (!fs.existsSync(pkgPath)) return []
  const pm = detectPackageManager(dir)
  const actions: QuickAction[] = []

  actions.push({ id: 'npm:install', label: `${pm} install`, icon: ICON_NODE, command: pm, args: ['install'], source: 'detected' })

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    const scripts = (pkg.scripts ?? {}) as Record<string, string>
    const scriptNames = Object.keys(scripts)
    const ordered = [
      ...NODE_SCRIPT_ORDER.filter(s => scriptNames.includes(s)),
      ...scriptNames.filter(s => !NODE_SCRIPT_ORDER.includes(s)),
    ]
    for (const name of ordered) {
      actions.push({
        id: `npm:${name}`,
        label: `${pm} run ${name}`,
        icon: ICON_NODE,
        command: pm,
        args: ['run', name],
        source: 'detected',
      })
    }
  } catch {}

  return actions
}

function detectPython(dir: string): QuickAction[] {
  const actions: QuickAction[] = []

  const hasPoetry = fs.existsSync(path.join(dir, 'poetry.lock'))
  const hasUV = fs.existsSync(path.join(dir, 'uv.lock'))
  const hasPDM = fs.existsSync(path.join(dir, 'pdm.lock'))
  const hasPipenv = fs.existsSync(path.join(dir, 'Pipfile'))
  const hasRequirements = fs.existsSync(path.join(dir, 'requirements.txt'))
  const hasPyproject = fs.existsSync(path.join(dir, 'pyproject.toml'))
  const hasSetupPy = fs.existsSync(path.join(dir, 'setup.py'))
  const hasPytest = fs.existsSync(path.join(dir, 'pytest.ini'))

  // Package manager detection (mutually exclusive, priority order)
  if (hasPoetry) {
    actions.push(
      { id: 'poetry:install', label: 'poetry install', icon: ICON_PYTHON, command: 'poetry', args: ['install'], source: 'detected' },
      { id: 'poetry:test', label: 'poetry run pytest', icon: ICON_PYTHON, command: 'poetry', args: ['run', 'pytest'], source: 'detected' },
      { id: 'poetry:shell', label: 'poetry shell', icon: ICON_PYTHON, command: 'poetry', args: ['shell'], source: 'detected' },
    )
  } else if (hasUV) {
    actions.push(
      { id: 'uv:sync', label: 'uv sync', icon: ICON_PYTHON, command: 'uv', args: ['sync'], source: 'detected' },
      { id: 'uv:test', label: 'uv run pytest', icon: ICON_PYTHON, command: 'uv', args: ['run', 'pytest'], source: 'detected' },
      { id: 'uv:run', label: 'uv run python', icon: ICON_PYTHON, command: 'uv', args: ['run', 'python'], source: 'detected' },
    )
  } else if (hasPDM) {
    actions.push(
      { id: 'pdm:install', label: 'pdm install', icon: ICON_PYTHON, command: 'pdm', args: ['install'], source: 'detected' },
      { id: 'pdm:test', label: 'pdm run pytest', icon: ICON_PYTHON, command: 'pdm', args: ['run', 'pytest'], source: 'detected' },
    )
  } else if (hasPipenv) {
    actions.push(
      { id: 'pipenv:install', label: 'pipenv install', icon: ICON_PYTHON, command: 'pipenv', args: ['install'], source: 'detected' },
      { id: 'pipenv:test', label: 'pipenv run pytest', icon: ICON_PYTHON, command: 'pipenv', args: ['run', 'pytest'], source: 'detected' },
      { id: 'pipenv:shell', label: 'pipenv shell', icon: ICON_PYTHON, command: 'pipenv', args: ['shell'], source: 'detected' },
    )
  } else {
    if (hasRequirements) {
      actions.push({ id: 'python:install', label: 'pip install -r requirements.txt', icon: ICON_PYTHON, command: 'pip', args: ['install', '-r', 'requirements.txt'], source: 'detected' })
    }
    if (hasPyproject || hasSetupPy || hasPytest) {
      actions.push({ id: 'python:test', label: 'pytest', icon: ICON_PYTHON, command: 'pytest', args: [], source: 'detected' })
    }
  }

  // Linters/formatters (additive, regardless of package manager)
  if (fs.existsSync(path.join(dir, 'ruff.toml')) || fs.existsSync(path.join(dir, '.ruff.toml'))) {
    actions.push(
      { id: 'ruff:check', label: 'ruff check .', icon: ICON_PYTHON, command: 'ruff', args: ['check', '.'], source: 'detected' },
      { id: 'ruff:format', label: 'ruff format .', icon: ICON_PYTHON, command: 'ruff', args: ['format', '.'], source: 'detected' },
    )
  }
  if (fs.existsSync(path.join(dir, 'mypy.ini')) || fs.existsSync(path.join(dir, '.mypy.ini'))) {
    actions.push({ id: 'mypy:check', label: 'mypy .', icon: ICON_PYTHON, command: 'mypy', args: ['.'], source: 'detected' })
  }

  return actions
}

function detectMake(dir: string): QuickAction[] {
  const makefile = path.join(dir, 'Makefile')
  if (!fs.existsSync(makefile)) return []
  const actions: QuickAction[] = []
  try {
    const content = fs.readFileSync(makefile, 'utf-8')
    const targetRe = /^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:/gm
    const seen = new Set<string>()
    let match
    while ((match = targetRe.exec(content)) !== null) {
      const target = match[1]!
      if (seen.has(target)) continue
      seen.add(target)
      actions.push({
        id: `make:${target}`,
        label: `make ${target}`,
        icon: ICON_MAKE,
        command: 'make',
        args: [target],
        source: 'detected',
      })
    }
  } catch {}
  return actions
}

function detectMaven(dir: string): QuickAction[] {
  if (!fs.existsSync(path.join(dir, 'pom.xml'))) return []
  return [
    { id: 'mvn:compile', label: 'mvn compile', icon: ICON_JAVA, command: 'mvn', args: ['compile'], source: 'detected' },
    { id: 'mvn:test', label: 'mvn test', icon: ICON_JAVA, command: 'mvn', args: ['test'], source: 'detected' },
    { id: 'mvn:package', label: 'mvn package', icon: ICON_JAVA, command: 'mvn', args: ['package'], source: 'detected' },
    { id: 'mvn:clean', label: 'mvn clean', icon: ICON_JAVA, command: 'mvn', args: ['clean'], source: 'detected' },
  ]
}

// ---- Static detectors: project types with fixed action sets ----

interface StaticDetector {
  files: string[]
  icon: string
  actions: { id: string; label: string; command: string; args: string[] }[]
}

const STATIC_DETECTORS: StaticDetector[] = [
  // Rust
  {
    files: ['Cargo.toml'],
    icon: ICON_RUST,
    actions: [
      { id: 'cargo:build', label: 'cargo build', command: 'cargo', args: ['build'] },
      { id: 'cargo:run', label: 'cargo run', command: 'cargo', args: ['run'] },
      { id: 'cargo:test', label: 'cargo test', command: 'cargo', args: ['test'] },
      { id: 'cargo:clippy', label: 'cargo clippy', command: 'cargo', args: ['clippy'] },
      { id: 'cargo:fmt', label: 'cargo fmt', command: 'cargo', args: ['fmt'] },
    ],
  },
  // Go
  {
    files: ['go.mod'],
    icon: ICON_GO,
    actions: [
      { id: 'go:build', label: 'go build ./...', command: 'go', args: ['build', './...'] },
      { id: 'go:run', label: 'go run .', command: 'go', args: ['run', '.'] },
      { id: 'go:test', label: 'go test ./...', command: 'go', args: ['test', './...'] },
      { id: 'go:vet', label: 'go vet ./...', command: 'go', args: ['vet', './...'] },
    ],
  },
  // Docker
  {
    files: ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'],
    icon: ICON_DOCKER,
    actions: [
      { id: 'docker:up', label: 'docker compose up', command: 'docker', args: ['compose', 'up'] },
      { id: 'docker:down', label: 'docker compose down', command: 'docker', args: ['compose', 'down'] },
      { id: 'docker:build', label: 'docker compose build', command: 'docker', args: ['compose', 'build'] },
    ],
  },
  // Swift
  {
    files: ['Package.swift'],
    icon: ICON_SWIFT,
    actions: [
      { id: 'swift:build', label: 'swift build', command: 'swift', args: ['build'] },
      { id: 'swift:run', label: 'swift run', command: 'swift', args: ['run'] },
      { id: 'swift:test', label: 'swift test', command: 'swift', args: ['test'] },
    ],
  },
  // Elixir
  {
    files: ['mix.exs'],
    icon: ICON_ELIXIR,
    actions: [
      { id: 'mix:deps', label: 'mix deps.get', command: 'mix', args: ['deps.get'] },
      { id: 'mix:compile', label: 'mix compile', command: 'mix', args: ['compile'] },
      { id: 'mix:test', label: 'mix test', command: 'mix', args: ['test'] },
      { id: 'mix:server', label: 'iex -S mix', command: 'iex', args: ['-S', 'mix'] },
    ],
  },
  // Ruby
  {
    files: ['Gemfile'],
    icon: ICON_RUBY,
    actions: [
      { id: 'bundle:install', label: 'bundle install', command: 'bundle', args: ['install'] },
      { id: 'bundle:rspec', label: 'bundle exec rspec', command: 'bundle', args: ['exec', 'rspec'] },
      { id: 'bundle:rake', label: 'bundle exec rake', command: 'bundle', args: ['exec', 'rake'] },
    ],
  },
  // PHP / Composer
  {
    files: ['composer.json'],
    icon: ICON_PHP,
    actions: [
      { id: 'composer:install', label: 'composer install', command: 'composer', args: ['install'] },
      { id: 'phpunit', label: 'phpunit', command: './vendor/bin/phpunit', args: [] },
    ],
  },
  // CMake
  {
    files: ['CMakeLists.txt'],
    icon: ICON_MAKE,
    actions: [
      { id: 'cmake:configure', label: 'cmake -B build', command: 'cmake', args: ['-B', 'build'] },
      { id: 'cmake:build', label: 'cmake --build build', command: 'cmake', args: ['--build', 'build'] },
      { id: 'cmake:test', label: 'ctest --test-dir build', command: 'ctest', args: ['--test-dir', 'build'] },
    ],
  },
  // Dart / Flutter
  {
    files: ['pubspec.yaml'],
    icon: ICON_DART,
    actions: [
      { id: 'dart:pub', label: 'dart pub get', command: 'dart', args: ['pub', 'get'] },
      { id: 'dart:run', label: 'dart run', command: 'dart', args: ['run'] },
      { id: 'dart:test', label: 'dart test', command: 'dart', args: ['test'] },
      { id: 'dart:analyze', label: 'dart analyze', command: 'dart', args: ['analyze'] },
    ],
  },
  // Zig
  {
    files: ['build.zig'],
    icon: ICON_MAKE,
    actions: [
      { id: 'zig:build', label: 'zig build', command: 'zig', args: ['build'] },
      { id: 'zig:run', label: 'zig build run', command: 'zig', args: ['build', 'run'] },
      { id: 'zig:test', label: 'zig build test', command: 'zig', args: ['build', 'test'] },
    ],
  },
  // OCaml / Dune
  {
    files: ['dune-project'],
    icon: ICON_MAKE,
    actions: [
      { id: 'dune:build', label: 'dune build', command: 'dune', args: ['build'] },
      { id: 'dune:test', label: 'dune test', command: 'dune', args: ['test'] },
      { id: 'dune:clean', label: 'dune clean', command: 'dune', args: ['clean'] },
    ],
  },
  // Scala / sbt
  {
    files: ['build.sbt'],
    icon: ICON_SCALA,
    actions: [
      { id: 'sbt:compile', label: 'sbt compile', command: 'sbt', args: ['compile'] },
      { id: 'sbt:run', label: 'sbt run', command: 'sbt', args: ['run'] },
      { id: 'sbt:test', label: 'sbt test', command: 'sbt', args: ['test'] },
      { id: 'sbt:clean', label: 'sbt clean', command: 'sbt', args: ['clean'] },
    ],
  },
  // Haskell / Stack
  {
    files: ['stack.yaml'],
    icon: ICON_HASKELL,
    actions: [
      { id: 'stack:build', label: 'stack build', command: 'stack', args: ['build'] },
      { id: 'stack:run', label: 'stack run', command: 'stack', args: ['run'] },
      { id: 'stack:test', label: 'stack test', command: 'stack', args: ['test'] },
    ],
  },
  // Gleam
  {
    files: ['gleam.toml'],
    icon: ICON_MAKE,
    actions: [
      { id: 'gleam:build', label: 'gleam build', command: 'gleam', args: ['build'] },
      { id: 'gleam:run', label: 'gleam run', command: 'gleam', args: ['run'] },
      { id: 'gleam:test', label: 'gleam test', command: 'gleam', args: ['test'] },
    ],
  },
  // Crystal
  {
    files: ['shard.yml'],
    icon: ICON_MAKE,
    actions: [
      { id: 'shards:install', label: 'shards install', command: 'shards', args: ['install'] },
      { id: 'crystal:build', label: 'crystal build src/main.cr', command: 'crystal', args: ['build', 'src/main.cr'] },
      { id: 'crystal:spec', label: 'crystal spec', command: 'crystal', args: ['spec'] },
    ],
  },
  // Erlang / Rebar3
  {
    files: ['rebar.config'],
    icon: ICON_ERLANG,
    actions: [
      { id: 'rebar:compile', label: 'rebar3 compile', command: 'rebar3', args: ['compile'] },
      { id: 'rebar:test', label: 'rebar3 eunit', command: 'rebar3', args: ['eunit'] },
      { id: 'rebar:shell', label: 'rebar3 shell', command: 'rebar3', args: ['shell'] },
    ],
  },
  // Clojure / Leiningen
  {
    files: ['project.clj'],
    icon: ICON_JAVA,
    actions: [
      { id: 'lein:run', label: 'lein run', command: 'lein', args: ['run'] },
      { id: 'lein:test', label: 'lein test', command: 'lein', args: ['test'] },
      { id: 'lein:uberjar', label: 'lein uberjar', command: 'lein', args: ['uberjar'] },
    ],
  },
  // Terraform
  {
    files: ['main.tf'],
    icon: ICON_INFRA,
    actions: [
      { id: 'tf:init', label: 'terraform init', command: 'terraform', args: ['init'] },
      { id: 'tf:plan', label: 'terraform plan', command: 'terraform', args: ['plan'] },
      { id: 'tf:apply', label: 'terraform apply', command: 'terraform', args: ['apply'] },
      { id: 'tf:fmt', label: 'terraform fmt', command: 'terraform', args: ['fmt'] },
    ],
  },
  // Pulumi
  {
    files: ['Pulumi.yaml'],
    icon: ICON_INFRA,
    actions: [
      { id: 'pulumi:preview', label: 'pulumi preview', command: 'pulumi', args: ['preview'] },
      { id: 'pulumi:up', label: 'pulumi up', command: 'pulumi', args: ['up'] },
    ],
  },
  // Helm
  {
    files: ['Chart.yaml'],
    icon: ICON_INFRA,
    actions: [
      { id: 'helm:lint', label: 'helm lint', command: 'helm', args: ['lint'] },
      { id: 'helm:template', label: 'helm template .', command: 'helm', args: ['template', '.'] },
      { id: 'helm:package', label: 'helm package .', command: 'helm', args: ['package', '.'] },
    ],
  },
  // Nix
  {
    files: ['flake.nix'],
    icon: ICON_MAKE,
    actions: [
      { id: 'nix:build', label: 'nix build', command: 'nix', args: ['build'] },
      { id: 'nix:develop', label: 'nix develop', command: 'nix', args: ['develop'] },
      { id: 'nix:check', label: 'nix flake check', command: 'nix', args: ['flake', 'check'] },
    ],
  },
  // Hugo
  {
    files: ['hugo.toml', 'hugo.yaml'],
    icon: ICON_DOC,
    actions: [
      { id: 'hugo:server', label: 'hugo server', command: 'hugo', args: ['server'] },
      { id: 'hugo:build', label: 'hugo', command: 'hugo', args: [] },
    ],
  },
  // MkDocs
  {
    files: ['mkdocs.yml'],
    icon: ICON_DOC,
    actions: [
      { id: 'mkdocs:serve', label: 'mkdocs serve', command: 'mkdocs', args: ['serve'] },
      { id: 'mkdocs:build', label: 'mkdocs build', command: 'mkdocs', args: ['build'] },
    ],
  },
  // mdBook
  {
    files: ['book.toml'],
    icon: ICON_DOC,
    actions: [
      { id: 'mdbook:serve', label: 'mdbook serve', command: 'mdbook', args: ['serve'] },
      { id: 'mdbook:build', label: 'mdbook build', command: 'mdbook', args: ['build'] },
    ],
  },
  // Foundry (Solidity)
  {
    files: ['foundry.toml'],
    icon: ICON_BLOCKCHAIN,
    actions: [
      { id: 'forge:build', label: 'forge build', command: 'forge', args: ['build'] },
      { id: 'forge:test', label: 'forge test', command: 'forge', args: ['test'] },
      { id: 'forge:fmt', label: 'forge fmt', command: 'forge', args: ['fmt'] },
    ],
  },
  // Godot
  {
    files: ['project.godot'],
    icon: ICON_GAME,
    actions: [
      { id: 'godot:editor', label: 'godot --editor', command: 'godot', args: ['--editor'] },
    ],
  },
  // DVC
  {
    files: ['dvc.yaml'],
    icon: ICON_PYTHON,
    actions: [
      { id: 'dvc:repro', label: 'dvc repro', command: 'dvc', args: ['repro'] },
      { id: 'dvc:push', label: 'dvc push', command: 'dvc', args: ['push'] },
      { id: 'dvc:pull', label: 'dvc pull', command: 'dvc', args: ['pull'] },
      { id: 'dvc:status', label: 'dvc status', command: 'dvc', args: ['status'] },
    ],
  },
  // Bazel
  {
    files: ['MODULE.bazel', 'WORKSPACE'],
    icon: ICON_MAKE,
    actions: [
      { id: 'bazel:build', label: 'bazel build //...', command: 'bazel', args: ['build', '//...'] },
      { id: 'bazel:test', label: 'bazel test //...', command: 'bazel', args: ['test', '//...'] },
    ],
  },
  // V language
  {
    files: ['v.mod'],
    icon: ICON_MAKE,
    actions: [
      { id: 'v:run', label: 'v run .', command: 'v', args: ['run', '.'] },
      { id: 'v:test', label: 'v test .', command: 'v', args: ['test', '.'] },
      { id: 'v:fmt', label: 'v fmt .', command: 'v', args: ['fmt', '.'] },
    ],
  },
  // Clojure (deps.edn)
  {
    files: ['deps.edn'],
    icon: ICON_JAVA,
    actions: [
      { id: 'clj:repl', label: 'clj', command: 'clj', args: [] },
      { id: 'clj:test', label: 'clj -M:test', command: 'clj', args: ['-M:test'] },
    ],
  },
  // Perl
  {
    files: ['cpanfile', 'Makefile.PL', 'dist.ini'],
    icon: ICON_MAKE,
    actions: [
      { id: 'perl:deps', label: 'cpanm --installdeps .', command: 'cpanm', args: ['--installdeps', '.'] },
      { id: 'perl:test', label: 'prove -l t', command: 'prove', args: ['-l', 't'] },
    ],
  },
  // MLflow
  {
    files: ['MLproject'],
    icon: ICON_PYTHON,
    actions: [
      { id: 'mlflow:run', label: 'mlflow run .', command: 'mlflow', args: ['run', '.'] },
      { id: 'mlflow:ui', label: 'mlflow ui', command: 'mlflow', args: ['ui'] },
    ],
  },
  // Conda
  {
    files: ['environment.yml', 'environment.yaml'],
    icon: ICON_PYTHON,
    actions: [
      { id: 'conda:create', label: 'conda env create -f environment.yml', command: 'conda', args: ['env', 'create', '-f', 'environment.yml'] },
    ],
  },
  // Pixi
  {
    files: ['pixi.toml'],
    icon: ICON_PYTHON,
    actions: [
      { id: 'pixi:install', label: 'pixi install', command: 'pixi', args: ['install'] },
      { id: 'pixi:run', label: 'pixi run start', command: 'pixi', args: ['run', 'start'] },
      { id: 'pixi:test', label: 'pixi run test', command: 'pixi', args: ['run', 'test'] },
    ],
  },
  // Meson
  {
    files: ['meson.build'],
    icon: ICON_MAKE,
    actions: [
      { id: 'meson:setup', label: 'meson setup build', command: 'meson', args: ['setup', 'build'] },
      { id: 'meson:compile', label: 'ninja -C build', command: 'ninja', args: ['-C', 'build'] },
      { id: 'meson:test', label: 'meson test -C build', command: 'meson', args: ['test', '-C', 'build'] },
    ],
  },
  // Fortran / fpm
  {
    files: ['fpm.toml'],
    icon: ICON_MAKE,
    actions: [
      { id: 'fpm:build', label: 'fpm build', command: 'fpm', args: ['build'] },
      { id: 'fpm:run', label: 'fpm run', command: 'fpm', args: ['run'] },
      { id: 'fpm:test', label: 'fpm test', command: 'fpm', args: ['test'] },
    ],
  },
  // Ansible
  {
    files: ['ansible.cfg'],
    icon: ICON_INFRA,
    actions: [
      { id: 'ansible:playbook', label: 'ansible-playbook playbook.yml', command: 'ansible-playbook', args: ['playbook.yml'] },
      { id: 'ansible:lint', label: 'ansible-lint', command: 'ansible-lint', args: [] },
    ],
  },
  // Kubernetes / Kustomize
  {
    files: ['kustomization.yaml'],
    icon: ICON_INFRA,
    actions: [
      { id: 'kubectl:apply', label: 'kubectl apply -k .', command: 'kubectl', args: ['apply', '-k', '.'] },
      { id: 'kubectl:diff', label: 'kubectl diff -k .', command: 'kubectl', args: ['diff', '-k', '.'] },
    ],
  },
  // AWS CDK
  {
    files: ['cdk.json'],
    icon: ICON_INFRA,
    actions: [
      { id: 'cdk:synth', label: 'cdk synth', command: 'cdk', args: ['synth'] },
      { id: 'cdk:deploy', label: 'cdk deploy', command: 'cdk', args: ['deploy'] },
      { id: 'cdk:diff', label: 'cdk diff', command: 'cdk', args: ['diff'] },
    ],
  },
  // Serverless Framework
  {
    files: ['serverless.yml', 'serverless.ts'],
    icon: ICON_INFRA,
    actions: [
      { id: 'sls:deploy', label: 'sls deploy', command: 'sls', args: ['deploy'] },
      { id: 'sls:offline', label: 'sls offline', command: 'sls', args: ['offline'] },
    ],
  },
  // Vagrant
  {
    files: ['Vagrantfile'],
    icon: ICON_INFRA,
    actions: [
      { id: 'vagrant:up', label: 'vagrant up', command: 'vagrant', args: ['up'] },
      { id: 'vagrant:ssh', label: 'vagrant ssh', command: 'vagrant', args: ['ssh'] },
      { id: 'vagrant:halt', label: 'vagrant halt', command: 'vagrant', args: ['halt'] },
    ],
  },
  // Pants
  {
    files: ['pants.toml'],
    icon: ICON_MAKE,
    actions: [
      { id: 'pants:test', label: 'pants test ::', command: 'pants', args: ['test', '::'] },
      { id: 'pants:fmt', label: 'pants fmt ::', command: 'pants', args: ['fmt', '::'] },
      { id: 'pants:lint', label: 'pants lint ::', command: 'pants', args: ['lint', '::'] },
    ],
  },
  // Earthly
  {
    files: ['Earthfile'],
    icon: ICON_MAKE,
    actions: [
      { id: 'earthly:build', label: 'earthly +build', command: 'earthly', args: ['+build'] },
      { id: 'earthly:test', label: 'earthly +test', command: 'earthly', args: ['+test'] },
    ],
  },
  // Hardhat (Solidity)
  {
    files: ['hardhat.config.ts', 'hardhat.config.js'],
    icon: ICON_BLOCKCHAIN,
    actions: [
      { id: 'hardhat:compile', label: 'npx hardhat compile', command: 'npx', args: ['hardhat', 'compile'] },
      { id: 'hardhat:test', label: 'npx hardhat test', command: 'npx', args: ['hardhat', 'test'] },
      { id: 'hardhat:node', label: 'npx hardhat node', command: 'npx', args: ['hardhat', 'node'] },
    ],
  },
  // Anchor (Solana)
  {
    files: ['Anchor.toml'],
    icon: ICON_BLOCKCHAIN,
    actions: [
      { id: 'anchor:build', label: 'anchor build', command: 'anchor', args: ['build'] },
      { id: 'anchor:test', label: 'anchor test', command: 'anchor', args: ['test'] },
      { id: 'anchor:deploy', label: 'anchor deploy', command: 'anchor', args: ['deploy'] },
    ],
  },
  // Truffle (Solidity)
  {
    files: ['truffle-config.js'],
    icon: ICON_BLOCKCHAIN,
    actions: [
      { id: 'truffle:compile', label: 'truffle compile', command: 'truffle', args: ['compile'] },
      { id: 'truffle:test', label: 'truffle test', command: 'truffle', args: ['test'] },
      { id: 'truffle:migrate', label: 'truffle migrate', command: 'truffle', args: ['migrate'] },
    ],
  },
  // Nx (monorepo)
  {
    files: ['nx.json'],
    icon: ICON_NODE,
    actions: [
      { id: 'nx:build', label: 'npx nx run-many --target=build', command: 'npx', args: ['nx', 'run-many', '--target=build'] },
      { id: 'nx:test', label: 'npx nx run-many --target=test', command: 'npx', args: ['nx', 'run-many', '--target=test'] },
      { id: 'nx:affected', label: 'npx nx affected', command: 'npx', args: ['nx', 'affected'] },
    ],
  },
  // Turbo (monorepo)
  {
    files: ['turbo.json'],
    icon: ICON_NODE,
    actions: [
      { id: 'turbo:build', label: 'npx turbo run build', command: 'npx', args: ['turbo', 'run', 'build'] },
      { id: 'turbo:test', label: 'npx turbo run test', command: 'npx', args: ['turbo', 'run', 'test'] },
      { id: 'turbo:lint', label: 'npx turbo run lint', command: 'npx', args: ['turbo', 'run', 'lint'] },
    ],
  },
  // CocoaPods
  {
    files: ['Podfile'],
    icon: ICON_SWIFT,
    actions: [
      { id: 'pod:install', label: 'pod install', command: 'pod', args: ['install'] },
      { id: 'pod:update', label: 'pod update', command: 'pod', args: ['update'] },
    ],
  },
  // Protobuf / Buf
  {
    files: ['buf.yaml'],
    icon: ICON_MAKE,
    actions: [
      { id: 'buf:generate', label: 'buf generate', command: 'buf', args: ['generate'] },
      { id: 'buf:lint', label: 'buf lint', command: 'buf', args: ['lint'] },
      { id: 'buf:build', label: 'buf build', command: 'buf', args: ['build'] },
    ],
  },
  // OpenAPI
  {
    files: ['openapi.yaml', 'openapi.json', 'swagger.yaml', 'swagger.json'],
    icon: ICON_DOC,
    actions: [
      { id: 'openapi:validate', label: 'openapi-generator validate -i openapi.yaml', command: 'openapi-generator', args: ['validate', '-i', 'openapi.yaml'] },
    ],
  },
  // Standalone Dockerfile (without compose)
  {
    files: ['Dockerfile'],
    icon: ICON_DOCKER,
    actions: [
      { id: 'docker:build-image', label: 'docker build .', command: 'docker', args: ['build', '.'] },
    ],
  },
]

function detectStatic(dir: string): QuickAction[] {
  const actions: QuickAction[] = []
  for (const d of STATIC_DETECTORS) {
    if (d.files.some(f => fs.existsSync(path.join(dir, f)))) {
      actions.push(...d.actions.map(a => ({ ...a, icon: d.icon, source: 'detected' as const })))
    }
  }
  return actions
}

function detectGradle(dir: string): QuickAction[] {
  const hasGroovy = fs.existsSync(path.join(dir, 'build.gradle'))
  const hasKotlin = fs.existsSync(path.join(dir, 'build.gradle.kts'))
  if (!hasGroovy && !hasKotlin) return []
  const cmd = fs.existsSync(path.join(dir, 'gradlew')) ? './gradlew' : 'gradle'
  return [
    { id: 'gradle:build', label: `${cmd} build`, icon: ICON_JAVA, command: cmd, args: ['build'], source: 'detected' },
    { id: 'gradle:test', label: `${cmd} test`, icon: ICON_JAVA, command: cmd, args: ['test'], source: 'detected' },
    { id: 'gradle:run', label: `${cmd} run`, icon: ICON_JAVA, command: cmd, args: ['run'], source: 'detected' },
    { id: 'gradle:clean', label: `${cmd} clean`, icon: ICON_JAVA, command: cmd, args: ['clean'], source: 'detected' },
  ]
}

// ---- Parseable task runners ----

function detectJust(dir: string): QuickAction[] {
  const justfile = ['justfile', 'Justfile'].map(f => path.join(dir, f)).find(f => fs.existsSync(f))
  if (!justfile) return []
  const actions: QuickAction[] = []
  try {
    const content = fs.readFileSync(justfile, 'utf-8')
    const recipeRe = /^@?([a-zA-Z_][a-zA-Z0-9_-]*)[^:=]*:(?!=)/gm
    const seen = new Set<string>()
    let match
    while ((match = recipeRe.exec(content)) !== null) {
      const recipe = match[1]!
      if (seen.has(recipe)) continue
      seen.add(recipe)
      actions.push({ id: `just:${recipe}`, label: `just ${recipe}`, icon: ICON_MAKE, command: 'just', args: [recipe], source: 'detected' })
    }
  } catch {}
  return actions
}

function detectTaskfile(dir: string): QuickAction[] {
  const taskfile = ['Taskfile.yml', 'Taskfile.yaml'].map(f => path.join(dir, f)).find(f => fs.existsSync(f))
  if (!taskfile) return []
  const actions: QuickAction[] = []
  try {
    const content = fs.readFileSync(taskfile, 'utf-8')
    const tasksIdx = content.search(/^tasks:\s*$/m)
    if (tasksIdx < 0) return []
    const afterTasks = content.slice(tasksIdx)
    const taskRe = /^  ([a-zA-Z_][a-zA-Z0-9_:-]*):/gm
    const seen = new Set<string>()
    let match
    while ((match = taskRe.exec(afterTasks)) !== null) {
      const task = match[1]!
      if (seen.has(task)) continue
      seen.add(task)
      actions.push({ id: `task:${task}`, label: `task ${task}`, icon: ICON_MAKE, command: 'task', args: [task], source: 'detected' })
    }
  } catch {}
  return actions
}

function detectRake(dir: string): QuickAction[] {
  const rakefile = path.join(dir, 'Rakefile')
  if (!fs.existsSync(rakefile)) return []
  const actions: QuickAction[] = []
  try {
    const content = fs.readFileSync(rakefile, 'utf-8')
    const taskRe = /task\s+[:'"]([a-zA-Z_][a-zA-Z0-9_:]*)/gm
    const seen = new Set<string>()
    let match
    while ((match = taskRe.exec(content)) !== null) {
      const task = match[1]!
      if (seen.has(task)) continue
      seen.add(task)
      actions.push({ id: `rake:${task}`, label: `rake ${task}`, icon: ICON_RUBY, command: 'rake', args: [task], source: 'detected' })
    }
  } catch {}
  return actions
}

// ---- Framework detection ----

function detectDjango(dir: string): QuickAction[] {
  if (!fs.existsSync(path.join(dir, 'manage.py'))) return []
  return [
    { id: 'django:runserver', label: 'python manage.py runserver', icon: ICON_PYTHON, command: 'python', args: ['manage.py', 'runserver'], source: 'detected' },
    { id: 'django:test', label: 'python manage.py test', icon: ICON_PYTHON, command: 'python', args: ['manage.py', 'test'], source: 'detected' },
    { id: 'django:migrate', label: 'python manage.py migrate', icon: ICON_PYTHON, command: 'python', args: ['manage.py', 'migrate'], source: 'detected' },
    { id: 'django:makemigrations', label: 'python manage.py makemigrations', icon: ICON_PYTHON, command: 'python', args: ['manage.py', 'makemigrations'], source: 'detected' },
    { id: 'django:shell', label: 'python manage.py shell', icon: ICON_PYTHON, command: 'python', args: ['manage.py', 'shell'], source: 'detected' },
  ]
}

function detectLaravel(dir: string): QuickAction[] {
  if (!fs.existsSync(path.join(dir, 'artisan'))) return []
  return [
    { id: 'laravel:serve', label: 'php artisan serve', icon: ICON_PHP, command: 'php', args: ['artisan', 'serve'], source: 'detected' },
    { id: 'laravel:migrate', label: 'php artisan migrate', icon: ICON_PHP, command: 'php', args: ['artisan', 'migrate'], source: 'detected' },
    { id: 'laravel:test', label: 'php artisan test', icon: ICON_PHP, command: 'php', args: ['artisan', 'test'], source: 'detected' },
    { id: 'laravel:tinker', label: 'php artisan tinker', icon: ICON_PHP, command: 'php', args: ['artisan', 'tinker'], source: 'detected' },
  ]
}

function detectRails(dir: string): QuickAction[] {
  if (!fs.existsSync(path.join(dir, 'bin', 'rails')) && !fs.existsSync(path.join(dir, 'config', 'routes.rb'))) return []
  return [
    { id: 'rails:server', label: 'rails server', icon: ICON_RUBY, command: 'rails', args: ['server'], source: 'detected' },
    { id: 'rails:console', label: 'rails console', icon: ICON_RUBY, command: 'rails', args: ['console'], source: 'detected' },
    { id: 'rails:test', label: 'rails test', icon: ICON_RUBY, command: 'rails', args: ['test'], source: 'detected' },
    { id: 'rails:db:migrate', label: 'rails db:migrate', icon: ICON_RUBY, command: 'rails', args: ['db:migrate'], source: 'detected' },
  ]
}

function detectJekyll(dir: string): QuickAction[] {
  if (!fs.existsSync(path.join(dir, '_config.yml'))) return []
  if (!fs.existsSync(path.join(dir, '_posts')) && !fs.existsSync(path.join(dir, '_layouts'))) return []
  return [
    { id: 'jekyll:serve', label: 'bundle exec jekyll serve', icon: ICON_RUBY, command: 'bundle', args: ['exec', 'jekyll', 'serve'], source: 'detected' },
    { id: 'jekyll:build', label: 'jekyll build', icon: ICON_RUBY, command: 'jekyll', args: ['build'], source: 'detected' },
  ]
}

// ---- Directory-scanning detectors (glob by extension) ----

function detectDotNet(dir: string): QuickAction[] {
  try {
    const entries = fs.readdirSync(dir)
    if (!entries.some(e => e.endsWith('.sln') || e.endsWith('.csproj') || e.endsWith('.fsproj'))) return []
    return [
      { id: 'dotnet:restore', label: 'dotnet restore', icon: ICON_DOTNET, command: 'dotnet', args: ['restore'], source: 'detected' },
      { id: 'dotnet:build', label: 'dotnet build', icon: ICON_DOTNET, command: 'dotnet', args: ['build'], source: 'detected' },
      { id: 'dotnet:run', label: 'dotnet run', icon: ICON_DOTNET, command: 'dotnet', args: ['run'], source: 'detected' },
      { id: 'dotnet:test', label: 'dotnet test', icon: ICON_DOTNET, command: 'dotnet', args: ['test'], source: 'detected' },
    ]
  } catch { return [] }
}

function detectJupyter(dir: string): QuickAction[] {
  try {
    const entries = fs.readdirSync(dir)
    if (!entries.some(e => e.endsWith('.ipynb'))) return []
    return [
      { id: 'jupyter:lab', label: 'jupyter lab', icon: ICON_PYTHON, command: 'jupyter', args: ['lab'], source: 'detected' },
      { id: 'jupyter:notebook', label: 'jupyter notebook', icon: ICON_PYTHON, command: 'jupyter', args: ['notebook'], source: 'detected' },
    ]
  } catch { return [] }
}

function detectXcode(dir: string): QuickAction[] {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    if (!entries.some(e => e.isDirectory() && (e.name.endsWith('.xcodeproj') || e.name.endsWith('.xcworkspace')))) return []
    return [
      { id: 'xcode:build', label: 'xcodebuild build', icon: ICON_SWIFT, command: 'xcodebuild', args: ['build'], source: 'detected' },
      { id: 'xcode:test', label: 'xcodebuild test', icon: ICON_SWIFT, command: 'xcodebuild', args: ['test'], source: 'detected' },
    ]
  } catch { return [] }
}

function detectCabal(dir: string): QuickAction[] {
  try {
    const entries = fs.readdirSync(dir)
    if (!entries.some(e => e.endsWith('.cabal'))) return []
    return [
      { id: 'cabal:build', label: 'cabal build', icon: ICON_HASKELL, command: 'cabal', args: ['build'], source: 'detected' },
      { id: 'cabal:run', label: 'cabal run', icon: ICON_HASKELL, command: 'cabal', args: ['run'], source: 'detected' },
      { id: 'cabal:test', label: 'cabal test', icon: ICON_HASKELL, command: 'cabal', args: ['test'], source: 'detected' },
    ]
  } catch { return [] }
}

function detectNimble(dir: string): QuickAction[] {
  try {
    const entries = fs.readdirSync(dir)
    if (!entries.some(e => e.endsWith('.nimble'))) return []
    return [
      { id: 'nimble:build', label: 'nimble build', icon: ICON_MAKE, command: 'nimble', args: ['build'], source: 'detected' },
      { id: 'nimble:run', label: 'nimble run', icon: ICON_MAKE, command: 'nimble', args: ['run'], source: 'detected' },
      { id: 'nimble:test', label: 'nimble test', icon: ICON_MAKE, command: 'nimble', args: ['test'], source: 'detected' },
    ]
  } catch { return [] }
}

// ---- Special project type detection ----

function detectTauri(dir: string): QuickAction[] {
  if (!fs.existsSync(path.join(dir, 'src-tauri', 'tauri.conf.json'))) return []
  return [
    { id: 'tauri:dev', label: 'cargo tauri dev', icon: ICON_RUST, command: 'cargo', args: ['tauri', 'dev'], source: 'detected' },
    { id: 'tauri:build', label: 'cargo tauri build', icon: ICON_RUST, command: 'cargo', args: ['tauri', 'build'], source: 'detected' },
  ]
}

function detectUnity(dir: string): QuickAction[] {
  if (!fs.existsSync(path.join(dir, 'ProjectSettings', 'ProjectVersion.txt'))) return []
  return [
    { id: 'unity:open', label: 'unity -projectPath .', icon: ICON_GAME, command: 'unity', args: ['-projectPath', '.'], source: 'detected' },
  ]
}

function detectLove2D(dir: string): QuickAction[] {
  if (!fs.existsSync(path.join(dir, 'main.lua')) || !fs.existsSync(path.join(dir, 'conf.lua'))) return []
  return [
    { id: 'love:run', label: 'love .', icon: ICON_GAME, command: 'love', args: ['.'], source: 'detected' },
  ]
}

function detectGit(dir: string): QuickAction[] {
  if (!fs.existsSync(path.join(dir, '.git'))) return []
  return [
    { id: 'git:status', label: 'git status', icon: ICON_GIT, command: 'git', args: ['status'], source: 'detected' },
    { id: 'git:pull', label: 'git pull', icon: ICON_GIT, command: 'git', args: ['pull'], source: 'detected' },
    { id: 'git:log', label: 'git log --oneline -20', icon: ICON_GIT, command: 'git', args: ['log', '--oneline', '-20'], source: 'detected' },
  ]
}

export function detectQuickActions(projectPath: string): QuickAction[] {
  return [
    ...detectNode(projectPath),
    ...detectPython(projectPath),
    ...detectMake(projectPath),
    ...detectJust(projectPath),
    ...detectTaskfile(projectPath),
    ...detectRake(projectPath),
    ...detectMaven(projectPath),
    ...detectGradle(projectPath),
    ...detectDjango(projectPath),
    ...detectLaravel(projectPath),
    ...detectRails(projectPath),
    ...detectJekyll(projectPath),
    ...detectDotNet(projectPath),
    ...detectJupyter(projectPath),
    ...detectXcode(projectPath),
    ...detectCabal(projectPath),
    ...detectNimble(projectPath),
    ...detectTauri(projectPath),
    ...detectUnity(projectPath),
    ...detectLove2D(projectPath),
    ...detectGit(projectPath),
    ...detectStatic(projectPath),
  ]
}

// ---- Custom actions persistence ----

const ACTIONS_DIR = '.pina'
const ACTIONS_FILE = 'actions.json'

function actionsFilePath(projectPath: string): string {
  return path.join(projectPath, ACTIONS_DIR, ACTIONS_FILE)
}

export function loadCustomActions(projectPath: string): QuickAction[] {
  const fp = actionsFilePath(projectPath)
  if (!fs.existsSync(fp)) return []
  try {
    const raw = JSON.parse(fs.readFileSync(fp, 'utf-8'))
    if (!Array.isArray(raw)) return []
    return raw.map((entry: any) => ({
      id: entry.id ?? `custom:${entry.label}`,
      label: entry.label ?? `${entry.command} ${(entry.args ?? []).join(' ')}`,
      icon: entry.icon ?? ICON_CUSTOM,
      command: entry.command,
      args: entry.args ?? [],
      source: 'custom' as const,
    }))
  } catch {
    return []
  }
}

export function saveCustomActions(projectPath: string, actions: QuickAction[]): void {
  const dir = path.join(projectPath, ACTIONS_DIR)
  fs.mkdirSync(dir, { recursive: true })
  const data = actions.map(a => ({
    id: a.id,
    label: a.label,
    command: a.command,
    args: a.args,
  }))
  fs.writeFileSync(actionsFilePath(projectPath), JSON.stringify(data, null, 2), 'utf-8')
}

export function removeCustomAction(projectPath: string, actionId: string): boolean {
  const existing = loadCustomActions(projectPath)
  const filtered = existing.filter(a => a.id !== actionId)
  if (filtered.length === existing.length) return false
  saveCustomActions(projectPath, filtered)
  return true
}

// ---- Merge detected + custom ----

export function getQuickActions(projectPath: string): QuickAction[] {
  const detected = detectQuickActions(projectPath)
  const custom = loadCustomActions(projectPath)
  const customIds = new Set(custom.map(a => a.id))
  const merged = detected.filter(a => !customIds.has(a.id))
  return [...custom, ...merged]
}

// ---- Actions metadata: defaults + LRU history ----

interface ActionsMeta {
  defaults: string[] // action ids always shown on surface
  history: string[]  // most-recently-used action ids (newest first)
}

function metaFilePath(projectPath: string): string {
  return path.join(projectPath, ACTIONS_DIR, 'actions-meta.json')
}

export function loadActionsMeta(projectPath: string): ActionsMeta {
  const fp = metaFilePath(projectPath)
  if (!fs.existsSync(fp)) return { defaults: [], history: [] }
  try {
    const raw = JSON.parse(fs.readFileSync(fp, 'utf-8'))
    return {
      defaults: Array.isArray(raw.defaults) ? raw.defaults : [],
      history: Array.isArray(raw.history) ? raw.history : [],
    }
  } catch {
    return { defaults: [], history: [] }
  }
}

export function saveActionsMeta(projectPath: string, meta: ActionsMeta): void {
  const dir = path.join(projectPath, ACTIONS_DIR)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(metaFilePath(projectPath), JSON.stringify(meta, null, 2), 'utf-8')
}

export function recordActionUsage(projectPath: string, actionId: string): void {
  const meta = loadActionsMeta(projectPath)
  meta.history = [actionId, ...meta.history.filter(id => id !== actionId)].slice(0, 50)
  saveActionsMeta(projectPath, meta)
}

/** Returns 'added' | 'removed' | 'limit_reached' */
export function toggleDefault(projectPath: string, actionId: string): 'added' | 'removed' | 'limit_reached' {
  const meta = loadActionsMeta(projectPath)
  const idx = meta.defaults.indexOf(actionId)
  if (idx >= 0) {
    meta.defaults.splice(idx, 1)
    saveActionsMeta(projectPath, meta)
    return 'removed'
  } else {
    if (meta.defaults.length >= MAX_DEFAULTS) return 'limit_reached'
    meta.defaults.push(actionId)
    saveActionsMeta(projectPath, meta)
    return 'added'
  }
}

const MAX_DEFAULTS = 5
const MAX_SURFACE = 5

/** Returns up to MAX_SURFACE actions: defaults first (always shown), then LRU / suggested fill. */
export function getSurfaceActions(projectPath: string): QuickAction[] {
  const all = getQuickActions(projectPath)
  if (all.length === 0) return []
  const meta = loadActionsMeta(projectPath)
  const byId = new Map(all.map(a => [a.id, a]))
  const surface: QuickAction[] = []
  const seen = new Set<string>()

  // Defaults always show (count toward limit)
  for (const id of meta.defaults) {
    const a = byId.get(id)
    if (a && !seen.has(id)) {
      surface.push(a)
      seen.add(id)
    }
  }

  // Fill remaining slots with LRU history
  for (const id of meta.history) {
    if (surface.length >= MAX_SURFACE) break
    const a = byId.get(id)
    if (a && !seen.has(id)) {
      surface.push(a)
      seen.add(id)
    }
  }

  // Fill with suggested priorities
  for (const id of PRIMARY_IDS) {
    if (surface.length >= MAX_SURFACE) break
    const a = byId.get(id)
    if (a && !seen.has(id)) {
      surface.push(a)
      seen.add(id)
    }
  }

  // Last resort: fill from all
  for (const a of all) {
    if (surface.length >= MAX_SURFACE) break
    if (!seen.has(a.id)) {
      surface.push(a)
      seen.add(a.id)
    }
  }

  return surface
}

// ---- AI agent prompt ----

export const ACTIONS_AGENT_PROMPT = `You are a project setup assistant. Analyze this project's structure and generate a \`.pina/actions.json\` file containing useful quick actions.

Look at the project's build system, scripts, Makefile targets, and common development workflows. Output a JSON array where each entry has:
- "id": unique identifier like "custom:deploy"
- "label": human-readable name shown in the menu
- "command": the executable to run
- "args": array of arguments

Focus on: build, test, lint, format, dev server, deploy, clean, and any project-specific workflows.

Write the file to \`.pina/actions.json\` in the project root.`
