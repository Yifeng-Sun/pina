#!/usr/bin/env node

// src/cli.ts
import { Command } from "commander";
import { render } from "ink";
import React7 from "react";

// src/commands/init.tsx
import { useEffect, useState } from "react";
import { Text, Box } from "ink";
import path4 from "path";

// src/lib/config.ts
import fs from "fs";
import path from "path";
import os from "os";
import { parse, stringify } from "yaml";

// src/lib/schema.ts
import { z } from "zod";
var StageSchema = z.enum([
  "planning",
  "scaffolding",
  "development",
  "stable",
  "complete",
  "archived"
]);
var StatusSchema = z.enum(["active", "paused"]);
var ProjectSchema = z.object({
  name: z.string(),
  path: z.string(),
  stage: StageSchema,
  status: StatusSchema,
  stale: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  venv: z.string().optional(),
  remote: z.string().optional(),
  aiConfig: z.string().optional(),
  created: z.string(),
  lastSwitched: z.string().optional(),
  xp: z.number().default(0),
  notes: z.array(z.string()).default([]),
  milestones: z.record(z.string(), z.string()).default({}),
  stats: z.object({
    switches: z.number().default(0),
    commitsAtRegistration: z.number().default(0)
  }).default({ switches: 0, commitsAtRegistration: 0 })
});
var PinaConfigSchema = z.object({
  activeProject: z.string().optional(),
  symlinkPath: z.string().default("~/current"),
  scanDirs: z.array(z.string()).default([])
});
var PinaRegistrySchema = z.object({
  config: PinaConfigSchema.default({
    symlinkPath: "~/current",
    scanDirs: []
  }),
  projects: z.record(z.string(), ProjectSchema).default({})
});

// src/lib/config.ts
var PINA_DIR = path.join(os.homedir(), ".pina");
var REGISTRY_PATH = path.join(PINA_DIR, "projects.yml");
function ensurePinaDir() {
  if (!fs.existsSync(PINA_DIR)) {
    fs.mkdirSync(PINA_DIR, { recursive: true });
  }
}
function loadRegistry() {
  ensurePinaDir();
  if (!fs.existsSync(REGISTRY_PATH)) {
    const empty = PinaRegistrySchema.parse({});
    saveRegistry(empty);
    return empty;
  }
  const raw = fs.readFileSync(REGISTRY_PATH, "utf-8");
  const parsed = parse(raw) ?? {};
  return PinaRegistrySchema.parse(parsed);
}
function saveRegistry(registry) {
  ensurePinaDir();
  const content = stringify(registry, { indent: 2 });
  fs.writeFileSync(REGISTRY_PATH, content, "utf-8");
}
function getProject(name) {
  const registry = loadRegistry();
  return registry.projects[name];
}
function setProject(name, project) {
  const registry = loadRegistry();
  registry.projects[name] = project;
  saveRegistry(registry);
}
function getActiveProject() {
  const registry = loadRegistry();
  if (!registry.config.activeProject) return void 0;
  return registry.projects[registry.config.activeProject];
}
function setActiveProject(name) {
  const registry = loadRegistry();
  registry.config.activeProject = name;
  saveRegistry(registry);
}
function createProject(name, projectPath, options = {}) {
  const now = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const project = {
    name,
    path: projectPath,
    stage: "planning",
    status: "active",
    stale: false,
    tags: [],
    xp: 0,
    notes: [],
    milestones: { born: now },
    stats: { switches: 0, commitsAtRegistration: 0 },
    created: now,
    ...options
  };
  setProject(name, project);
  return project;
}

// src/lib/git.ts
import { execSync } from "child_process";
import fs2 from "fs";
import path2 from "path";
function isGitRepo(dir) {
  return fs2.existsSync(path2.join(dir, ".git"));
}
function getRemoteUrl(dir) {
  if (!isGitRepo(dir)) return void 0;
  try {
    const url = execSync("git config --get remote.origin.url", {
      cwd: dir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    return url || void 0;
  } catch {
    return void 0;
  }
}
function getCommitCount(dir) {
  if (!isGitRepo(dir)) return 0;
  try {
    const count = execSync("git rev-list --count HEAD", {
      cwd: dir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    return parseInt(count, 10) || 0;
  } catch {
    return 0;
  }
}
function getCurrentBranch(dir) {
  if (!isGitRepo(dir)) return void 0;
  try {
    return execSync("git branch --show-current", {
      cwd: dir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    }).trim() || void 0;
  } catch {
    return void 0;
  }
}
function isDirty(dir) {
  if (!isGitRepo(dir)) return false;
  try {
    const output = execSync("git status --porcelain", {
      cwd: dir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    return output.length > 0;
  } catch {
    return false;
  }
}

// src/lib/venv.ts
import fs3 from "fs";
import path3 from "path";
function detectVenv(projectPath) {
  const candidates = [".venv", "venv"];
  for (const candidate of candidates) {
    const venvPath = path3.join(projectPath, candidate);
    if (fs3.existsSync(venvPath) && fs3.statSync(venvPath).isDirectory()) {
      const activatePath = path3.join(venvPath, "bin", "activate");
      if (fs3.existsSync(activatePath)) {
        return candidate;
      }
    }
  }
  return void 0;
}
function getActivateCommand(projectPath, venvName) {
  return `source ${path3.join(projectPath, venvName, "bin", "activate")}`;
}

// src/commands/init.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function InitCommand({ path: projectPath }) {
  const [status, setStatus] = useState("loading");
  const [projectName, setProjectName] = useState("");
  useEffect(() => {
    const name = path4.basename(projectPath);
    setProjectName(name);
    const existing = getProject(name);
    if (existing) {
      setStatus("exists");
      return;
    }
    const remote = getRemoteUrl(projectPath);
    const venv = detectVenv(projectPath);
    const commits = getCommitCount(projectPath);
    const stage = commits > 0 ? "scaffolding" : "planning";
    createProject(name, projectPath, {
      stage,
      remote,
      venv,
      stats: { switches: 0, commitsAtRegistration: commits },
      milestones: {
        born: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        ...isGitRepo(projectPath) ? { git_linked: (/* @__PURE__ */ new Date()).toISOString().split("T")[0] } : {},
        ...venv ? { venv_linked: (/* @__PURE__ */ new Date()).toISOString().split("T")[0] } : {}
      }
    });
    setStatus("done");
  }, [projectPath]);
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", padding: 1, children: [
    status === "loading" && /* @__PURE__ */ jsx(Text, { color: "yellow", children: "Initializing project..." }),
    status === "exists" && /* @__PURE__ */ jsxs(Text, { color: "red", children: [
      'Project "',
      projectName,
      '" is already registered.'
    ] }),
    status === "done" && /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      /* @__PURE__ */ jsxs(Text, { color: "green", children: [
        'Registered "',
        projectName,
        '" as a pina project.'
      ] }),
      /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        "Path: ",
        projectPath
      ] })
    ] })
  ] });
}

// src/commands/list.tsx
import { Text as Text4, Box as Box3 } from "ink";

// src/components/ProjectTable.tsx
import { Text as Text3, Box as Box2 } from "ink";

// src/components/StatusBadge.tsx
import { Text as Text2 } from "ink";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var STAGE_COLORS = {
  planning: "magenta",
  scaffolding: "yellow",
  development: "cyan",
  stable: "green",
  complete: "blue",
  archived: "gray"
};
function StatusBadge({ stage, stale, status }) {
  if (status === "paused") {
    return /* @__PURE__ */ jsx2(Text2, { color: "yellow", bold: true, children: "[paused]" });
  }
  if (stale) {
    return /* @__PURE__ */ jsxs2(Text2, { color: "red", children: [
      "[",
      stage,
      " \xB7 stale]"
    ] });
  }
  const color = STAGE_COLORS[stage];
  return /* @__PURE__ */ jsxs2(Text2, { color, children: [
    "[",
    stage,
    "]"
  ] });
}

// src/components/ProjectTable.tsx
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function ProjectTable({ projects, activeProject }) {
  const maxName = Math.max(...projects.map((p) => p.name.length), 4);
  const maxPath = Math.max(...projects.map((p) => p.path.length), 4);
  return /* @__PURE__ */ jsxs3(Box2, { flexDirection: "column", children: [
    /* @__PURE__ */ jsxs3(Box2, { gap: 2, children: [
      /* @__PURE__ */ jsxs3(Text3, { bold: true, dimColor: true, children: [
        "  ",
        "Name".padEnd(maxName)
      ] }),
      /* @__PURE__ */ jsx3(Text3, { bold: true, dimColor: true, children: "Stage".padEnd(14) }),
      /* @__PURE__ */ jsx3(Text3, { bold: true, dimColor: true, children: "Tags".padEnd(20) }),
      /* @__PURE__ */ jsx3(Text3, { bold: true, dimColor: true, children: "Last Switched".padEnd(12) }),
      /* @__PURE__ */ jsx3(Text3, { bold: true, dimColor: true, children: "XP" })
    ] }),
    projects.map((project) => {
      const isActive = project.name === activeProject;
      const marker = isActive ? "\u25B8" : " ";
      return /* @__PURE__ */ jsxs3(Box2, { gap: 2, children: [
        /* @__PURE__ */ jsxs3(Text3, { color: isActive ? "green" : void 0, children: [
          marker,
          " ",
          project.name.padEnd(maxName)
        ] }),
        /* @__PURE__ */ jsx3(Box2, { width: 14, children: /* @__PURE__ */ jsx3(StatusBadge, { stage: project.stage, stale: project.stale, status: project.status }) }),
        /* @__PURE__ */ jsx3(Text3, { dimColor: true, children: (project.tags.join(", ") || "\u2014").padEnd(20) }),
        /* @__PURE__ */ jsx3(Text3, { dimColor: true, children: (project.lastSwitched ?? "\u2014").padEnd(12) }),
        /* @__PURE__ */ jsx3(Text3, { color: "yellow", children: project.xp })
      ] }, project.name);
    })
  ] });
}

// src/commands/list.tsx
import { jsx as jsx4 } from "react/jsx-runtime";
function ListCommand({ stage, tag }) {
  const registry = loadRegistry();
  let projects = Object.values(registry.projects);
  if (stage) {
    projects = projects.filter((p) => p.stage === stage);
  }
  if (tag) {
    projects = projects.filter((p) => p.tags.includes(tag));
  }
  if (projects.length === 0) {
    return /* @__PURE__ */ jsx4(Box3, { padding: 1, children: /* @__PURE__ */ jsx4(Text4, { dimColor: true, children: "No projects found. Run `pina init` or `pina scan` to add projects." }) });
  }
  return /* @__PURE__ */ jsx4(Box3, { padding: 1, children: /* @__PURE__ */ jsx4(ProjectTable, { projects, activeProject: registry.config.activeProject }) });
}

// src/commands/switch.tsx
import { useEffect as useEffect2, useState as useState2 } from "react";
import { Text as Text5, Box as Box4 } from "ink";

// src/lib/symlink.ts
import fs4 from "fs";
import os2 from "os";
function resolveSymlinkPath() {
  const registry = loadRegistry();
  return registry.config.symlinkPath.replace(/^~/, os2.homedir());
}
function updateSymlink(targetPath) {
  const linkPath = resolveSymlinkPath();
  if (fs4.existsSync(linkPath) || fs4.lstatSync(linkPath).isSymbolicLink()) {
    fs4.unlinkSync(linkPath);
  }
  fs4.symlinkSync(targetPath, linkPath, "dir");
}
function removeSymlink() {
  const linkPath = resolveSymlinkPath();
  try {
    if (fs4.lstatSync(linkPath).isSymbolicLink()) {
      fs4.unlinkSync(linkPath);
    }
  } catch {
  }
}

// src/commands/switch.tsx
import { jsx as jsx5, jsxs as jsxs4 } from "react/jsx-runtime";
function SwitchCommand({ name }) {
  const [status, setStatus] = useState2("loading");
  const [venvCommand, setVenvCommand] = useState2();
  useEffect2(() => {
    const project = getProject(name);
    if (!project) {
      setStatus("not_found");
      return;
    }
    const now = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    project.stats.switches += 1;
    project.lastSwitched = now;
    project.xp += 1;
    if (!project.milestones.first_switch) {
      project.milestones.first_switch = now;
    }
    if (project.stats.switches >= 10 && !project.milestones.ten_switches) {
      project.milestones.ten_switches = now;
    }
    try {
      updateSymlink(project.path);
    } catch {
    }
    setActiveProject(name);
    setProject(name, project);
    if (project.venv) {
      setVenvCommand(getActivateCommand(project.path, project.venv));
    }
    setStatus("done");
  }, [name]);
  return /* @__PURE__ */ jsxs4(Box4, { flexDirection: "column", padding: 1, children: [
    status === "loading" && /* @__PURE__ */ jsx5(Text5, { color: "yellow", children: "Switching..." }),
    status === "not_found" && /* @__PURE__ */ jsxs4(Text5, { color: "red", children: [
      'Project "',
      name,
      '" not found.'
    ] }),
    status === "done" && /* @__PURE__ */ jsxs4(Box4, { flexDirection: "column", children: [
      /* @__PURE__ */ jsxs4(Text5, { color: "green", children: [
        'Switched to "',
        name,
        '"'
      ] }),
      venvCommand && /* @__PURE__ */ jsxs4(Text5, { dimColor: true, children: [
        "Activate venv: ",
        venvCommand
      ] })
    ] })
  ] });
}

// src/commands/status.tsx
import { Text as Text6, Box as Box5 } from "ink";

// src/types.ts
var MILESTONE_LABELS = {
  born: "Project created",
  first_note: "First note",
  git_linked: "Git connected",
  venv_linked: "Environment set up",
  ai_configured: "AI skills linked",
  first_switch: "First switched to",
  ten_switches: "Frequent flyer",
  first_commit: "First commit",
  fifty_commits: "Fifty commits deep",
  first_branch: "First branch",
  one_week: "One week old",
  one_month: "One month in",
  one_year: "Survived a year",
  revived: "Back from the dead",
  first_release: "First release",
  completed: "Completed",
  archived: "Put to rest"
};

// src/commands/status.tsx
import { jsx as jsx6, jsxs as jsxs5 } from "react/jsx-runtime";
function StatusCommand() {
  const registry = loadRegistry();
  const project = getActiveProject();
  if (!project) {
    return /* @__PURE__ */ jsx6(Box5, { padding: 1, children: /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "No active project. Run `pina switch <name>` to select one." }) });
  }
  const branch = getCurrentBranch(project.path);
  const dirty = isDirty(project.path);
  const commits = getCommitCount(project.path);
  return /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", padding: 1, gap: 1, children: [
    /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", children: [
      /* @__PURE__ */ jsxs5(Box5, { gap: 2, children: [
        /* @__PURE__ */ jsx6(Text6, { bold: true, children: project.name }),
        /* @__PURE__ */ jsx6(StatusBadge, { stage: project.stage, stale: project.stale, status: project.status })
      ] }),
      /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: project.path })
    ] }),
    /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", children: [
      branch && /* @__PURE__ */ jsxs5(Text6, { children: [
        "Branch: ",
        /* @__PURE__ */ jsx6(Text6, { color: "cyan", children: branch }),
        dirty ? /* @__PURE__ */ jsx6(Text6, { color: "yellow", children: " (dirty)" }) : ""
      ] }),
      project.remote && /* @__PURE__ */ jsxs5(Text6, { children: [
        "Remote: ",
        /* @__PURE__ */ jsx6(Text6, { color: "blue", children: project.remote })
      ] }),
      /* @__PURE__ */ jsxs5(Text6, { children: [
        "Commits: ",
        commits,
        " | Switches: ",
        project.stats.switches,
        " | XP: ",
        project.xp
      ] }),
      project.tags.length > 0 && /* @__PURE__ */ jsxs5(Text6, { children: [
        "Tags: ",
        project.tags.join(", ")
      ] })
    ] }),
    project.notes.length > 0 && /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx6(Text6, { bold: true, children: "Notes:" }),
      project.notes.slice(-3).map((note, i) => /* @__PURE__ */ jsxs5(Text6, { dimColor: true, children: [
        "  - ",
        note
      ] }, i))
    ] }),
    Object.keys(project.milestones).length > 0 && /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx6(Text6, { bold: true, children: "Milestones:" }),
      Object.entries(project.milestones).map(([key, date]) => /* @__PURE__ */ jsxs5(Text6, { dimColor: true, children: [
        "  ",
        MILESTONE_LABELS[key] ?? key,
        ": ",
        date
      ] }, key))
    ] })
  ] });
}

// src/commands/new.tsx
import { useEffect as useEffect3, useState as useState3 } from "react";
import { Text as Text7, Box as Box6 } from "ink";
import path5 from "path";
import fs5 from "fs";
import { jsx as jsx7, jsxs as jsxs6 } from "react/jsx-runtime";
function NewCommand({ name, path: inputPath }) {
  const [status, setStatus] = useState3("loading");
  const [resolvedPath, setResolvedPath] = useState3("");
  useEffect3(() => {
    const projectPath = inputPath ? path5.resolve(inputPath.replace(/^~/, process.env["HOME"] ?? "")) : process.cwd();
    setResolvedPath(projectPath);
    if (!fs5.existsSync(projectPath)) {
      setStatus("not_found");
      return;
    }
    const existing = getProject(name);
    if (existing) {
      setStatus("exists");
      return;
    }
    const remote = getRemoteUrl(projectPath);
    const venv = detectVenv(projectPath);
    const commits = getCommitCount(projectPath);
    const stage = commits > 0 ? "scaffolding" : "planning";
    createProject(name, projectPath, {
      stage,
      remote,
      venv,
      stats: { switches: 0, commitsAtRegistration: commits },
      milestones: {
        born: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        ...isGitRepo(projectPath) ? { git_linked: (/* @__PURE__ */ new Date()).toISOString().split("T")[0] } : {},
        ...venv ? { venv_linked: (/* @__PURE__ */ new Date()).toISOString().split("T")[0] } : {}
      }
    });
    setStatus("done");
  }, [name, inputPath]);
  return /* @__PURE__ */ jsxs6(Box6, { flexDirection: "column", padding: 1, children: [
    status === "loading" && /* @__PURE__ */ jsx7(Text7, { color: "yellow", children: "Registering project..." }),
    status === "not_found" && /* @__PURE__ */ jsxs6(Text7, { color: "red", children: [
      "Directory not found: ",
      resolvedPath
    ] }),
    status === "exists" && /* @__PURE__ */ jsxs6(Text7, { color: "red", children: [
      'Project "',
      name,
      '" already exists.'
    ] }),
    status === "done" && /* @__PURE__ */ jsxs6(Box6, { flexDirection: "column", children: [
      /* @__PURE__ */ jsxs6(Text7, { color: "green", children: [
        'Registered "',
        name,
        '" as a pina project.'
      ] }),
      /* @__PURE__ */ jsxs6(Text7, { dimColor: true, children: [
        "Path: ",
        resolvedPath
      ] })
    ] })
  ] });
}

// src/commands/archive.tsx
import { useEffect as useEffect4, useState as useState4 } from "react";
import { Text as Text8, Box as Box7 } from "ink";
import { jsx as jsx8, jsxs as jsxs7 } from "react/jsx-runtime";
function ArchiveCommand({ name }) {
  const [status, setStatus] = useState4("loading");
  useEffect4(() => {
    const project = getProject(name);
    if (!project) {
      setStatus("not_found");
      return;
    }
    const now = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    project.stage = "archived";
    project.status = "paused";
    project.milestones.archived = now;
    setProject(name, project);
    const registry = loadRegistry();
    if (registry.config.activeProject === name) {
      setActiveProject(void 0);
      try {
        removeSymlink();
      } catch {
      }
    }
    setStatus("done");
  }, [name]);
  return /* @__PURE__ */ jsxs7(Box7, { padding: 1, children: [
    status === "loading" && /* @__PURE__ */ jsx8(Text8, { color: "yellow", children: "Archiving..." }),
    status === "not_found" && /* @__PURE__ */ jsxs7(Text8, { color: "red", children: [
      'Project "',
      name,
      '" not found.'
    ] }),
    status === "done" && /* @__PURE__ */ jsxs7(Text8, { color: "green", children: [
      'Archived "',
      name,
      '".'
    ] })
  ] });
}

// src/commands/note.tsx
import { useEffect as useEffect5, useState as useState5 } from "react";
import { Text as Text9, Box as Box8 } from "ink";
import { jsx as jsx9, jsxs as jsxs8 } from "react/jsx-runtime";
function NoteCommand({ text }) {
  const [status, setStatus] = useState5("loading");
  useEffect5(() => {
    const registry = loadRegistry();
    const activeProjectName = registry.config.activeProject;
    if (!activeProjectName || !registry.projects[activeProjectName]) {
      setStatus("no_project");
      return;
    }
    const project = registry.projects[activeProjectName];
    const now = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    project.notes.push(`[${now}] ${text}`);
    project.xp += 1;
    if (!project.milestones.first_note) {
      project.milestones.first_note = now;
    }
    setProject(activeProjectName, project);
    setStatus("done");
  }, [text]);
  return /* @__PURE__ */ jsxs8(Box8, { padding: 1, children: [
    status === "loading" && /* @__PURE__ */ jsx9(Text9, { color: "yellow", children: "Adding note..." }),
    status === "no_project" && /* @__PURE__ */ jsx9(Text9, { color: "red", children: "No active project. Run `pina switch <name>` first." }),
    status === "done" && /* @__PURE__ */ jsx9(Text9, { color: "green", children: "Note added." })
  ] });
}

// src/commands/scan.tsx
import { useState as useState6, useEffect as useEffect6 } from "react";
import { Text as Text10, Box as Box9, useInput, useApp } from "ink";

// src/lib/detector.ts
import fs6 from "fs";
import path6 from "path";
var SIGNALS = [
  { file: "package.json", tags: ["node"] },
  { file: "tsconfig.json", tags: ["typescript"] },
  { file: "pyproject.toml", tags: ["python"] },
  { file: "setup.py", tags: ["python"] },
  { file: "requirements.txt", tags: ["python"] },
  { file: "Cargo.toml", tags: ["rust"] },
  { file: "go.mod", tags: ["go"] },
  { file: "pom.xml", tags: ["java"] },
  { file: "build.gradle", tags: ["java"] },
  { file: "Dockerfile", tags: ["docker"] },
  { file: "docker-compose.yml", tags: ["docker"] },
  { file: "docker-compose.yaml", tags: ["docker"] },
  { file: "CLAUDE.md", tags: ["ai"] },
  { file: ".claude", isDir: true, tags: ["ai"] },
  { file: ".venv", isDir: true, tags: ["python"] },
  { file: "venv", isDir: true, tags: ["python"] }
];
var SKIP_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  ".Trash",
  "__pycache__",
  ".cache"
]);
function detectVenv2(dir) {
  if (fs6.existsSync(path6.join(dir, ".venv"))) return ".venv";
  if (fs6.existsSync(path6.join(dir, "venv"))) return "venv";
  return void 0;
}
function detectAiConfig(dir) {
  if (fs6.existsSync(path6.join(dir, "CLAUDE.md"))) return "CLAUDE.md";
  if (fs6.existsSync(path6.join(dir, ".claude"))) return ".claude";
  return void 0;
}
function detectProject(dir) {
  const name = path6.basename(dir);
  const tags = /* @__PURE__ */ new Set();
  let matched = false;
  for (const signal of SIGNALS) {
    const fullPath = path6.join(dir, signal.file);
    const exists = signal.isDir ? fs6.existsSync(fullPath) && fs6.statSync(fullPath).isDirectory() : fs6.existsSync(fullPath);
    if (exists) {
      matched = true;
      for (const tag of signal.tags) {
        tags.add(tag);
      }
    }
  }
  const hasGit = fs6.existsSync(path6.join(dir, ".git"));
  if (hasGit) matched = true;
  if (!matched) return null;
  return {
    name,
    path: dir,
    tags: [...tags],
    venv: detectVenv2(dir),
    remote: getRemoteUrl(dir),
    hasGit,
    aiConfig: detectAiConfig(dir)
  };
}
function scanDirectory(dir) {
  const resolvedDir = path6.resolve(dir.replace(/^~/, process.env["HOME"] ?? ""));
  if (!fs6.existsSync(resolvedDir)) return [];
  const entries = fs6.readdirSync(resolvedDir, { withFileTypes: true });
  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path6.join(resolvedDir, entry.name);
    const detected = detectProject(fullPath);
    if (detected) {
      projects.push(detected);
    }
  }
  return projects.sort((a, b) => a.name.localeCompare(b.name));
}

// src/commands/scan.tsx
import { jsx as jsx10, jsxs as jsxs9 } from "react/jsx-runtime";
function ScanCommand({ directory }) {
  const { exit } = useApp();
  const [detected, setDetected] = useState6([]);
  const [selected, setSelected] = useState6(/* @__PURE__ */ new Set());
  const [cursor, setCursor] = useState6(0);
  const [phase, setPhase] = useState6("scanning");
  const [registered, setRegistered] = useState6(0);
  const [skippedCount, setSkippedCount] = useState6(0);
  useEffect6(() => {
    const registry = loadRegistry();
    const existingPaths = new Set(Object.values(registry.projects).map((p) => p.path));
    const projects = scanDirectory(directory);
    const filtered = projects.filter((p) => !existingPaths.has(p.path));
    setSkippedCount(projects.length - filtered.length);
    setDetected(filtered);
    setSelected(new Set(filtered.map((_, i) => i)));
    setPhase(filtered.length > 0 ? "selecting" : "done");
  }, [directory]);
  useInput((input, key) => {
    if (phase !== "selecting") return;
    if (key.upArrow) {
      setCursor((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setCursor((prev) => Math.min(detected.length - 1, prev + 1));
    } else if (input === " ") {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(cursor)) {
          next.delete(cursor);
        } else {
          next.add(cursor);
        }
        return next;
      });
    } else if (input === "a") {
      setSelected((prev) => {
        if (prev.size === detected.length) {
          return /* @__PURE__ */ new Set();
        }
        return new Set(detected.map((_, i) => i));
      });
    } else if (key.return) {
      let count = 0;
      for (const idx of selected) {
        const p = detected[idx];
        const now = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
        const commits = getCommitCount(p.path);
        const stage = commits > 0 ? "scaffolding" : "planning";
        createProject(p.name, p.path, {
          stage,
          tags: p.tags,
          venv: p.venv,
          remote: p.remote,
          aiConfig: p.aiConfig,
          stats: { switches: 0, commitsAtRegistration: commits },
          milestones: {
            born: now,
            ...p.hasGit ? { git_linked: now } : {},
            ...p.venv ? { venv_linked: now } : {},
            ...p.aiConfig ? { ai_configured: now } : {}
          }
        });
        count++;
      }
      setRegistered(count);
      setPhase("done");
    } else if (input === "q") {
      exit();
    }
  });
  if (phase === "scanning") {
    return /* @__PURE__ */ jsx10(Box9, { padding: 1, children: /* @__PURE__ */ jsxs9(Text10, { color: "yellow", children: [
      "Scanning ",
      directory,
      "..."
    ] }) });
  }
  if (phase === "done" && detected.length === 0) {
    return /* @__PURE__ */ jsx10(Box9, { padding: 1, flexDirection: "column", children: skippedCount > 0 ? /* @__PURE__ */ jsxs9(Text10, { dimColor: true, children: [
      "All ",
      skippedCount,
      " detected projects are already registered."
    ] }) : /* @__PURE__ */ jsxs9(Text10, { dimColor: true, children: [
      "No projects detected in ",
      directory,
      "."
    ] }) });
  }
  if (phase === "done") {
    return /* @__PURE__ */ jsx10(Box9, { padding: 1, children: /* @__PURE__ */ jsxs9(Text10, { color: "green", children: [
      "Registered ",
      registered,
      " project",
      registered !== 1 ? "s" : "",
      "."
    ] }) });
  }
  return /* @__PURE__ */ jsxs9(Box9, { flexDirection: "column", padding: 1, children: [
    /* @__PURE__ */ jsxs9(Text10, { bold: true, children: [
      "Found ",
      detected.length,
      " new project",
      detected.length !== 1 ? "s" : "",
      skippedCount > 0 ? /* @__PURE__ */ jsxs9(Text10, { dimColor: true, children: [
        " (",
        skippedCount,
        " already registered)"
      ] }) : ""
    ] }),
    /* @__PURE__ */ jsx10(Text10, { dimColor: true, children: " " }),
    detected.map((project, idx) => {
      const isSelected = selected.has(idx);
      const isCursor = cursor === idx;
      const indicator = isSelected ? "\u25C9" : "\u25CB";
      const tags = project.tags.length > 0 ? `[${project.tags.join(", ")}]` : "[unknown]";
      return /* @__PURE__ */ jsxs9(Text10, { children: [
        isCursor ? /* @__PURE__ */ jsx10(Text10, { color: "cyan", children: "\u276F " }) : "  ",
        /* @__PURE__ */ jsxs9(Text10, { color: isSelected ? "green" : "gray", children: [
          indicator,
          " "
        ] }),
        /* @__PURE__ */ jsx10(Text10, { bold: isCursor, children: project.name.padEnd(24) }),
        /* @__PURE__ */ jsx10(Text10, { dimColor: true, children: tags })
      ] }, project.path);
    }),
    /* @__PURE__ */ jsx10(Text10, { dimColor: true, children: " " }),
    /* @__PURE__ */ jsx10(Text10, { dimColor: true, children: "\u2191\u2193 navigate  space toggle  a all  enter confirm  q quit" })
  ] });
}

// src/cli.ts
var program = new Command();
program.name("pina").description("Personal project management CLI").version("0.1.0");
program.command("init").description("Register the current directory as a pina project").action(() => {
  render(React7.createElement(InitCommand, { path: process.cwd() }));
});
program.command("new <name>").description("Register an existing directory as a project").option("-p, --path <path>", "Path to the project directory").action((name, opts) => {
  render(React7.createElement(NewCommand, { name, path: opts.path }));
});
program.command("scan <directory>").description("Scan a directory and detect projects").action((directory) => {
  render(React7.createElement(ScanCommand, { directory }));
});
program.command("switch <name>").description("Switch to a project").action((name) => {
  render(React7.createElement(SwitchCommand, { name }));
});
program.command("list").alias("ls").description("List all projects").option("-s, --stage <stage>", "Filter by stage").option("-t, --tag <tag>", "Filter by tag").action((opts) => {
  render(React7.createElement(ListCommand, opts));
});
program.command("status").description("Show current project status").action(() => {
  render(React7.createElement(StatusCommand));
});
program.command("note <text>").description("Add a note to the current project").action((text) => {
  render(React7.createElement(NoteCommand, { text }));
});
program.command("archive <name>").description("Archive a project").action((name) => {
  render(React7.createElement(ArchiveCommand, { name }));
});
program.parse();
//# sourceMappingURL=cli.js.map