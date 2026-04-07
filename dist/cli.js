#!/usr/bin/env node

// src/cli.ts
import { Command } from "commander";
import { render } from "ink";
import React10 from "react";

// src/commands/dashboard.tsx
import { useState as useState3, useMemo, useCallback, useEffect } from "react";
import { execSync as execSync2 } from "child_process";
import { Text as Text4, Box as Box3, useInput as useInput3, useApp } from "ink";

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
var ObjectiveSchema = z.object({
  text: z.string(),
  hidden: z.boolean().default(false),
  focused: z.boolean().default(false),
  completed: z.boolean().default(false),
  completedAt: z.string().optional(),
  createdAt: z.string().optional()
});
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
  objectives: z.array(
    z.union([
      ObjectiveSchema,
      z.string().transform((text) => ({ text, hidden: false, focused: false, completed: false }))
    ])
  ).default([]),
  milestones: z.record(z.string(), z.string()).default({}),
  stats: z.object({
    switches: z.number().default(0),
    commitsAtRegistration: z.number().default(0)
  }).default({ switches: 0, commitsAtRegistration: 0 })
});
var SoundProfileSchema = z.enum(["default", "cyberpunk", "forest", "dreamy"]);
var PinaConfigSchema = z.object({
  activeProject: z.string().optional(),
  symlinkPath: z.string().default("~/current"),
  scanDirs: z.array(z.string()).default([]),
  muted: z.boolean().default(false),
  soundProfile: SoundProfileSchema.default("default")
});
var PinaRegistrySchema = z.object({
  config: PinaConfigSchema.default({
    symlinkPath: "~/current",
    scanDirs: [],
    muted: false,
    soundProfile: "default"
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
function removeProject(name) {
  const registry = loadRegistry();
  if (!(name in registry.projects)) return false;
  delete registry.projects[name];
  saveRegistry(registry);
  return true;
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
function renameProject(oldName, newName) {
  const registry = loadRegistry();
  const project = registry.projects[oldName];
  if (!project || newName in registry.projects) return false;
  project.name = newName;
  registry.projects[newName] = project;
  delete registry.projects[oldName];
  if (registry.config.activeProject === oldName) {
    registry.config.activeProject = newName;
  }
  saveRegistry(registry);
  return true;
}
function createProject(name, projectPath, options = {}) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const project = {
    name,
    path: projectPath,
    stage: "planning",
    status: "active",
    stale: false,
    tags: [],
    xp: 0,
    notes: [],
    objectives: [],
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
function getUpstreamStatus(dir) {
  if (!isGitRepo(dir)) return void 0;
  try {
    const output = execSync("git status --branch --porcelain=v2", {
      cwd: dir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    let ahead = 0;
    let behind = 0;
    let tracking;
    for (const line of output.split("\n")) {
      if (line.startsWith("# branch.upstream ")) {
        tracking = line.slice("# branch.upstream ".length);
      }
      if (line.startsWith("# branch.ab ")) {
        const match = line.match(/\+(\d+) -(\d+)/);
        if (match) {
          ahead = parseInt(match[1], 10);
          behind = parseInt(match[2], 10);
        }
      }
    }
    if (!tracking) return void 0;
    return { ahead, behind, tracking };
  } catch {
    return void 0;
  }
}
function getRemoteBrowserUrl(dir) {
  const url = getRemoteUrl(dir);
  if (!url) return void 0;
  let browserUrl = url.replace(/\.git$/, "").replace(/^git@([^:]+):/, "https://$1/").replace(/^ssh:\/\/git@([^/]+)\//, "https://$1/");
  return browserUrl;
}
function getLocalBranches(dir) {
  if (!isGitRepo(dir)) return [];
  try {
    const output = execSync('git branch --list --format="%(refname:short)"', {
      cwd: dir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    return output ? output.split("\n") : [];
  } catch {
    return [];
  }
}
function getRemoteBranches(dir) {
  if (!isGitRepo(dir)) return [];
  try {
    const output = execSync('git branch --remotes --format="%(refname:short)"', {
      cwd: dir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    if (!output) return [];
    return output.split("\n").map((branch) => branch.trim()).filter((branch) => branch.length > 0 && !branch.includes("->"));
  } catch {
    return [];
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

// src/lib/symlink.ts
import fs3 from "fs";
import os2 from "os";
function resolveSymlinkPath() {
  const registry = loadRegistry();
  return registry.config.symlinkPath.replace(/^~/, os2.homedir());
}
function updateSymlink(targetPath) {
  const linkPath = resolveSymlinkPath();
  if (fs3.existsSync(linkPath) || fs3.lstatSync(linkPath).isSymbolicLink()) {
    fs3.unlinkSync(linkPath);
  }
  fs3.symlinkSync(targetPath, linkPath, "dir");
}
function removeSymlink() {
  const linkPath = resolveSymlinkPath();
  try {
    if (fs3.lstatSync(linkPath).isSymbolicLink()) {
      fs3.unlinkSync(linkPath);
    }
  } catch {
  }
}

// src/components/StatusBadge.tsx
import { Text } from "ink";
import { jsx, jsxs } from "react/jsx-runtime";
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
    return /* @__PURE__ */ jsx(Text, { color: "yellow", bold: true, children: "[paused]" });
  }
  if (stale) {
    return /* @__PURE__ */ jsxs(Text, { color: "red", children: [
      "[",
      stage,
      " \xB7 stale]"
    ] });
  }
  const color = STAGE_COLORS[stage];
  return /* @__PURE__ */ jsxs(Text, { color, children: [
    "[",
    stage,
    "]"
  ] });
}

// src/components/ContextMenu.tsx
import { useState } from "react";
import { Text as Text2, Box, useInput } from "ink";

// src/lib/sound.ts
import { spawn } from "child_process";
import fs4 from "fs";
import path3 from "path";
import { fileURLToPath } from "url";
var __dirname = path3.dirname(fileURLToPath(import.meta.url));
function resolveSoundsDir() {
  let current = __dirname;
  const root = path3.parse(current).root;
  while (true) {
    const candidate = path3.join(current, "sounds");
    if (fs4.existsSync(candidate)) return candidate;
    if (current === root) break;
    current = path3.dirname(current);
  }
  return path3.join(__dirname, "..", "..", "sounds");
}
var SOUNDS_DIR = resolveSoundsDir();
var SOUND_PROFILES = ["default", "cyberpunk", "forest", "dreamy"];
var ACTIVE_PROFILES = ["default", "dreamy"];
var SOUND_FILES = {
  navigate: "navigate.wav",
  enter: "enter.wav",
  back: "back.wav",
  action: "action.wav",
  success: "success.wav",
  error: "error.wav",
  toggle: "toggle.wav",
  delete: "delete.wav",
  completion: "completion.wav",
  "ultra-completion": "ultra-completion.wav"
};
function playSound(event, index) {
  const registry = loadRegistry();
  if (registry.config.muted) return;
  const profile = registry.config.soundProfile;
  let file;
  if (event === "navigate" && index !== void 0) {
    const semitone = index % 12;
    file = path3.join(SOUNDS_DIR, profile, `navigate_${semitone}.wav`);
  } else {
    file = path3.join(SOUNDS_DIR, profile, SOUND_FILES[event]);
  }
  const child = spawn("afplay", [file], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
}
function isMuted() {
  return loadRegistry().config.muted;
}
function setMuted(muted) {
  const registry = loadRegistry();
  registry.config.muted = muted;
  saveRegistry(registry);
}
function toggleMute() {
  const registry = loadRegistry();
  registry.config.muted = !registry.config.muted;
  saveRegistry(registry);
  return registry.config.muted;
}
function getSoundProfile() {
  return loadRegistry().config.soundProfile;
}
function setSoundProfile(profile) {
  const registry = loadRegistry();
  registry.config.soundProfile = profile;
  saveRegistry(registry);
}
function cycleSoundProfile() {
  const registry = loadRegistry();
  const currentIdx = ACTIVE_PROFILES.indexOf(registry.config.soundProfile);
  const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % ACTIVE_PROFILES.length;
  const next = ACTIVE_PROFILES[nextIdx];
  registry.config.soundProfile = next;
  saveRegistry(registry);
  return next;
}

// src/components/ContextMenu.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function ContextMenu({ title, items, onClose }) {
  const [cursor, setCursor] = useState(0);
  useInput((input, key) => {
    if (key.escape) {
      playSound("back");
      onClose();
      return;
    }
    if (key.upArrow) {
      const next = (cursor - 1 + items.length) % items.length;
      playSound("navigate", next);
      setCursor(next);
      return;
    }
    if (key.downArrow || key.tab) {
      const next = (cursor + 1) % items.length;
      playSound("navigate", next);
      setCursor(next);
      return;
    }
    if (key.return) {
      playSound("action");
      items[cursor]?.action();
      return;
    }
  });
  return /* @__PURE__ */ jsxs2(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "cyan",
      paddingX: 1,
      paddingY: 0,
      children: [
        /* @__PURE__ */ jsx2(Text2, { bold: true, color: "cyan", children: title }),
        /* @__PURE__ */ jsx2(Text2, { children: " " }),
        items.map((item, i) => {
          const isCursor = cursor === i;
          return /* @__PURE__ */ jsxs2(Text2, { children: [
            /* @__PURE__ */ jsx2(Text2, { color: "cyan", children: isCursor ? "\u276F " : "  " }),
            /* @__PURE__ */ jsx2(Text2, { inverse: isCursor, children: item.label })
          ] }, i);
        }),
        /* @__PURE__ */ jsx2(Text2, { children: " " }),
        /* @__PURE__ */ jsx2(Text2, { dimColor: true, children: "\u2191\u2193 navigate  enter select  esc cancel" })
      ]
    }
  );
}

// src/components/TextInput.tsx
import { useState as useState2 } from "react";
import { Text as Text3, Box as Box2, useInput as useInput2 } from "ink";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function TextInput({ prompt, defaultValue = "", onSubmit, onCancel }) {
  const [value, setValue] = useState2(defaultValue);
  const [cursor, setCursor] = useState2(defaultValue.length);
  useInput2((input, key) => {
    if (key.escape) {
      playSound("back");
      onCancel();
      return;
    }
    if (key.return) {
      if (value.trim()) {
        playSound("success");
        onSubmit(value.trim());
      }
      return;
    }
    if (key.backspace || key.delete) {
      if (cursor > 0) {
        setValue((prev) => prev.slice(0, cursor - 1) + prev.slice(cursor));
        setCursor((prev) => prev - 1);
      }
      return;
    }
    if (key.leftArrow) {
      setCursor((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.rightArrow) {
      setCursor((prev) => Math.min(value.length, prev + 1));
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      setValue((prev) => prev.slice(0, cursor) + input + prev.slice(cursor));
      setCursor((prev) => prev + input.length);
    }
  });
  const before = value.slice(0, cursor);
  const cursorChar = value[cursor] ?? " ";
  const after = value.slice(cursor + 1);
  return /* @__PURE__ */ jsxs3(
    Box2,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "cyan",
      paddingX: 1,
      children: [
        /* @__PURE__ */ jsx3(Text3, { bold: true, color: "cyan", children: prompt }),
        /* @__PURE__ */ jsx3(Text3, { children: " " }),
        /* @__PURE__ */ jsxs3(Text3, { children: [
          /* @__PURE__ */ jsx3(Text3, { children: before }),
          /* @__PURE__ */ jsx3(Text3, { inverse: true, children: cursorChar }),
          /* @__PURE__ */ jsx3(Text3, { children: after })
        ] }),
        /* @__PURE__ */ jsx3(Text3, { children: " " }),
        /* @__PURE__ */ jsx3(Text3, { dimColor: true, children: "enter confirm  esc cancel" })
      ]
    }
  );
}

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
var STAGE_LABELS = {
  planning: "Moved to planning",
  scaffolding: "Moved to scaffolding",
  development: "Moved to development",
  stable: "Reached stable",
  complete: "Completed",
  archived: "Archived"
};
function getMilestoneLabel(key) {
  if (key in MILESTONE_LABELS) return MILESTONE_LABELS[key];
  const stageMatch = key.match(/^stage:(\w+):/);
  if (stageMatch) return STAGE_LABELS[stageMatch[1]] ?? `Stage: ${stageMatch[1]}`;
  return key;
}

// src/lib/menus.ts
var STAGES = ["planning", "scaffolding", "development", "stable", "complete", "archived"];
function getMenuTitle(panel, selectableKey, project) {
  if (panel === "projects" && project) {
    return `${project.name} [${project.stage}]`;
  }
  if (panel === "objectives") {
    return "Objective";
  }
  switch (selectableKey) {
    case "name":
      return project?.name ?? "Project";
    case "path":
      return "Path";
    case "branch":
      return "Branch";
    case "remote":
      return "Remote";
    case "milestones":
      return "Milestones";
    case "switches":
      return "Switches";
    case "xp":
      return "XP";
    case "tags":
      return "Tags";
    default:
      if (selectableKey.startsWith("note:")) return "Note";
      return selectableKey;
  }
}
function getActiveMenuItems(selectableKey, project, dispatch) {
  const name = project.name;
  switch (selectableKey) {
    case "name":
      return [
        { label: "Rename project", action: () => dispatch({ type: "rename_project", projectName: name }) },
        ...STAGES.filter((s) => s !== project.stage).map((stage) => ({
          label: `Set stage to '${stage}'`,
          action: () => dispatch({ type: "set_stage", projectName: name, stage })
        })),
        {
          label: project.status === "paused" ? "Resume project" : "Pause project",
          action: () => dispatch({ type: "toggle_pause", projectName: name })
        }
      ];
    case "path":
      return [
        { label: "Open project folder", action: () => dispatch({ type: "open_folder", projectPath: project.path }) },
        { label: "Open in VS Code", action: () => dispatch({ type: "open_vscode", projectPath: project.path }) },
        { label: "Open in new tab", action: () => dispatch({ type: "open_terminal_tab", projectPath: project.path }) }
      ];
    case "branch": {
      const currentBranch = getCurrentBranch(project.path);
      const localBranches = getLocalBranches(project.path);
      const localBranchSet = new Set(localBranches);
      const otherLocalBranches = localBranches.filter((b) => b && b !== currentBranch);
      const remoteBranches = getRemoteBranches(project.path);
      const remoteOnly = remoteBranches.map((remote) => remote.trim()).filter((remote) => remote.length > 0).filter((remote) => {
        const short = remote.includes("/") ? remote.split("/").slice(1).join("/") : remote;
        if (short === currentBranch) return false;
        return !localBranchSet.has(short);
      });
      const items = [
        ...otherLocalBranches.map((branch) => ({
          label: `Checkout '${branch}'`,
          action: () => dispatch({ type: "git_checkout", projectName: name, branch })
        })),
        ...remoteOnly.map((remote) => ({
          label: `Track remote '${remote}'`,
          action: () => dispatch({ type: "git_checkout", projectName: name, branch: remote, trackRemote: true })
        }))
      ];
      if (items.length === 0) {
        items.push({ label: "No other branches available", action: () => {
        } });
      }
      items.push({
        label: "Refresh branch list (fetch --all)",
        action: () => dispatch({ type: "git_refresh_branches", projectName: name })
      });
      return items;
    }
    case "remote":
      return [
        { label: "git add .", action: () => dispatch({ type: "git_add", projectName: name }) },
        { label: "git commit", action: () => dispatch({ type: "git_commit", projectName: name }) },
        { label: "git push", action: () => dispatch({ type: "git_push", projectName: name }) },
        { label: "git add + commit", action: () => dispatch({ type: "git_add_commit", projectName: name }) },
        { label: "git add + commit + push", action: () => dispatch({ type: "git_add_commit_push", projectName: name }) },
        { label: "git pull", action: () => dispatch({ type: "git_pull", projectName: name }) },
        { label: "git fetch", action: () => dispatch({ type: "git_fetch", projectName: name }) },
        { label: "Open in browser", action: () => dispatch({ type: "open_remote_browser", projectName: name }) }
      ];
    case "milestones":
      return [
        { label: "Show all milestones", action: () => dispatch({ type: "show_milestones", projectName: name }) }
      ];
    case "tags":
      return [
        { label: "Add tag", action: () => dispatch({ type: "add_tag", projectName: name }) },
        ...project.tags.map((tag) => ({
          label: `Remove tag '${tag}'`,
          action: () => dispatch({ type: "remove_tag", projectName: name, tag })
        }))
      ];
    default:
      if (selectableKey.startsWith("note:")) {
        const noteContent = selectableKey.slice(5);
        const noteIndex = project.notes.indexOf(noteContent);
        return [
          { label: "Delete note", action: () => dispatch({ type: "delete_note", projectName: name, noteIndex }) },
          { label: "Add new note", action: () => dispatch({ type: "add_note", projectName: name }) }
        ];
      }
      return [
        { label: "Rename project", action: () => dispatch({ type: "rename_project", projectName: name }) },
        { label: "Add note", action: () => dispatch({ type: "add_note", projectName: name }) }
      ];
  }
}
function getObjectivesMenuItems(objectiveIndex, project, dispatch, isHiddenList) {
  const name = project.name;
  if (isHiddenList) {
    return [
      { label: "Unhide objective", action: () => dispatch({ type: "unhide_objective", projectName: name, objectiveIndex }) },
      { label: "Complete objective", action: () => dispatch({ type: "complete_objective", projectName: name, objectiveIndex }) }
    ];
  }
  const obj = project.objectives[objectiveIndex];
  const items = [
    { label: "Complete objective", action: () => dispatch({ type: "complete_objective", projectName: name, objectiveIndex }) },
    { label: "Edit objective", action: () => dispatch({ type: "edit_objective", projectName: name, objectiveIndex }) },
    {
      label: obj?.focused ? "Unfocus objective" : "Focus objective",
      action: () => dispatch({ type: "focus_objective", projectName: name, objectiveIndex })
    },
    { label: "Hide objective", action: () => dispatch({ type: "hide_objective", projectName: name, objectiveIndex }) },
    { label: "Add new objective", action: () => dispatch({ type: "add_objective", projectName: name }) }
  ];
  if (project.objectives.some((o) => o.hidden)) {
    items.push({ label: "Show hidden objectives", action: () => dispatch({ type: "show_hidden_objectives", projectName: name }) });
  }
  return items;
}
function getProjectsMenuItems(project, isActive, dispatch) {
  const name = project.name;
  const items = [];
  if (!isActive) {
    items.push({ label: "Switch to this project", action: () => dispatch({ type: "switch_project", projectName: name }) });
  }
  items.push(
    { label: "Rename project", action: () => dispatch({ type: "rename_project", projectName: name }) }
  );
  for (const stage of STAGES) {
    if (stage !== project.stage) {
      items.push({
        label: `Set stage to '${stage}'`,
        action: () => dispatch({ type: "set_stage", projectName: name, stage })
      });
    }
  }
  items.push({
    label: project.status === "paused" ? "Resume project" : "Pause project",
    action: () => dispatch({ type: "toggle_pause", projectName: name })
  });
  if (project.stage !== "archived") {
    items.push({ label: "Archive project", action: () => dispatch({ type: "archive_project", projectName: name }) });
  }
  items.push({ label: "Delete project", action: () => dispatch({ type: "delete_project", projectName: name }) });
  return items;
}

// src/commands/dashboard.tsx
import { Fragment, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var PANEL_ORDER = ["active", "objectives", "projects"];
var RAINBOW_COLORS = ["red", "magenta", "yellow", "green", "cyan", "blue"];
var COMPLETED_GLOW_DURATION = 4e3;
var NEW_OBJECTIVE_GLOW_DURATION = 3500;
function detectTerminalApp() {
  const termProgram = process.env.TERM_PROGRAM ?? "";
  switch (termProgram) {
    case "ghostty":
      return "Ghostty";
    case "iTerm.app":
      return "iTerm";
    case "WarpTerminal":
      return "Warp";
    case "Apple_Terminal":
      return "Terminal";
    case "kitty":
      return "kitty";
    case "Hyper":
      return "Hyper";
    case "Alacritty":
      return "Alacritty";
    default:
      return "Terminal";
  }
}
function openTerminalTab(app, dir) {
  const escaped = dir.replace(/"/g, '\\"');
  switch (app) {
    case "iTerm":
      execSync2(`osascript -e 'tell application "iTerm2" to tell current window to create tab with default profile command "cd \\"${escaped}\\" && exec $SHELL"'`, { stdio: "pipe" });
      break;
    case "Apple_Terminal":
    case "Terminal":
      execSync2(`osascript -e 'tell application "Terminal" to do script "cd \\"${escaped}\\""'`, { stdio: "pipe" });
      break;
    default:
      execSync2(`open -a "${app}" "${escaped}"`, { stdio: "pipe" });
  }
}
function formatMilestoneDate(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}
function getActiveSelectables(project) {
  if (!project) return [];
  const items = ["name", "path"];
  if (isGitRepo(project.path)) items.push("branch");
  if (getRemoteUrl(project.path)) items.push("remote");
  if (project.tags.length > 0) items.push("tags");
  for (const note of project.notes.slice(-3)) {
    items.push(`note:${note}`);
  }
  if (Object.keys(project.milestones).length > 0) items.push("milestones");
  return items;
}
function ActiveProjectPanel({
  project,
  entered,
  selectedIndex
}) {
  if (!project) {
    return /* @__PURE__ */ jsxs4(Box3, { flexDirection: "column", paddingX: 1, children: [
      /* @__PURE__ */ jsx4(Text4, { dimColor: true, children: "No active project." }),
      /* @__PURE__ */ jsx4(Text4, { dimColor: true, children: "Run `pina switch <name>` to select one." })
    ] });
  }
  const branch = getCurrentBranch(project.path);
  const dirty = isDirty(project.path);
  const upstream = getUpstreamStatus(project.path);
  const remoteUrl = getRemoteUrl(project.path);
  const inGitRepo = isGitRepo(project.path);
  const selectables = getActiveSelectables(project);
  const hi = (key) => entered && selectables[selectedIndex] === key;
  const notes = project.notes.slice(-3);
  const allMilestones = Object.entries(project.milestones).sort((a, b) => b[1].localeCompare(a[1]));
  const recentMilestones = allMilestones.slice(0, 2);
  return /* @__PURE__ */ jsxs4(Box3, { flexDirection: "column", paddingX: 1, children: [
    /* @__PURE__ */ jsxs4(Box3, { gap: 2, children: [
      /* @__PURE__ */ jsx4(Text4, { bold: true, color: "green", inverse: hi("name"), children: project.name }),
      /* @__PURE__ */ jsx4(StatusBadge, { stage: project.stage, stale: project.stale, status: project.status })
    ] }),
    /* @__PURE__ */ jsx4(Text4, { dimColor: true, inverse: hi("path"), children: project.path }),
    /* @__PURE__ */ jsx4(Text4, { children: " " }),
    inGitRepo && /* @__PURE__ */ jsxs4(Text4, { inverse: hi("branch"), children: [
      /* @__PURE__ */ jsx4(Text4, { dimColor: true, children: "Branch   " }),
      branch ? /* @__PURE__ */ jsx4(Text4, { color: "cyan", children: branch }) : /* @__PURE__ */ jsx4(Text4, { color: "yellow", children: "detached HEAD" }),
      dirty ? /* @__PURE__ */ jsx4(Text4, { color: "yellow", children: " (dirty)" }) : ""
    ] }),
    remoteUrl && /* @__PURE__ */ jsxs4(Text4, { inverse: hi("remote"), children: [
      /* @__PURE__ */ jsx4(Text4, { dimColor: true, children: "Remote   " }),
      upstream ? /* @__PURE__ */ jsxs4(Fragment, { children: [
        /* @__PURE__ */ jsx4(Text4, { color: upstream.ahead > 0 || upstream.behind > 0 ? "yellow" : "green", children: upstream.ahead === 0 && upstream.behind === 0 ? "up to date" : `${upstream.ahead > 0 ? `${upstream.ahead} ahead` : ""}${upstream.ahead > 0 && upstream.behind > 0 ? ", " : ""}${upstream.behind > 0 ? `${upstream.behind} behind` : ""}` }),
        /* @__PURE__ */ jsxs4(Text4, { dimColor: true, children: [
          " (",
          upstream.tracking,
          ")"
        ] })
      ] }) : /* @__PURE__ */ jsx4(Text4, { dimColor: true, children: "not tracking" })
    ] }),
    project.tags.length > 0 && /* @__PURE__ */ jsxs4(Text4, { inverse: hi("tags"), children: [
      /* @__PURE__ */ jsx4(Text4, { dimColor: true, children: "Tags     " }),
      /* @__PURE__ */ jsx4(Text4, { children: project.tags.join(", ") })
    ] }),
    notes.length > 0 && /* @__PURE__ */ jsxs4(Box3, { flexDirection: "column", marginTop: 1, children: [
      /* @__PURE__ */ jsx4(Text4, { bold: true, dimColor: true, children: "Recent Notes" }),
      notes.map((note, i) => /* @__PURE__ */ jsxs4(Text4, { dimColor: true, inverse: hi(`note:${note}`), children: [
        "  ",
        note
      ] }, `note-${i}`))
    ] }),
    recentMilestones.length > 0 && /* @__PURE__ */ jsxs4(Box3, { flexDirection: "column", marginTop: 1, children: [
      /* @__PURE__ */ jsx4(Text4, { bold: true, dimColor: true, inverse: hi("milestones"), children: "Milestones" }),
      recentMilestones.map(([key, date]) => /* @__PURE__ */ jsxs4(Text4, { dimColor: true, inverse: hi("milestones"), children: [
        "  ",
        getMilestoneLabel(key),
        " ",
        /* @__PURE__ */ jsx4(Text4, { italic: true, children: formatMilestoneDate(date) })
      ] }, `ms-${key}`))
    ] })
  ] });
}
var GOLDEN_COLORS = ["#FFD700", "#FFC125", "#FFB90F", "#EEAD0E", "#CDAD00", "#EEAD0E", "#FFB90F", "#FFC125"];
function useFocusedObjectiveColor() {
  const [colorIdx, setColorIdx] = useState3(0);
  useEffect(() => {
    const timer = setInterval(() => setColorIdx((i) => (i + 1) % GOLDEN_COLORS.length), 200);
    return () => clearInterval(timer);
  }, []);
  return GOLDEN_COLORS[colorIdx];
}
function ObjectivesPanel({
  project,
  entered,
  selectedIndex,
  completedHighlightColor,
  newObjectiveHighlightId,
  newObjectivePulse
}) {
  const allObjectives = project?.objectives ?? [];
  const visible = allObjectives.filter((o) => !o.hidden && !o.completed);
  const hiddenCount = allObjectives.filter((o) => o.hidden).length;
  const completedCount = allObjectives.filter((o) => o.completed).length;
  const sorted = [...visible].sort((a, b) => a.focused === b.focused ? 0 : a.focused ? -1 : 1);
  const addIndex = sorted.length;
  const completedIndex = sorted.length + 1;
  const hiddenIndex = completedIndex + 1;
  const focusedColor = useFocusedObjectiveColor();
  const isAddSelected = entered && selectedIndex === addIndex;
  const isCompletedSelected = entered && selectedIndex === completedIndex;
  const isHiddenSelected = entered && selectedIndex === hiddenIndex;
  return /* @__PURE__ */ jsxs4(Box3, { flexDirection: "column", paddingX: 1, children: [
    sorted.length === 0 && hiddenCount === 0 && completedCount === 0 && /* @__PURE__ */ jsx4(Text4, { dimColor: true, children: "No objectives set." }),
    sorted.map((obj, i) => {
      const isSelected = entered && selectedIndex === i;
      const objectiveId = obj.createdAt ?? `${obj.text}-${i}`;
      const isNewlyAdded = newObjectiveHighlightId && objectiveId === newObjectiveHighlightId;
      const color = isNewlyAdded ? newObjectivePulse ? "magenta" : "green" : void 0;
      return /* @__PURE__ */ jsx4(Box3, { children: /* @__PURE__ */ jsx4(Text4, { inverse: isSelected, color: obj.focused ? focusedColor : color, children: `${i + 1}. ${obj.focused ? "\u2605 " : ""}${obj.text}` }) }, `obj-${i}`);
    }),
    /* @__PURE__ */ jsx4(Text4, { children: " " }),
    /* @__PURE__ */ jsx4(Text4, { inverse: isAddSelected, color: "green", children: "  [+] Add objective" }),
    /* @__PURE__ */ jsxs4(
      Text4,
      {
        inverse: isCompletedSelected,
        color: completedHighlightColor ?? (completedCount > 0 ? "cyan" : void 0),
        dimColor: !completedHighlightColor && completedCount === 0,
        children: [
          "  ",
          `Completed objectives(${completedCount})`
        ]
      }
    ),
    hiddenCount > 0 && /* @__PURE__ */ jsxs4(Text4, { inverse: isHiddenSelected, dimColor: true, children: [
      "  ",
      `[${hiddenCount} hidden]`
    ] })
  ] });
}
function AllProjectsPanel({
  projects,
  activeProjectName,
  entered,
  selectedIndex
}) {
  if (projects.length === 0) {
    return /* @__PURE__ */ jsxs4(Box3, { flexDirection: "column", paddingX: 1, children: [
      /* @__PURE__ */ jsx4(Text4, { dimColor: true, children: "No projects registered." }),
      /* @__PURE__ */ jsx4(Text4, { dimColor: true, children: "Run `pina init` or `pina scan` to get started." })
    ] });
  }
  return /* @__PURE__ */ jsx4(Box3, { flexDirection: "column", paddingX: 1, children: projects.map((project, i) => {
    const isActive = project.name === activeProjectName;
    const marker = isActive ? "\u25B8" : " ";
    const isSelected = entered && selectedIndex === i;
    return /* @__PURE__ */ jsxs4(Box3, { gap: 1, children: [
      /* @__PURE__ */ jsxs4(Text4, { color: isActive ? "green" : void 0, inverse: isSelected, children: [
        marker,
        " ",
        project.name
      ] }),
      /* @__PURE__ */ jsx4(StatusBadge, { stage: project.stage, stale: project.stale, status: project.status }),
      project.tags.length > 0 && /* @__PURE__ */ jsx4(Text4, { dimColor: true, children: project.tags.join(", ") })
    ] }, project.name);
  }) });
}
function TimelineOverlay({ milestones, onClose }) {
  useInput3((input, key) => {
    if (key.escape || key.return) {
      onClose();
    }
  });
  return /* @__PURE__ */ jsxs4(
    Box3,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "cyan",
      paddingX: 2,
      paddingY: 1,
      children: [
        /* @__PURE__ */ jsx4(Text4, { bold: true, color: "cyan", children: "Milestone Timeline" }),
        /* @__PURE__ */ jsx4(Text4, { children: " " }),
        milestones.map(([key, date], i) => {
          const label = getMilestoneLabel(key);
          const isLast = i === milestones.length - 1;
          return /* @__PURE__ */ jsxs4(Box3, { flexDirection: "column", children: [
            /* @__PURE__ */ jsxs4(Box3, { children: [
              /* @__PURE__ */ jsx4(Text4, { color: "cyan", children: "  \u25CF " }),
              /* @__PURE__ */ jsx4(Text4, { bold: true, children: label }),
              /* @__PURE__ */ jsxs4(Text4, { dimColor: true, children: [
                "  ",
                formatMilestoneDate(date)
              ] })
            ] }),
            !isLast && /* @__PURE__ */ jsx4(Text4, { color: "cyan", children: "  \u2502" })
          ] }, key);
        }),
        /* @__PURE__ */ jsx4(Text4, { children: " " }),
        /* @__PURE__ */ jsx4(Text4, { dimColor: true, children: "enter/esc dismiss" })
      ]
    }
  );
}
function HiddenObjectivesOverlay({
  project,
  onUnhide,
  onClose
}) {
  const hidden = project.objectives.map((obj, i) => ({ obj, realIndex: i })).filter(({ obj }) => obj.hidden);
  const [selected, setSelected] = useState3(0);
  useInput3((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    if (key.upArrow && selected > 0) {
      setSelected(selected - 1);
      playSound("navigate", selected - 1);
    }
    if (key.downArrow && selected < hidden.length - 1) {
      setSelected(selected + 1);
      playSound("navigate", selected + 1);
    }
    if (key.return && hidden.length > 0) {
      onUnhide(hidden[selected].realIndex);
    }
  });
  return /* @__PURE__ */ jsxs4(Box3, { flexDirection: "column", borderStyle: "round", borderColor: "yellow", paddingX: 2, paddingY: 1, children: [
    /* @__PURE__ */ jsx4(Text4, { bold: true, color: "yellow", children: "Hidden Objectives" }),
    /* @__PURE__ */ jsx4(Text4, { children: " " }),
    hidden.length === 0 && /* @__PURE__ */ jsx4(Text4, { dimColor: true, children: "No hidden objectives." }),
    hidden.map(({ obj, realIndex }, i) => /* @__PURE__ */ jsx4(Text4, { inverse: selected === i, children: `  ${obj.text}` }, realIndex)),
    /* @__PURE__ */ jsx4(Text4, { children: " " }),
    /* @__PURE__ */ jsx4(Text4, { dimColor: true, children: "enter unhide  esc back" })
  ] });
}
function CompletedObjectivesOverlay({
  project,
  onRelist,
  onClose
}) {
  const completed = project.objectives.map((obj, i) => ({ obj, realIndex: i })).filter(({ obj }) => obj.completed);
  const [selected, setSelected] = useState3(0);
  useInput3((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    if (key.upArrow && selected > 0) {
      setSelected(selected - 1);
      playSound("navigate", selected - 1);
    }
    if (key.downArrow && selected < completed.length - 1) {
      setSelected(selected + 1);
      playSound("navigate", selected + 1);
    }
    if (key.return && completed.length > 0) {
      onRelist(completed[selected].realIndex);
    }
  });
  return /* @__PURE__ */ jsxs4(Box3, { flexDirection: "column", borderStyle: "round", borderColor: "green", paddingX: 2, paddingY: 1, children: [
    /* @__PURE__ */ jsx4(Text4, { bold: true, color: "green", children: "Completed Objectives" }),
    /* @__PURE__ */ jsx4(Text4, { children: " " }),
    completed.length === 0 && /* @__PURE__ */ jsx4(Text4, { dimColor: true, children: "No completed objectives." }),
    completed.map(({ obj, realIndex }, i) => /* @__PURE__ */ jsx4(Text4, { inverse: selected === i, children: `  ${obj.text}` }, realIndex)),
    /* @__PURE__ */ jsx4(Text4, { children: " " }),
    /* @__PURE__ */ jsx4(Text4, { dimColor: true, children: "enter re-list  esc back" })
  ] });
}
function ErrorOverlay({ message, onClose }) {
  useInput3((input, key) => {
    if (key.escape || key.return) {
      onClose();
    }
  });
  return /* @__PURE__ */ jsxs4(
    Box3,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "red",
      paddingX: 1,
      children: [
        /* @__PURE__ */ jsx4(Text4, { bold: true, color: "red", children: "Error" }),
        /* @__PURE__ */ jsx4(Text4, { children: " " }),
        /* @__PURE__ */ jsx4(Text4, { children: message }),
        /* @__PURE__ */ jsx4(Text4, { children: " " }),
        /* @__PURE__ */ jsx4(Text4, { dimColor: true, children: "enter/esc dismiss" })
      ]
    }
  );
}
function Dashboard() {
  const { exit } = useApp();
  const [refreshKey, setRefreshKey] = useState3(0);
  const registry = useMemo(() => loadRegistry(), [refreshKey]);
  const projects = useMemo(() => Object.values(registry.projects), [registry]);
  const activeProject = registry.config.activeProject ? registry.projects[registry.config.activeProject] : void 0;
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  const [focusedPanel, setFocusedPanel] = useState3("active");
  const [enteredPanel, setEnteredPanel] = useState3(null);
  const [selectedIndices, setSelectedIndices] = useState3({
    active: 0,
    objectives: 0,
    projects: 0
  });
  const [overlay, setOverlay] = useState3(null);
  const [completedGlow, setCompletedGlow] = useState3({ project: void 0, until: 0 });
  const [rainbowIndex, setRainbowIndex] = useState3(0);
  const [recentAddition, setRecentAddition] = useState3(null);
  const [recentAdditionPulse, setRecentAdditionPulse] = useState3(false);
  useEffect(() => {
    if (!completedGlow.project) return;
    const remaining = completedGlow.until - Date.now();
    if (remaining <= 0) {
      setCompletedGlow({ project: void 0, until: 0 });
      return;
    }
    const interval = setInterval(() => setRainbowIndex((i) => i + 1), 120);
    const timeout = setTimeout(() => setCompletedGlow({ project: void 0, until: 0 }), remaining);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [completedGlow]);
  useEffect(() => {
    if (!recentAddition) {
      setRecentAdditionPulse(false);
      return;
    }
    const remaining = recentAddition.until - Date.now();
    if (remaining <= 0) {
      setRecentAddition(null);
      setRecentAdditionPulse(false);
      return;
    }
    const interval = setInterval(() => setRecentAdditionPulse((p) => !p), 200);
    const timeout = setTimeout(() => {
      setRecentAddition(null);
      setRecentAdditionPulse(false);
    }, remaining);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [recentAddition]);
  const selectableCounts = useMemo(() => ({
    active: getActiveSelectables(activeProject).length,
    objectives: activeProject ? (() => {
      const visible = activeProject.objectives.filter((o) => !o.hidden && !o.completed).length;
      const hasHidden = activeProject.objectives.some((o) => o.hidden);
      return visible + 1 + 1 + (hasHidden ? 1 : 0);
    })() : 0,
    projects: projects.length
  }), [activeProject, projects]);
  const completedHighlightColor = activeProject && completedGlow.project === activeProject.name ? RAINBOW_COLORS[rainbowIndex % RAINBOW_COLORS.length] : void 0;
  const newObjectiveHighlightId = activeProject && recentAddition && recentAddition.project === activeProject.name ? recentAddition.objectiveId : void 0;
  const dispatch = useCallback((action) => {
    switch (action.type) {
      case "rename_project": {
        const project = registry.projects[action.projectName];
        if (!project) break;
        setOverlay({
          type: "text_input",
          prompt: `Rename "${action.projectName}" to:`,
          defaultValue: action.projectName,
          onSubmit: (newName) => {
            renameProject(action.projectName, newName);
            setOverlay(null);
            refresh();
          }
        });
        return;
      }
      case "set_stage": {
        const project = registry.projects[action.projectName];
        if (!project) break;
        project.stage = action.stage;
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const stageKey = `stage:${action.stage}:${Date.now()}`;
        project.milestones[stageKey] = now;
        setProject(action.projectName, project);
        if (action.stage === "complete") {
          playSound("ultra-completion");
        } else {
          playSound("success");
        }
        break;
      }
      case "toggle_pause": {
        const project = registry.projects[action.projectName];
        if (!project) break;
        project.status = project.status === "paused" ? "active" : "paused";
        setProject(action.projectName, project);
        playSound("toggle");
        break;
      }
      case "archive_project": {
        const project = registry.projects[action.projectName];
        if (!project) break;
        project.stage = "archived";
        project.status = "paused";
        project.milestones[`stage:archived:${Date.now()}`] = (/* @__PURE__ */ new Date()).toISOString();
        setProject(action.projectName, project);
        playSound("success");
        break;
      }
      case "delete_project": {
        removeProject(action.projectName);
        if (registry.config.activeProject === action.projectName) {
          setActiveProject(void 0);
        }
        playSound("delete");
        break;
      }
      case "switch_project": {
        const project = registry.projects[action.projectName];
        if (!project) break;
        const now = (/* @__PURE__ */ new Date()).toISOString();
        project.stats.switches += 1;
        project.lastSwitched = now;
        project.xp += 1;
        if (!project.milestones.first_switch) {
          project.milestones.first_switch = now;
        }
        if (project.stats.switches >= 10 && !project.milestones.ten_switches) {
          project.milestones.ten_switches = now;
        }
        setProject(action.projectName, project);
        setActiveProject(action.projectName);
        try {
          updateSymlink(project.path);
        } catch {
        }
        playSound("success");
        break;
      }
      case "add_tag": {
        setOverlay({
          type: "text_input",
          prompt: "Add tag:",
          onSubmit: (tag) => {
            const project = registry.projects[action.projectName];
            if (project && !project.tags.includes(tag)) {
              project.tags.push(tag);
              setProject(action.projectName, project);
            }
            setOverlay(null);
            refresh();
          }
        });
        return;
      }
      case "remove_tag": {
        const project = registry.projects[action.projectName];
        if (!project) break;
        project.tags = project.tags.filter((t) => t !== action.tag);
        setProject(action.projectName, project);
        playSound("delete");
        break;
      }
      case "add_note": {
        setOverlay({
          type: "text_input",
          prompt: "Add note:",
          onSubmit: (text) => {
            const project = registry.projects[action.projectName];
            if (project) {
              const now = (/* @__PURE__ */ new Date()).toISOString();
              project.notes.push(`[${now}] ${text}`);
              project.xp += 1;
              if (!project.milestones.first_note) {
                project.milestones.first_note = now;
              }
              setProject(action.projectName, project);
            }
            setOverlay(null);
            refresh();
          }
        });
        return;
      }
      case "delete_note": {
        const project = registry.projects[action.projectName];
        if (!project || action.noteIndex < 0) break;
        project.notes.splice(action.noteIndex, 1);
        setProject(action.projectName, project);
        playSound("delete");
        break;
      }
      case "add_objective": {
        setOverlay({
          type: "text_input",
          prompt: "Add objective:",
          onSubmit: (text) => {
            const project = registry.projects[action.projectName];
            if (project) {
              const createdAt = (/* @__PURE__ */ new Date()).toISOString();
              project.objectives.push({ text, hidden: false, focused: false, completed: false, createdAt });
              setProject(action.projectName, project);
              setRecentAddition({ project: action.projectName, objectiveId: createdAt, until: Date.now() + NEW_OBJECTIVE_GLOW_DURATION });
            }
            setOverlay(null);
            refresh();
          }
        });
        return;
      }
      case "edit_objective": {
        const project = registry.projects[action.projectName];
        if (!project) break;
        const current = project.objectives[action.objectiveIndex]?.text ?? "";
        setOverlay({
          type: "text_input",
          prompt: "Edit objective:",
          defaultValue: current,
          onSubmit: (text) => {
            const p = registry.projects[action.projectName];
            if (p && p.objectives[action.objectiveIndex]) {
              p.objectives[action.objectiveIndex].text = text;
              setProject(action.projectName, p);
            }
            setOverlay(null);
            refresh();
          }
        });
        return;
      }
      case "complete_objective": {
        const project = registry.projects[action.projectName];
        if (!project) break;
        const objective = project.objectives[action.objectiveIndex];
        if (!objective) break;
        objective.completed = true;
        objective.hidden = false;
        objective.focused = false;
        objective.completedAt = (/* @__PURE__ */ new Date()).toISOString();
        setProject(action.projectName, project);
        playSound("completion");
        setCompletedGlow({ project: action.projectName, until: Date.now() + COMPLETED_GLOW_DURATION });
        if (isDirty(project.path)) {
          const openGitMenu = () => {
            const latest = loadRegistry().projects[action.projectName] ?? project;
            setOverlay({
              type: "menu",
              title: getMenuTitle("active", "remote", latest),
              items: getActiveMenuItems("remote", latest, dispatch)
            });
          };
          setOverlay({
            type: "menu",
            title: "Branch has uncommitted changes",
            items: [
              { label: "Open git menu", action: () => openGitMenu() },
              { label: "Later", action: () => {
                setOverlay(null);
              } }
            ]
          });
          refresh();
          return;
        }
        break;
      }
      case "hide_objective": {
        const project = registry.projects[action.projectName];
        if (!project || !project.objectives[action.objectiveIndex]) break;
        project.objectives[action.objectiveIndex].hidden = true;
        project.objectives[action.objectiveIndex].focused = false;
        setProject(action.projectName, project);
        playSound("toggle");
        break;
      }
      case "unhide_objective": {
        const project = registry.projects[action.projectName];
        if (!project || !project.objectives[action.objectiveIndex]) break;
        project.objectives[action.objectiveIndex].hidden = false;
        setProject(action.projectName, project);
        playSound("toggle");
        break;
      }
      case "focus_objective": {
        const project = registry.projects[action.projectName];
        if (!project || !project.objectives[action.objectiveIndex]) break;
        const wasFocused = project.objectives[action.objectiveIndex].focused;
        for (const obj of project.objectives) obj.focused = false;
        project.objectives[action.objectiveIndex].focused = !wasFocused;
        setProject(action.projectName, project);
        playSound("toggle");
        break;
      }
      case "show_hidden_objectives": {
        setOverlay({ type: "hidden_objectives", projectName: action.projectName });
        playSound("enter");
        return;
      }
      case "set_remote": {
        const project = registry.projects[action.projectName];
        setOverlay({
          type: "text_input",
          prompt: "Set remote URL:",
          defaultValue: project?.remote ?? "",
          onSubmit: (url) => {
            const p = registry.projects[action.projectName];
            if (p) {
              p.remote = url;
              if (!p.milestones.git_linked) {
                p.milestones.git_linked = (/* @__PURE__ */ new Date()).toISOString();
              }
              setProject(action.projectName, p);
            }
            setOverlay(null);
            refresh();
          }
        });
        return;
      }
      case "open_folder": {
        try {
          execSync2(`open "${action.projectPath}"`, { stdio: "pipe" });
          playSound("success");
        } catch (err) {
          playSound("error");
          const msg = err instanceof Error ? err.message : String(err);
          setOverlay({ type: "error", message: `Failed to open folder:
${msg}` });
          return;
        }
        break;
      }
      case "open_vscode": {
        try {
          execSync2(`code "${action.projectPath}"`, { stdio: "pipe" });
          playSound("success");
        } catch (err) {
          playSound("error");
          const msg = err instanceof Error ? err.message : String(err);
          setOverlay({ type: "error", message: `Failed to open VS Code:
${msg}` });
          return;
        }
        break;
      }
      case "open_terminal_tab": {
        try {
          const termApp = detectTerminalApp();
          openTerminalTab(termApp, action.projectPath);
          playSound("success");
        } catch (err) {
          playSound("error");
          const msg = err instanceof Error ? err.message : String(err);
          setOverlay({ type: "error", message: `Failed to open terminal tab:
${msg}` });
          return;
        }
        break;
      }
      case "git_add": {
        const project = registry.projects[action.projectName];
        if (!project) break;
        try {
          execSync2("git add .", { cwd: project.path, stdio: "pipe" });
          playSound("success");
        } catch (err) {
          playSound("error");
          const msg = err instanceof Error ? err.message : String(err);
          setOverlay({ type: "error", message: `git add failed:
${msg}` });
          return;
        }
        break;
      }
      case "git_commit": {
        const project = registry.projects[action.projectName];
        if (!project) break;
        const focusedObj = project.objectives.find((o) => o.focused && !o.hidden && !o.completed);
        const firstVisible = project.objectives.find((o) => !o.hidden && !o.completed);
        const defaultMsg = focusedObj ? `work on ${focusedObj.text}` : firstVisible ? `work on ${firstVisible.text}` : "update";
        setOverlay({
          type: "text_input",
          prompt: "Commit message:",
          defaultValue: defaultMsg,
          onSubmit: (msg) => {
            try {
              execSync2(`git commit -m "${msg.replace(/"/g, '\\"')}"`, { cwd: project.path, stdio: "pipe" });
              playSound("success");
            } catch (err) {
              playSound("error");
              const errMsg = err instanceof Error ? err.message : String(err);
              setOverlay({ type: "error", message: `git commit failed:
${errMsg}` });
              return;
            }
            setOverlay(null);
            refresh();
          }
        });
        return;
      }
      case "git_push": {
        const project = registry.projects[action.projectName];
        if (!project) break;
        try {
          execSync2("git push", { cwd: project.path, stdio: "pipe" });
          playSound("success");
        } catch (err) {
          playSound("error");
          const msg = err instanceof Error ? err.message : String(err);
          setOverlay({ type: "error", message: `git push failed:
${msg}` });
          return;
        }
        break;
      }
      case "git_add_commit": {
        const project = registry.projects[action.projectName];
        if (!project) break;
        const focusedObj = project.objectives.find((o) => o.focused && !o.hidden && !o.completed);
        const firstVisible = project.objectives.find((o) => !o.hidden && !o.completed);
        const defaultMsg = focusedObj ? `work on ${focusedObj.text}` : firstVisible ? `work on ${firstVisible.text}` : "update";
        setOverlay({
          type: "text_input",
          prompt: "Commit message:",
          defaultValue: defaultMsg,
          onSubmit: (msg) => {
            try {
              execSync2("git add .", { cwd: project.path, stdio: "pipe" });
              execSync2(`git commit -m "${msg.replace(/"/g, '\\"')}"`, { cwd: project.path, stdio: "pipe" });
              playSound("success");
            } catch (err) {
              playSound("error");
              const errMsg = err instanceof Error ? err.message : String(err);
              setOverlay({ type: "error", message: `git add+commit failed:
${errMsg}` });
              return;
            }
            setOverlay(null);
            refresh();
          }
        });
        return;
      }
      case "git_add_commit_push": {
        const project = registry.projects[action.projectName];
        if (!project) break;
        const focusedObj = project.objectives.find((o) => o.focused && !o.hidden && !o.completed);
        const firstVisible = project.objectives.find((o) => !o.hidden && !o.completed);
        const defaultMsg = focusedObj ? `work on ${focusedObj.text}` : firstVisible ? `work on ${firstVisible.text}` : "update";
        setOverlay({
          type: "text_input",
          prompt: "Commit message:",
          defaultValue: defaultMsg,
          onSubmit: (msg) => {
            try {
              execSync2("git add .", { cwd: project.path, stdio: "pipe" });
              execSync2(`git commit -m "${msg.replace(/"/g, '\\"')}"`, { cwd: project.path, stdio: "pipe" });
              execSync2("git push", { cwd: project.path, stdio: "pipe" });
              playSound("success");
            } catch (err) {
              playSound("error");
              const errMsg = err instanceof Error ? err.message : String(err);
              setOverlay({ type: "error", message: `git add+commit+push failed:
${errMsg}` });
              return;
            }
            setOverlay(null);
            refresh();
          }
        });
        return;
      }
      case "open_remote_browser": {
        const project = registry.projects[action.projectName];
        if (!project) break;
        const browserUrl = getRemoteBrowserUrl(project.path);
        if (!browserUrl) {
          playSound("error");
          setOverlay({ type: "error", message: "No remote URL found for this project." });
          return;
        }
        try {
          execSync2(`open "${browserUrl}"`, { stdio: "pipe" });
          playSound("success");
        } catch (err) {
          playSound("error");
          const errMsg = err instanceof Error ? err.message : String(err);
          setOverlay({ type: "error", message: `Failed to open browser:
${errMsg}` });
          return;
        }
        break;
      }
      case "git_pull": {
        const project = registry.projects[action.projectName];
        if (!project) break;
        try {
          execSync2("git pull", { cwd: project.path, stdio: "pipe" });
          playSound("success");
        } catch (err) {
          playSound("error");
          const errMsg = err instanceof Error ? err.message : String(err);
          setOverlay({ type: "error", message: `git pull failed:
${errMsg}` });
          return;
        }
        break;
      }
      case "git_fetch": {
        const project = registry.projects[action.projectName];
        if (!project) break;
        try {
          execSync2("git fetch", { cwd: project.path, stdio: "pipe" });
          playSound("success");
        } catch (err) {
          playSound("error");
          const errMsg = err instanceof Error ? err.message : String(err);
          setOverlay({ type: "error", message: `git fetch failed:
${errMsg}` });
          return;
        }
        break;
      }
      case "git_refresh_branches": {
        const project = registry.projects[action.projectName];
        if (!project) break;
        try {
          execSync2("git fetch --all --prune", { cwd: project.path, stdio: "pipe" });
          playSound("success");
        } catch (err) {
          playSound("error");
          const errMsg = err instanceof Error ? err.message : String(err);
          setOverlay({ type: "error", message: `Failed to refresh branches:
${errMsg}` });
          return;
        }
        break;
      }
      case "git_checkout": {
        const project = registry.projects[action.projectName];
        if (!project) break;
        try {
          const escapedBranch = action.branch.replace(/"/g, '\\"');
          const command = action.trackRemote ? `git checkout --track "${escapedBranch}"` : `git checkout "${escapedBranch}"`;
          execSync2(command, { cwd: project.path, stdio: "pipe" });
          playSound("success");
        } catch (err) {
          playSound("error");
          const errMsg = err instanceof Error ? err.message : String(err);
          setOverlay({ type: "error", message: `git checkout failed:
${errMsg}` });
          return;
        }
        break;
      }
      case "show_milestones": {
        const project = registry.projects[action.projectName];
        if (!project) break;
        const sorted = Object.entries(project.milestones).sort((a, b) => a[1].localeCompare(b[1]));
        setOverlay({ type: "timeline", milestones: sorted });
        playSound("enter");
        return;
      }
      case "close":
        break;
    }
    setOverlay(null);
    refresh();
  }, [registry, refresh, setCompletedGlow, setRecentAddition]);
  const openMenu = useCallback(() => {
    if (!enteredPanel) return;
    if (enteredPanel === "active" && activeProject) {
      const selectables = getActiveSelectables(activeProject);
      const key = selectables[selectedIndices.active];
      if (!key) return;
      const title = getMenuTitle("active", key, activeProject);
      const items = getActiveMenuItems(key, activeProject, dispatch);
      setOverlay({ type: "menu", title, items });
    }
    if (enteredPanel === "objectives" && activeProject) {
      const visible = activeProject.objectives.filter((o) => !o.hidden && !o.completed);
      const sorted = [...visible].sort((a, b) => a.focused === b.focused ? 0 : a.focused ? -1 : 1);
      const hiddenCount = activeProject.objectives.filter((o) => o.hidden).length;
      const idx = selectedIndices.objectives;
      const addIndex = sorted.length;
      const completedIndex = sorted.length + 1;
      const hiddenIndex = completedIndex + 1;
      if (idx === addIndex) {
        dispatch({ type: "add_objective", projectName: activeProject.name });
        return;
      }
      if (idx === completedIndex) {
        setOverlay({ type: "completed_objectives", projectName: activeProject.name });
        return;
      }
      if (hiddenCount > 0 && idx === hiddenIndex) {
        dispatch({ type: "show_hidden_objectives", projectName: activeProject.name });
        return;
      }
      if (idx >= sorted.length) return;
      const obj = sorted[idx];
      const realIndex = activeProject.objectives.indexOf(obj);
      const title = `Objective: ${obj.text}`;
      const items = getObjectivesMenuItems(realIndex, activeProject, dispatch);
      setOverlay({ type: "menu", title, items });
    }
    if (enteredPanel === "projects") {
      const project = projects[selectedIndices.projects];
      if (!project) return;
      const isActive = project.name === registry.config.activeProject;
      const title = getMenuTitle("projects", "", project);
      const items = getProjectsMenuItems(project, isActive, dispatch);
      setOverlay({ type: "menu", title, items });
    }
  }, [enteredPanel, activeProject, projects, selectedIndices, registry, dispatch]);
  const [muted, setMutedState] = useState3(() => isMuted());
  const [soundProfile, setSoundProfileState] = useState3(() => getSoundProfile());
  useInput3((input, key) => {
    if (overlay) return;
    if (input === "m" && !enteredPanel) {
      const nowMuted = toggleMute();
      setMutedState(nowMuted);
      if (!nowMuted) playSound("toggle");
      return;
    }
    if (input === "s" && !enteredPanel) {
      const next = cycleSoundProfile();
      setSoundProfileState(next);
      playSound("enter");
      return;
    }
    if (input === "q" && !enteredPanel) {
      exit();
      return;
    }
    if (key.escape) {
      playSound("back");
      if (enteredPanel) {
        setEnteredPanel(null);
      } else {
        exit();
      }
      return;
    }
    if (key.tab) {
      if (enteredPanel) {
        const count = selectableCounts[enteredPanel];
        if (count > 0) {
          const nextIdx = (selectedIndices[enteredPanel] + 1) % count;
          playSound("navigate", nextIdx);
          setSelectedIndices((prev) => ({
            ...prev,
            [enteredPanel]: nextIdx
          }));
        }
      } else {
        const currentIdx = PANEL_ORDER.indexOf(focusedPanel);
        const nextIdx = (currentIdx + 1) % PANEL_ORDER.length;
        playSound("navigate", nextIdx);
        setFocusedPanel(PANEL_ORDER[nextIdx]);
      }
      return;
    }
    if (key.return) {
      playSound("enter");
      if (!enteredPanel) {
        const count = selectableCounts[focusedPanel];
        if (count > 0) {
          setEnteredPanel(focusedPanel);
          setSelectedIndices((prev) => ({ ...prev, [focusedPanel]: 0 }));
        }
      } else {
        openMenu();
      }
      return;
    }
    if (enteredPanel && (key.upArrow || key.downArrow)) {
      const count = selectableCounts[enteredPanel];
      if (count > 0) {
        setSelectedIndices((prev) => {
          const current = prev[enteredPanel];
          const next = key.upArrow ? (current - 1 + count) % count : (current + 1) % count;
          playSound("navigate", next);
          return { ...prev, [enteredPanel]: next };
        });
      }
      return;
    }
  });
  const borderColor = (panel) => {
    if (enteredPanel === panel) return "cyan";
    if (!enteredPanel && focusedPanel === panel) return "white";
    return "gray";
  };
  const muteIndicator = muted ? " [muted]" : "";
  const profileIndicator = ` [${soundProfile}]`;
  const helpText = overlay ? "" : enteredPanel ? `\u2191\u2193/tab navigate  enter action  esc back${profileIndicator}${muteIndicator}` : `tab panel  enter open  s sound${profileIndicator}  m ${muted ? "unmute" : "mute"}  q quit`;
  const dashboardContent = /* @__PURE__ */ jsxs4(Fragment, { children: [
    /* @__PURE__ */ jsxs4(Box3, { flexGrow: 1, children: [
      /* @__PURE__ */ jsxs4(
        Box3,
        {
          flexDirection: "column",
          width: "50%",
          borderStyle: "round",
          borderColor: borderColor("active"),
          paddingY: 1,
          children: [
            /* @__PURE__ */ jsx4(Box3, { paddingX: 1, marginBottom: 1, children: /* @__PURE__ */ jsx4(Text4, { bold: true, color: borderColor("active"), children: "Active Project" }) }),
            /* @__PURE__ */ jsx4(
              ActiveProjectPanel,
              {
                project: activeProject,
                entered: enteredPanel === "active",
                selectedIndex: selectedIndices.active
              }
            )
          ]
        }
      ),
      /* @__PURE__ */ jsxs4(Box3, { flexDirection: "column", width: "50%", children: [
        /* @__PURE__ */ jsxs4(
          Box3,
          {
            flexDirection: "column",
            borderStyle: "round",
            borderColor: borderColor("objectives"),
            paddingY: 1,
            children: [
              /* @__PURE__ */ jsx4(Box3, { paddingX: 1, marginBottom: 1, children: /* @__PURE__ */ jsx4(Text4, { bold: true, color: borderColor("objectives"), children: "Objectives" }) }),
              /* @__PURE__ */ jsx4(
                ObjectivesPanel,
                {
                  project: activeProject,
                  entered: enteredPanel === "objectives",
                  selectedIndex: selectedIndices.objectives,
                  completedHighlightColor,
                  newObjectiveHighlightId,
                  newObjectivePulse: !!newObjectiveHighlightId && recentAdditionPulse
                }
              )
            ]
          }
        ),
        /* @__PURE__ */ jsxs4(
          Box3,
          {
            flexDirection: "column",
            borderStyle: "round",
            borderColor: borderColor("projects"),
            paddingY: 1,
            flexGrow: 1,
            children: [
              /* @__PURE__ */ jsxs4(Box3, { paddingX: 1, marginBottom: 1, children: [
                /* @__PURE__ */ jsx4(Text4, { bold: true, color: borderColor("projects"), children: "All Projects" }),
                /* @__PURE__ */ jsxs4(Text4, { dimColor: true, children: [
                  " (",
                  projects.length,
                  ")"
                ] })
              ] }),
              /* @__PURE__ */ jsx4(
                AllProjectsPanel,
                {
                  projects,
                  activeProjectName: registry.config.activeProject,
                  entered: enteredPanel === "projects",
                  selectedIndex: selectedIndices.projects
                }
              )
            ]
          }
        )
      ] })
    ] }),
    helpText && /* @__PURE__ */ jsx4(Box3, { paddingX: 2, paddingY: 1, justifyContent: "center", children: /* @__PURE__ */ jsx4(Text4, { dimColor: true, children: helpText }) })
  ] });
  const overlayContent = overlay ? /* @__PURE__ */ jsx4(Box3, { flexDirection: "column", alignItems: "center", justifyContent: "center", flexGrow: 1, paddingY: 2, children: /* @__PURE__ */ jsxs4(Box3, { flexDirection: "column", width: 50, children: [
    overlay.type === "menu" && /* @__PURE__ */ jsx4(
      ContextMenu,
      {
        title: overlay.title,
        items: overlay.items,
        onClose: () => {
          setOverlay(null);
          refresh();
        }
      }
    ),
    overlay.type === "text_input" && /* @__PURE__ */ jsx4(
      TextInput,
      {
        prompt: overlay.prompt,
        defaultValue: overlay.defaultValue,
        onSubmit: overlay.onSubmit,
        onCancel: () => {
          setOverlay(null);
        }
      }
    ),
    overlay.type === "error" && /* @__PURE__ */ jsx4(
      ErrorOverlay,
      {
        message: overlay.message,
        onClose: () => {
          setOverlay(null);
        }
      }
    ),
    overlay.type === "timeline" && /* @__PURE__ */ jsx4(
      TimelineOverlay,
      {
        milestones: overlay.milestones,
        onClose: () => {
          setOverlay(null);
        }
      }
    ),
    overlay.type === "hidden_objectives" && registry.projects[overlay.projectName] && /* @__PURE__ */ jsx4(
      HiddenObjectivesOverlay,
      {
        project: registry.projects[overlay.projectName],
        onUnhide: (realIndex) => {
          const project = registry.projects[overlay.projectName];
          if (project && project.objectives[realIndex]) {
            project.objectives[realIndex].hidden = false;
            setProject(overlay.projectName, project);
            playSound("toggle");
            refresh();
            if (!project.objectives.some((o) => o.hidden)) {
              setOverlay(null);
            }
          }
        },
        onClose: () => {
          setOverlay(null);
        }
      }
    ),
    overlay.type === "completed_objectives" && registry.projects[overlay.projectName] && /* @__PURE__ */ jsx4(
      CompletedObjectivesOverlay,
      {
        project: registry.projects[overlay.projectName],
        onRelist: (realIndex) => {
          const project = registry.projects[overlay.projectName];
          const objective = project?.objectives[realIndex];
          if (project && objective) {
            objective.completed = false;
            objective.hidden = false;
            objective.focused = false;
            if (!objective.createdAt) {
              objective.createdAt = (/* @__PURE__ */ new Date()).toISOString();
            }
            setProject(overlay.projectName, project);
            setRecentAddition({
              project: overlay.projectName,
              objectiveId: objective.createdAt,
              until: Date.now() + NEW_OBJECTIVE_GLOW_DURATION
            });
            playSound("toggle");
            refresh();
            if (!project.objectives.some((o) => o.completed)) {
              setOverlay(null);
            }
          }
        },
        onClose: () => {
          setOverlay(null);
        }
      }
    )
  ] }) }) : null;
  return /* @__PURE__ */ jsxs4(Box3, { flexDirection: "column", borderStyle: "round", borderColor: "gray", children: [
    /* @__PURE__ */ jsxs4(Box3, { justifyContent: "center", paddingY: 1, children: [
      /* @__PURE__ */ jsx4(Text4, { bold: true, color: "cyan", children: " pina " }),
      /* @__PURE__ */ jsx4(Text4, { dimColor: true, children: "\u2014 project dashboard" })
    ] }),
    overlayContent ?? dashboardContent
  ] });
}

// src/commands/init.tsx
import { useEffect as useEffect2, useState as useState4 } from "react";
import { Text as Text5, Box as Box4 } from "ink";
import path5 from "path";

// src/lib/venv.ts
import fs5 from "fs";
import path4 from "path";
function detectVenv(projectPath) {
  const candidates = [".venv", "venv"];
  for (const candidate of candidates) {
    const venvPath = path4.join(projectPath, candidate);
    if (fs5.existsSync(venvPath) && fs5.statSync(venvPath).isDirectory()) {
      const activatePath = path4.join(venvPath, "bin", "activate");
      if (fs5.existsSync(activatePath)) {
        return candidate;
      }
    }
  }
  return void 0;
}
function getActivateCommand(projectPath, venvName) {
  return `source ${path4.join(projectPath, venvName, "bin", "activate")}`;
}

// src/commands/init.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function InitCommand({ path: projectPath }) {
  const [status, setStatus] = useState4("loading");
  const [projectName, setProjectName] = useState4("");
  useEffect2(() => {
    const name = path5.basename(projectPath);
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
        born: (/* @__PURE__ */ new Date()).toISOString(),
        ...isGitRepo(projectPath) ? { git_linked: (/* @__PURE__ */ new Date()).toISOString() } : {},
        ...venv ? { venv_linked: (/* @__PURE__ */ new Date()).toISOString() } : {}
      }
    });
    setStatus("done");
  }, [projectPath]);
  return /* @__PURE__ */ jsxs5(Box4, { flexDirection: "column", padding: 1, children: [
    status === "loading" && /* @__PURE__ */ jsx5(Text5, { color: "yellow", children: "Initializing project..." }),
    status === "exists" && /* @__PURE__ */ jsxs5(Text5, { color: "red", children: [
      'Project "',
      projectName,
      '" is already registered.'
    ] }),
    status === "done" && /* @__PURE__ */ jsxs5(Box4, { flexDirection: "column", children: [
      /* @__PURE__ */ jsxs5(Text5, { color: "green", children: [
        'Registered "',
        projectName,
        '" as a pina project.'
      ] }),
      /* @__PURE__ */ jsxs5(Text5, { dimColor: true, children: [
        "Path: ",
        projectPath
      ] })
    ] })
  ] });
}

// src/commands/list.tsx
import { Text as Text7, Box as Box6 } from "ink";

// src/components/ProjectTable.tsx
import { Text as Text6, Box as Box5 } from "ink";
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
function ProjectTable({ projects, activeProject }) {
  const maxName = Math.max(...projects.map((p) => p.name.length), 4);
  const maxPath = Math.max(...projects.map((p) => p.path.length), 4);
  return /* @__PURE__ */ jsxs6(Box5, { flexDirection: "column", children: [
    /* @__PURE__ */ jsxs6(Box5, { gap: 2, children: [
      /* @__PURE__ */ jsxs6(Text6, { bold: true, dimColor: true, children: [
        "  ",
        "Name".padEnd(maxName)
      ] }),
      /* @__PURE__ */ jsx6(Text6, { bold: true, dimColor: true, children: "Stage".padEnd(14) }),
      /* @__PURE__ */ jsx6(Text6, { bold: true, dimColor: true, children: "Tags".padEnd(20) }),
      /* @__PURE__ */ jsx6(Text6, { bold: true, dimColor: true, children: "Last Switched".padEnd(12) }),
      /* @__PURE__ */ jsx6(Text6, { bold: true, dimColor: true, children: "XP" })
    ] }),
    projects.map((project) => {
      const isActive = project.name === activeProject;
      const marker = isActive ? "\u25B8" : " ";
      return /* @__PURE__ */ jsxs6(Box5, { gap: 2, children: [
        /* @__PURE__ */ jsxs6(Text6, { color: isActive ? "green" : void 0, children: [
          marker,
          " ",
          project.name.padEnd(maxName)
        ] }),
        /* @__PURE__ */ jsx6(Box5, { width: 14, children: /* @__PURE__ */ jsx6(StatusBadge, { stage: project.stage, stale: project.stale, status: project.status }) }),
        /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: (project.tags.join(", ") || "\u2014").padEnd(20) }),
        /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: (project.lastSwitched ?? "\u2014").padEnd(12) }),
        /* @__PURE__ */ jsx6(Text6, { color: "yellow", children: project.xp })
      ] }, project.name);
    })
  ] });
}

// src/commands/list.tsx
import { jsx as jsx7 } from "react/jsx-runtime";
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
    return /* @__PURE__ */ jsx7(Box6, { padding: 1, children: /* @__PURE__ */ jsx7(Text7, { dimColor: true, children: "No projects found. Run `pina init` or `pina scan` to add projects." }) });
  }
  return /* @__PURE__ */ jsx7(Box6, { padding: 1, children: /* @__PURE__ */ jsx7(ProjectTable, { projects, activeProject: registry.config.activeProject }) });
}

// src/commands/switch.tsx
import { useEffect as useEffect3, useState as useState5 } from "react";
import { Text as Text8, Box as Box7 } from "ink";
import { jsx as jsx8, jsxs as jsxs7 } from "react/jsx-runtime";
function SwitchCommand({ name }) {
  const [status, setStatus] = useState5("loading");
  const [venvCommand, setVenvCommand] = useState5();
  useEffect3(() => {
    const project = getProject(name);
    if (!project) {
      setStatus("not_found");
      return;
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
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
  return /* @__PURE__ */ jsxs7(Box7, { flexDirection: "column", padding: 1, children: [
    status === "loading" && /* @__PURE__ */ jsx8(Text8, { color: "yellow", children: "Switching..." }),
    status === "not_found" && /* @__PURE__ */ jsxs7(Text8, { color: "red", children: [
      'Project "',
      name,
      '" not found.'
    ] }),
    status === "done" && /* @__PURE__ */ jsxs7(Box7, { flexDirection: "column", children: [
      /* @__PURE__ */ jsxs7(Text8, { color: "green", children: [
        'Switched to "',
        name,
        '"'
      ] }),
      venvCommand && /* @__PURE__ */ jsxs7(Text8, { dimColor: true, children: [
        "Activate venv: ",
        venvCommand
      ] })
    ] })
  ] });
}

// src/commands/status.tsx
import { Text as Text9, Box as Box8 } from "ink";
import { jsx as jsx9, jsxs as jsxs8 } from "react/jsx-runtime";
function StatusCommand() {
  const registry = loadRegistry();
  const project = getActiveProject();
  if (!project) {
    return /* @__PURE__ */ jsx9(Box8, { padding: 1, children: /* @__PURE__ */ jsx9(Text9, { dimColor: true, children: "No active project. Run `pina switch <name>` to select one." }) });
  }
  const branch = getCurrentBranch(project.path);
  const dirty = isDirty(project.path);
  const commits = getCommitCount(project.path);
  return /* @__PURE__ */ jsxs8(Box8, { flexDirection: "column", padding: 1, gap: 1, children: [
    /* @__PURE__ */ jsxs8(Box8, { flexDirection: "column", children: [
      /* @__PURE__ */ jsxs8(Box8, { gap: 2, children: [
        /* @__PURE__ */ jsx9(Text9, { bold: true, children: project.name }),
        /* @__PURE__ */ jsx9(StatusBadge, { stage: project.stage, stale: project.stale, status: project.status })
      ] }),
      /* @__PURE__ */ jsx9(Text9, { dimColor: true, children: project.path })
    ] }),
    /* @__PURE__ */ jsxs8(Box8, { flexDirection: "column", children: [
      branch && /* @__PURE__ */ jsxs8(Text9, { children: [
        "Branch: ",
        /* @__PURE__ */ jsx9(Text9, { color: "cyan", children: branch }),
        dirty ? /* @__PURE__ */ jsx9(Text9, { color: "yellow", children: " (dirty)" }) : ""
      ] }),
      project.remote && /* @__PURE__ */ jsxs8(Text9, { children: [
        "Remote: ",
        /* @__PURE__ */ jsx9(Text9, { color: "blue", children: project.remote })
      ] }),
      /* @__PURE__ */ jsxs8(Text9, { children: [
        "Commits: ",
        commits,
        " | Switches: ",
        project.stats.switches,
        " | XP: ",
        project.xp
      ] }),
      project.tags.length > 0 && /* @__PURE__ */ jsxs8(Text9, { children: [
        "Tags: ",
        project.tags.join(", ")
      ] })
    ] }),
    project.notes.length > 0 && /* @__PURE__ */ jsxs8(Box8, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx9(Text9, { bold: true, children: "Notes:" }),
      project.notes.slice(-3).map((note, i) => /* @__PURE__ */ jsxs8(Text9, { dimColor: true, children: [
        "  - ",
        note
      ] }, i))
    ] }),
    Object.keys(project.milestones).length > 0 && /* @__PURE__ */ jsxs8(Box8, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx9(Text9, { bold: true, children: "Milestones:" }),
      Object.entries(project.milestones).map(([key, date]) => /* @__PURE__ */ jsxs8(Text9, { dimColor: true, children: [
        "  ",
        MILESTONE_LABELS[key] ?? key,
        ": ",
        date
      ] }, key))
    ] })
  ] });
}

// src/commands/new.tsx
import { useEffect as useEffect4, useState as useState6 } from "react";
import { Text as Text10, Box as Box9 } from "ink";
import path6 from "path";
import fs6 from "fs";
import { jsx as jsx10, jsxs as jsxs9 } from "react/jsx-runtime";
function NewCommand({ name, path: inputPath }) {
  const [status, setStatus] = useState6("loading");
  const [resolvedPath, setResolvedPath] = useState6("");
  useEffect4(() => {
    const projectPath = inputPath ? path6.resolve(inputPath.replace(/^~/, process.env["HOME"] ?? "")) : process.cwd();
    setResolvedPath(projectPath);
    if (!fs6.existsSync(projectPath)) {
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
        born: (/* @__PURE__ */ new Date()).toISOString(),
        ...isGitRepo(projectPath) ? { git_linked: (/* @__PURE__ */ new Date()).toISOString() } : {},
        ...venv ? { venv_linked: (/* @__PURE__ */ new Date()).toISOString() } : {}
      }
    });
    setStatus("done");
  }, [name, inputPath]);
  return /* @__PURE__ */ jsxs9(Box9, { flexDirection: "column", padding: 1, children: [
    status === "loading" && /* @__PURE__ */ jsx10(Text10, { color: "yellow", children: "Registering project..." }),
    status === "not_found" && /* @__PURE__ */ jsxs9(Text10, { color: "red", children: [
      "Directory not found: ",
      resolvedPath
    ] }),
    status === "exists" && /* @__PURE__ */ jsxs9(Text10, { color: "red", children: [
      'Project "',
      name,
      '" already exists.'
    ] }),
    status === "done" && /* @__PURE__ */ jsxs9(Box9, { flexDirection: "column", children: [
      /* @__PURE__ */ jsxs9(Text10, { color: "green", children: [
        'Registered "',
        name,
        '" as a pina project.'
      ] }),
      /* @__PURE__ */ jsxs9(Text10, { dimColor: true, children: [
        "Path: ",
        resolvedPath
      ] })
    ] })
  ] });
}

// src/commands/archive.tsx
import { useEffect as useEffect5, useState as useState7 } from "react";
import { Text as Text11, Box as Box10 } from "ink";
import { jsx as jsx11, jsxs as jsxs10 } from "react/jsx-runtime";
function ArchiveCommand({ name }) {
  const [status, setStatus] = useState7("loading");
  useEffect5(() => {
    const project = getProject(name);
    if (!project) {
      setStatus("not_found");
      return;
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    project.stage = "archived";
    project.status = "paused";
    project.milestones[`stage:archived:${Date.now()}`] = now;
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
  return /* @__PURE__ */ jsxs10(Box10, { padding: 1, children: [
    status === "loading" && /* @__PURE__ */ jsx11(Text11, { color: "yellow", children: "Archiving..." }),
    status === "not_found" && /* @__PURE__ */ jsxs10(Text11, { color: "red", children: [
      'Project "',
      name,
      '" not found.'
    ] }),
    status === "done" && /* @__PURE__ */ jsxs10(Text11, { color: "green", children: [
      'Archived "',
      name,
      '".'
    ] })
  ] });
}

// src/commands/note.tsx
import { useEffect as useEffect6, useState as useState8 } from "react";
import { Text as Text12, Box as Box11 } from "ink";
import { jsx as jsx12, jsxs as jsxs11 } from "react/jsx-runtime";
function NoteCommand({ text }) {
  const [status, setStatus] = useState8("loading");
  useEffect6(() => {
    const registry = loadRegistry();
    const activeProjectName = registry.config.activeProject;
    if (!activeProjectName || !registry.projects[activeProjectName]) {
      setStatus("no_project");
      return;
    }
    const project = registry.projects[activeProjectName];
    const now = (/* @__PURE__ */ new Date()).toISOString();
    project.notes.push(`[${now}] ${text}`);
    project.xp += 1;
    if (!project.milestones.first_note) {
      project.milestones.first_note = now;
    }
    setProject(activeProjectName, project);
    setStatus("done");
  }, [text]);
  return /* @__PURE__ */ jsxs11(Box11, { padding: 1, children: [
    status === "loading" && /* @__PURE__ */ jsx12(Text12, { color: "yellow", children: "Adding note..." }),
    status === "no_project" && /* @__PURE__ */ jsx12(Text12, { color: "red", children: "No active project. Run `pina switch <name>` first." }),
    status === "done" && /* @__PURE__ */ jsx12(Text12, { color: "green", children: "Note added." })
  ] });
}

// src/commands/scan.tsx
import { useState as useState9, useEffect as useEffect7 } from "react";
import { Text as Text13, Box as Box12, useInput as useInput4, useApp as useApp2 } from "ink";

// src/lib/detector.ts
import fs7 from "fs";
import path7 from "path";
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
  if (fs7.existsSync(path7.join(dir, ".venv"))) return ".venv";
  if (fs7.existsSync(path7.join(dir, "venv"))) return "venv";
  return void 0;
}
function detectAiConfig(dir) {
  if (fs7.existsSync(path7.join(dir, "CLAUDE.md"))) return "CLAUDE.md";
  if (fs7.existsSync(path7.join(dir, ".claude"))) return ".claude";
  return void 0;
}
function detectProject(dir) {
  const name = path7.basename(dir);
  const tags = /* @__PURE__ */ new Set();
  let matched = false;
  for (const signal of SIGNALS) {
    const fullPath = path7.join(dir, signal.file);
    const exists = signal.isDir ? fs7.existsSync(fullPath) && fs7.statSync(fullPath).isDirectory() : fs7.existsSync(fullPath);
    if (exists) {
      matched = true;
      for (const tag of signal.tags) {
        tags.add(tag);
      }
    }
  }
  const hasGit = fs7.existsSync(path7.join(dir, ".git"));
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
function scanDirectory(dir, skipPaths) {
  const resolvedDir = path7.resolve(dir.replace(/^~/, process.env["HOME"] ?? ""));
  if (!fs7.existsSync(resolvedDir)) return [];
  const entries = fs7.readdirSync(resolvedDir, { withFileTypes: true });
  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path7.join(resolvedDir, entry.name);
    if (skipPaths?.has(fullPath)) continue;
    const detected = detectProject(fullPath);
    if (detected) {
      projects.push(detected);
    }
  }
  return projects.sort((a, b) => a.name.localeCompare(b.name));
}

// src/commands/scan.tsx
import { jsx as jsx13, jsxs as jsxs12 } from "react/jsx-runtime";
function ScanCommand({ directory }) {
  const { exit } = useApp2();
  const [detected, setDetected] = useState9([]);
  const [selected, setSelected] = useState9(/* @__PURE__ */ new Set());
  const [cursor, setCursor] = useState9(0);
  const [phase, setPhase] = useState9("scanning");
  const [registered, setRegistered] = useState9(0);
  const [skippedCount, setSkippedCount] = useState9(0);
  useEffect7(() => {
    const registry = loadRegistry();
    const existingPaths = new Set(Object.values(registry.projects).map((p) => p.path));
    const existingNames = new Set(Object.keys(registry.projects));
    const projects = scanDirectory(directory, existingPaths);
    const d = /* @__PURE__ */ new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);
    const suffix = `_indexed-${mm}${dd}${yy}`;
    const renamed = projects.map(
      (p) => existingNames.has(p.name) ? { ...p, name: `${p.name}${suffix}` } : p
    );
    setSkippedCount(0);
    setDetected(renamed);
    setSelected(new Set(renamed.map((_, i) => i)));
    setPhase(renamed.length > 0 ? "selecting" : "done");
  }, [directory]);
  useInput4((input, key) => {
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
        const now = (/* @__PURE__ */ new Date()).toISOString();
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
    return /* @__PURE__ */ jsx13(Box12, { padding: 1, children: /* @__PURE__ */ jsxs12(Text13, { color: "yellow", children: [
      "Scanning ",
      directory,
      "..."
    ] }) });
  }
  if (phase === "done" && detected.length === 0) {
    return /* @__PURE__ */ jsx13(Box12, { padding: 1, flexDirection: "column", children: skippedCount > 0 ? /* @__PURE__ */ jsxs12(Text13, { dimColor: true, children: [
      "All ",
      skippedCount,
      " detected projects are already registered."
    ] }) : /* @__PURE__ */ jsxs12(Text13, { dimColor: true, children: [
      "No projects detected in ",
      directory,
      "."
    ] }) });
  }
  if (phase === "done") {
    return /* @__PURE__ */ jsx13(Box12, { padding: 1, children: /* @__PURE__ */ jsxs12(Text13, { color: "green", children: [
      "Registered ",
      registered,
      " project",
      registered !== 1 ? "s" : "",
      "."
    ] }) });
  }
  return /* @__PURE__ */ jsxs12(Box12, { flexDirection: "column", padding: 1, children: [
    /* @__PURE__ */ jsxs12(Text13, { bold: true, children: [
      "Found ",
      detected.length,
      " new project",
      detected.length !== 1 ? "s" : "",
      skippedCount > 0 ? /* @__PURE__ */ jsxs12(Text13, { dimColor: true, children: [
        " (",
        skippedCount,
        " already registered)"
      ] }) : ""
    ] }),
    /* @__PURE__ */ jsx13(Text13, { dimColor: true, children: " " }),
    detected.map((project, idx) => {
      const isSelected = selected.has(idx);
      const isCursor = cursor === idx;
      const indicator = isSelected ? "\u25C9" : "\u25CB";
      const tags = project.tags.length > 0 ? `[${project.tags.join(", ")}]` : "[unknown]";
      return /* @__PURE__ */ jsxs12(Text13, { children: [
        isCursor ? /* @__PURE__ */ jsx13(Text13, { color: "cyan", children: "\u276F " }) : "  ",
        /* @__PURE__ */ jsxs12(Text13, { color: isSelected ? "green" : "gray", children: [
          indicator,
          " "
        ] }),
        /* @__PURE__ */ jsx13(Text13, { bold: isCursor, children: project.name.padEnd(24) }),
        /* @__PURE__ */ jsx13(Text13, { dimColor: true, children: tags })
      ] }, project.path);
    }),
    /* @__PURE__ */ jsx13(Text13, { dimColor: true, children: " " }),
    /* @__PURE__ */ jsx13(Text13, { dimColor: true, children: "\u2191\u2193 navigate  space toggle  a all  enter confirm  q quit" })
  ] });
}

// src/cli.ts
var program = new Command();
program.name("pina").description("Personal project management CLI").version("0.1.0").action(() => {
  render(React10.createElement(Dashboard));
});
program.command("init").description("Register the current directory as a pina project").action(() => {
  render(React10.createElement(InitCommand, { path: process.cwd() }));
});
program.command("new <name>").description("Register an existing directory as a project").option("-p, --path <path>", "Path to the project directory").action((name, opts) => {
  render(React10.createElement(NewCommand, { name, path: opts.path }));
});
program.command("scan <directory>").description("Scan a directory and detect projects").action((directory) => {
  render(React10.createElement(ScanCommand, { directory }));
});
program.command("switch <name>").description("Switch to a project").action((name) => {
  render(React10.createElement(SwitchCommand, { name }));
});
program.command("list").alias("ls").description("List all projects").option("-s, --stage <stage>", "Filter by stage").option("-t, --tag <tag>", "Filter by tag").action((opts) => {
  render(React10.createElement(ListCommand, opts));
});
program.command("status").description("Show current project status").action(() => {
  render(React10.createElement(StatusCommand));
});
program.command("note <text>").description("Add a note to the current project").action((text) => {
  render(React10.createElement(NoteCommand, { text }));
});
program.command("archive <name>").description("Archive a project").action((name) => {
  render(React10.createElement(ArchiveCommand, { name }));
});
program.command("mute").description("Mute sound effects").action(() => {
  setMuted(true);
  console.log("Sound effects muted.");
});
program.command("unmute").description("Unmute sound effects").action(() => {
  setMuted(false);
  console.log("Sound effects unmuted.");
});
program.command("sound [profile]").description("Get or set sound profile (default, cyberpunk, forest, dreamy)").action((profile) => {
  if (!profile) {
    console.log(`Current sound profile: ${getSoundProfile()}`);
    console.log(`Available: ${SOUND_PROFILES.join(", ")}`);
    return;
  }
  if (!SOUND_PROFILES.includes(profile)) {
    console.log(`Unknown profile "${profile}". Available: ${SOUND_PROFILES.join(", ")}`);
    return;
  }
  setSoundProfile(profile);
  console.log(`Sound profile set to: ${profile}`);
});
program.parse();
//# sourceMappingURL=cli.js.map