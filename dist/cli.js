#!/usr/bin/env node

// src/cli.ts
import { Command } from "commander";
import { render } from "ink";
import React12 from "react";

// src/commands/dashboard.tsx
import { useState as useState5, useMemo, useCallback, useEffect as useEffect4, useRef as useRef2 } from "react";
import { execSync as execSync3 } from "child_process";
import { Text as Text6, Box as Box5, useInput as useInput4, useApp, useStdout as useStdout3 } from "ink";

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
function getCommitHistory(dir, limit = 50) {
  if (!isGitRepo(dir)) return [];
  try {
    const output = execSync(`git log -n ${limit} --pretty=format:%H%x1f%h%x1f%s%x1f%cr`, {
      cwd: dir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    if (!output) return [];
    return output.split("\n").map((line) => {
      const [hash, shortHash, subject, relativeDate] = line.split("");
      return { hash, shortHash, subject, relativeDate };
    });
  } catch {
    return [];
  }
}
function resetToCommit(dir, hash, mode = "mixed") {
  if (!isGitRepo(dir)) return false;
  try {
    execSync(`git reset --${mode} ${hash}`, {
      cwd: dir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    return true;
  } catch {
    return false;
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

// src/lib/theme.ts
import * as fs4 from "fs";
import * as path3 from "path";
import * as os3 from "os";
var PALETTES = {
  "ube-matcha": {
    cream: "#ede6d8",
    oat: "#a8a090",
    dimCream: "#7a7468",
    matcha: "#a3c585",
    slushie: "#a6b8e8",
    ube: "#b89bd9",
    peach: "#e8b89c",
    rose: "#e09a9a",
    butter: "#e8d49c",
    shimmer: ["#b8d49a", "#a3c585", "#8fb56e", "#a3c585", "#b8d49a", "#cce4af", "#b8d49a", "#a3c585"],
    stage: {
      planning: "#b89bd9",
      scaffolding: "#e8d49c",
      development: "#a6b8e8",
      stable: "#a3c585",
      complete: "#a3c585",
      archived: "#7a7468"
    }
  },
  // Piña colada — tropical: coconut cream, pineapple, palm green, rum gold.
  "colada": {
    cream: "#fef6e4",
    oat: "#c8b89a",
    dimCream: "#8a7a5a",
    matcha: "#7fb069",
    // palm green
    slushie: "#5fb3a8",
    // ocean teal
    ube: "#f4a261",
    // pineapple
    peach: "#ee8959",
    // mango
    rose: "#e76f51",
    // hibiscus
    butter: "#f6c453",
    // rum gold
    shimmer: ["#f4a261", "#f6c453", "#fce38a", "#f6c453", "#f4a261", "#ee8959", "#f4a261", "#f6c453"],
    stage: {
      planning: "#5fb3a8",
      scaffolding: "#f6c453",
      development: "#f4a261",
      stable: "#7fb069",
      complete: "#7fb069",
      archived: "#8a7a5a"
    }
  },
  // Cyberpunk — neon blue and pink on near-black sensibility.
  "cyberpunk": {
    cream: "#e8f1ff",
    oat: "#4a4d6a",
    dimCream: "#6a6d8a",
    matcha: "#00f0ff",
    // neon cyan
    slushie: "#3a86ff",
    // electric blue
    ube: "#ff006e",
    // hot pink
    peach: "#ff4081",
    // magenta-pink
    rose: "#ff2e63",
    // alarm red-pink
    butter: "#fbff12",
    // neon yellow
    shimmer: ["#ff006e", "#ff4081", "#ff70a6", "#ff4081", "#ff006e", "#d4006e", "#ff006e", "#ff4081"],
    stage: {
      planning: "#ff006e",
      scaffolding: "#fbff12",
      development: "#3a86ff",
      stable: "#00f0ff",
      complete: "#00f0ff",
      archived: "#4a4d6a"
    }
  }
};
var PALETTE_ORDER = ["ube-matcha", "colada", "cyberpunk"];
var theme = {
  cream: "",
  oat: "",
  dimCream: "",
  matcha: "",
  slushie: "",
  ube: "",
  peach: "",
  rose: "",
  butter: ""
};
var sectionColor = {
  active: "",
  objectives: "",
  projects: ""
};
var SHIMMER_COLORS = [];
var STAGE_COLOR = {
  planning: "",
  scaffolding: "",
  development: "",
  stable: "",
  complete: "",
  archived: ""
};
var PINA_DIR2 = path3.join(os3.homedir(), ".pina");
var FILE = path3.join(PINA_DIR2, "palette.json");
function loadSaved() {
  try {
    const data = JSON.parse(fs4.readFileSync(FILE, "utf-8"));
    if (data && typeof data.palette === "string" && data.palette in PALETTES) {
      return data.palette;
    }
  } catch {
  }
  return "ube-matcha";
}
function saveSelection(name) {
  try {
    fs4.mkdirSync(PINA_DIR2, { recursive: true });
    fs4.writeFileSync(FILE, JSON.stringify({ palette: name }, null, 2), "utf-8");
  } catch {
  }
}
var currentName = "ube-matcha";
function setPalette(name) {
  const p = PALETTES[name];
  if (!p) return;
  currentName = name;
  theme.cream = p.cream;
  theme.oat = p.oat;
  theme.dimCream = p.dimCream;
  theme.matcha = p.matcha;
  theme.slushie = p.slushie;
  theme.ube = p.ube;
  theme.peach = p.peach;
  theme.rose = p.rose;
  theme.butter = p.butter;
  sectionColor.active = p.matcha;
  sectionColor.objectives = p.slushie;
  sectionColor.projects = p.ube;
  SHIMMER_COLORS.length = 0;
  SHIMMER_COLORS.push(...p.shimmer);
  Object.assign(STAGE_COLOR, p.stage);
  saveSelection(name);
}
function getPaletteName() {
  return currentName;
}
function cyclePalette() {
  const idx = PALETTE_ORDER.indexOf(currentName);
  const next = PALETTE_ORDER[(idx + 1) % PALETTE_ORDER.length];
  setPalette(next);
  return next;
}
setPalette(loadSaved());

// src/components/StatusBadge.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function StatusBadge({ stage, stale, status }) {
  if (status === "paused") {
    return /* @__PURE__ */ jsx(Text, { color: theme.butter, bold: true, children: "[paused]" });
  }
  if (stale) {
    return /* @__PURE__ */ jsxs(Text, { color: theme.rose, children: [
      "[",
      stage,
      " \xB7 stale]"
    ] });
  }
  return /* @__PURE__ */ jsxs(Text, { color: STAGE_COLOR[stage], children: [
    "[",
    stage,
    "]"
  ] });
}

// src/components/ContextMenu.tsx
import { useState, useEffect } from "react";
import { Text as Text2, Box, useInput } from "ink";

// src/lib/sound.ts
import { spawn } from "child_process";
import fs5 from "fs";
import path4 from "path";
import { fileURLToPath } from "url";
var __dirname = path4.dirname(fileURLToPath(import.meta.url));
function resolveSoundsDir() {
  let current = __dirname;
  const root = path4.parse(current).root;
  while (true) {
    const candidate = path4.join(current, "sounds");
    if (fs5.existsSync(candidate)) return candidate;
    if (current === root) break;
    current = path4.dirname(current);
  }
  return path4.join(__dirname, "..", "..", "sounds");
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
    file = path4.join(SOUNDS_DIR, profile, `navigate_${semitone}.wav`);
  } else {
    file = path4.join(SOUNDS_DIR, profile, SOUND_FILES[event]);
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

// src/lib/menuDefaults.ts
import * as fs6 from "fs";
import * as path5 from "path";
import * as os4 from "os";
var PINA_DIR3 = path5.join(os4.homedir(), ".pina");
var FILE2 = path5.join(PINA_DIR3, "menu-defaults.json");
function load() {
  try {
    return JSON.parse(fs6.readFileSync(FILE2, "utf-8"));
  } catch {
    return {};
  }
}
function save(d) {
  fs6.mkdirSync(PINA_DIR3, { recursive: true });
  fs6.writeFileSync(FILE2, JSON.stringify(d, null, 2), "utf-8");
}
function getMenuDefault(title) {
  return load()[title];
}
function setMenuDefault(title, label) {
  const d = load();
  d[title] = label;
  save(d);
}
function clearMenuDefault(title) {
  const d = load();
  delete d[title];
  save(d);
}

// src/components/ContextMenu.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function useShimmerColor() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % SHIMMER_COLORS.length), 200);
    return () => clearInterval(t);
  }, []);
  return SHIMMER_COLORS[idx];
}
function ContextMenu({ title, items, onClose, menuKind }) {
  const goldenColor = useShimmerColor();
  const storeKey = menuKind ?? title;
  const [defaultKey, setDefaultKey] = useState(() => getMenuDefault(storeKey));
  const [cursor, setCursor] = useState(() => {
    const def = getMenuDefault(storeKey);
    if (def) {
      const idx = items.findIndex((i) => (i.key ?? i.label) === def);
      if (idx >= 0) return idx;
    }
    return 0;
  });
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
    if (input === "d" && !key.ctrl && !key.meta) {
      const item = items[cursor];
      if (item) {
        const id = item.key ?? item.label;
        if (defaultKey === id) {
          clearMenuDefault(storeKey);
          setDefaultKey(void 0);
        } else {
          setMenuDefault(storeKey, id);
          setDefaultKey(id);
        }
        playSound("toggle");
      }
      return;
    }
  });
  return /* @__PURE__ */ jsxs2(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: theme.matcha,
      paddingX: 2,
      paddingY: 1,
      children: [
        /* @__PURE__ */ jsx2(Text2, { bold: true, color: theme.matcha, children: title }),
        /* @__PURE__ */ jsx2(Text2, { children: " " }),
        items.map((item, i) => {
          const isCursor = cursor === i;
          const isDefault = (item.key ?? item.label) === defaultKey;
          return /* @__PURE__ */ jsxs2(Text2, { children: [
            /* @__PURE__ */ jsx2(Text2, { color: theme.matcha, children: isCursor ? "\u276F " : "  " }),
            /* @__PURE__ */ jsx2(Text2, { inverse: isCursor, color: isDefault ? goldenColor : void 0, children: item.label }),
            isDefault && /* @__PURE__ */ jsx2(Text2, { color: goldenColor, children: " \u2605" })
          ] }, i);
        }),
        /* @__PURE__ */ jsx2(Text2, { children: " " }),
        /* @__PURE__ */ jsx2(Text2, { color: theme.dimCream, children: "\u2191\u2193 navigate  enter select  d set default  esc cancel" })
      ]
    }
  );
}

// src/components/TextInput.tsx
import { useState as useState2 } from "react";
import { Text as Text3, Box as Box2, useInput as useInput2 } from "ink";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function TextInput({ prompt, defaultValue = "", multiline = false, onSubmit, onCancel }) {
  const [value, setValue] = useState2(defaultValue);
  const [cursor, setCursor] = useState2(defaultValue.length);
  useInput2((input, key) => {
    if (key.escape) {
      playSound("back");
      onCancel();
      return;
    }
    if (multiline && key.ctrl && input === "d") {
      playSound("success");
      onSubmit(value);
      return;
    }
    if (key.return) {
      if (multiline) {
        setValue((prev) => prev.slice(0, cursor) + "\n" + prev.slice(cursor));
        setCursor((prev) => prev + 1);
        return;
      }
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
  if (multiline) {
    const renderMultiline = () => {
      const full = before + cursorChar + after;
      const parts = [];
      let i = 0;
      for (const ch of full) {
        if (i === cursor) {
          parts.push(/* @__PURE__ */ jsx3(Text3, { inverse: true, children: ch === "\n" ? " " : ch }, i));
          if (ch === "\n") parts.push(/* @__PURE__ */ jsx3(Text3, { children: "\n" }, `${i}-nl`));
        } else {
          parts.push(/* @__PURE__ */ jsx3(Text3, { children: ch }, i));
        }
        i++;
      }
      return parts;
    };
    return /* @__PURE__ */ jsxs3(
      Box2,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: theme.matcha,
        paddingX: 2,
        paddingY: 1,
        children: [
          /* @__PURE__ */ jsx3(Text3, { bold: true, color: theme.matcha, children: prompt }),
          /* @__PURE__ */ jsx3(Text3, { children: " " }),
          /* @__PURE__ */ jsx3(Text3, { children: renderMultiline() }),
          /* @__PURE__ */ jsx3(Text3, { children: " " }),
          /* @__PURE__ */ jsx3(Text3, { color: theme.dimCream, children: "enter newline  ctrl+d submit  esc cancel" })
        ]
      }
    );
  }
  return /* @__PURE__ */ jsxs3(
    Box2,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: theme.matcha,
      paddingX: 2,
      paddingY: 1,
      children: [
        /* @__PURE__ */ jsx3(Text3, { bold: true, color: theme.matcha, children: prompt }),
        /* @__PURE__ */ jsx3(Text3, { children: " " }),
        /* @__PURE__ */ jsxs3(Text3, { children: [
          /* @__PURE__ */ jsx3(Text3, { children: before }),
          /* @__PURE__ */ jsx3(Text3, { inverse: true, children: cursorChar }),
          /* @__PURE__ */ jsx3(Text3, { children: after })
        ] }),
        /* @__PURE__ */ jsx3(Text3, { children: " " }),
        /* @__PURE__ */ jsx3(Text3, { color: theme.dimCream, children: "enter confirm  esc cancel" })
      ]
    }
  );
}

// src/components/PinaHeader.tsx
import React3, { useEffect as useEffect2, useState as useState3 } from "react";
import { Text as Text4, Box as Box3, useStdout } from "ink";
import { jsx as jsx4 } from "react/jsx-runtime";
var PRIMARY_ART = [
  "   ___  _          ",
  "  / _ \\(_)__  ___ _",
  " / ___/ / _ \\/ _ `/",
  "/_/  /_/_//_/\\_,_/"
];
var STAGE_ADVANCED_ART = [
  "       __                          __                          __",
  `  ___ / /____ ____ ____   ___ ____/ /  _____ ____  _______ ___/ /`,
  " (_-</ __/ _ `/ _ `/ -_) / _ `/ _  / |/ / _ `/ _ \\ /__/ -_) _  / ",
  ` /__/\\__/\\_,_/\\_, /\\__/  \\_,_/\\_,_/|___/\\_,_/_//_/\\__\\__/\\_,_/  `
];
var PROJECT_COMPLETED_ART = [
  "                    _         __                        __    __         __",
  "   ___  _______    (_)__ ____/ /_  _______  __ _  ___  / /__ / /____ ___/ /",
  "  / _ \\/ __/ _ \\  / / -_) __/ __/ / __/ _ \\/  ' \\/ _ \\/ / -_) __/ -_) _  / ",
  " / .__/_/  \\___/_/ /\\__\\__/\\__/  \\__/\\___/_/_/_/ .__/_/\\__/\\__/\\__/\\_,_/  "
];
var PROJECT_ARCHIVED_ART = [
  "                    _         __                 __   _             __",
  "   ___  _______    (_)__ ____/ /_  ___ _________/ /  (_)  _____ ___/ /",
  "  / _ \\/ __/ _ \\  / / -_) __/ __/ / _ `/ __/ __/ _ \\/ / |/ / -_) _  / ",
  " / .__/_/  \\___/_/ /\\__/\\__/\\__/  \\_,_/_/  \\__/_//_/_/|___/\\__/\\_,_/  "
];
var MIN_WIDTH = PRIMARY_ART.reduce((max, line) => Math.max(max, line.length), 0);
var COLOR_INTERVAL_MS = 90;
var COLOR_DURATION_MS = 1200;
var PROJECT_SWITCHED_ART = [
  "                    _         __              _ __      __          __",
  "   ___  _______    (_)__ ____/ /_  ____    __(_) /_____/ /  ___ ___/ /",
  "  / _ \\/ __/ _ \\  / / -_) __/ __/ (_-< |/|/ / / __/ __/ _ \\/ -_) _  / ",
  " / .__/_/  \\___/_/ /\\__/\\__/\\__/ /___/__,__/_/\\__/\\__/_//_/\\__/\\_,_/  "
];
var FOLDER_OPENED_ART = [
  "   ___     __   __                                    __",
  "  / _/__  / /__/ /__ ____  ___  ___  ___ ___  ___ ___/ /",
  " / _/ _ \\/ / _  / -_) __/ / _ \\/ _ \\/ -_) _ \\/ -_) _  / ",
  "/_/ \\___/_/\\_,_/\\__/\\_/    \\___/ .__/\\__/_//_/\\__/\\_,_/  "
];
var VSCODE_OPENED_ART = [
  "  _   ______  _____        __                                __",
  " | | / / __/ / ___/__  ___/ /__   ___  ___  ___ ___  ___ ___/ /",
  " | |/ /   / /__/ _ \\/ _  / -_) / _ \\/ _ \\/ -_) _ \\/ -_) _  / ",
  " |___/___/  \\___/\\___/\\_,_/\\__/  \\___/ .__/\\__/_//_/\\__/\\_,_/  "
];
var TERMINAL_OPENED_ART = [
  "  __                _           __                            __",
  " / /____ ______ _  (_)__  ___ _/ / ___  ___  ___ ___  ___ ___/ /",
  "/ __/ -_) __/  ' \\/ / _ \\/ _ `/ / / _ \\/ _ \\/ -_) _ \\/ -_) _  / ",
  "\\__/\\__/_/ /_/_/_/_/_//_/\\_,_/_/  \\___/ .__/\\__/_//_/\\__/\\_,_/  "
];
var GIT_ADD_ART = [
  "        _ __            __   __       __  ",
  "  ___ _(_) /_  ___ ____/ /__/ / ___  / /__",
  " / _ `/ / __/ / _ `/ _  / _  / / _ \\/  '_/",
  " \\_, /_/\\__/  \\_,_/\\_,_/\\_,_/  \\___/_/\\_/ "
];
var GIT_COMMIT_ART = [
  "        _ __                         _ __         __  ",
  "  ___ _(_) /_  _______  __ _  __ _  (_) /_  ___  / /__",
  " / _ `/ / __/ / __/ _ \\/  ' \\/  ' \\/ / __/ / _ \\/  '_/",
  " \\_, /_/\\__/  \\__/\\___/_/_/_/_/_/_/_/\\__/  \\___/_/\\_/ "
];
var GIT_PUSH_ART = [
  "        _ __                  __          __  ",
  "  ___ _(_) /_  ___  __ _____ / /    ___  / /__",
  " / _ `/ / __/ / _ \\/ // (_-</ _ \\  / _ \\/  '_/",
  " \\_, /_/\\__/ / .__/\\_,_/___/_//_/  \\___/_/\\_\\ "
];
var BROWSER_OPENED_ART = [
  "   __                                                          __",
  "  / /  _______ _    _____ ___ ____  ___  ___  ___ ___  ___ ___/ /",
  " / _ \\/ __/ _ \\ |/|/ (_-</ -_) __/ / _ \\/ _ \\/ -_) _ \\/ -_) _  / ",
  "/_.__/_/  \\___/__,__/___/\\__/\\_/   \\___/ .__/\\__/_//_/\\__/\\_,_/  "
];
var GIT_PULL_ART = [
  "        _ __              ____       __  ",
  "  ___ _(_) /_  ___  __ __/ / / ___  / /__",
  " / _ `/ / __/ / _ \\ // / / / / _ \\/  '_/",
  " \\_, /_/\\__/ / .__/_\\_,_/_/_/  \\___/_/\\_/ "
];
var GIT_FETCH_ART = [
  "        _ __    ___    __      __          __  ",
  "  ___ _(_) /_  / _/__ / /_____/ /    ___  / /__",
  " / _ `/ / __/ / _/ -_) __/ __/ _ \\  / _ \\/  '_/",
  " \\_, /_/\\__/ /_/ \\__/\\__/\\__/_//_/  \\___/_/\\_/ "
];
var GIT_REFRESH_ART = [
  "        _ __            ___            __          __  ",
  "  ___ _(_) /_  _______ / _/______ ___ / /    ___  / /__",
  " / _ `/ / __/ / __/ -_) _/ __/ -_|_-</ _ \\  / _ \\/  '_/",
  " \\_, /_/\\__/ /_/  \\__/_//_/  \\__/___/_//_/  \\___/_/\\_/ "
];
var GIT_CHECKOUT_ART = [
  "        _ __        __           __             __         __  ",
  "  ___ _(_) /_  ____/ /  ___ ____/ /_____  __ __/ /_  ___  / /__",
  " / _ `/ / __/ / __/ _ \\ / -_) __/  '_/ _ \\/ // / __/ / _ \\/  '_/",
  " \\_, /_/\\__/  \\__/_//_/\\__/_\\__/_/\\_/\\___/\\_,_/\\__/  \\___/_/\\_/ "
];
var ASSET_CREATED_ART = [
  "                   __                     __         __",
  " ___ ____ ___ ___ / /_  ___________ ___ _/ /____ ___/ /",
  "/ _ `(_-<(_-</ -_) __/ / __/ __/ -_) _ `/ __/ -_) _  / ",
  "\\_,_/___/___/\\__/\\__/  \\__/_/  \\__/\\_,_/\\__/\\__/\\_,_/ "
];
var OBJECTIVE_ADDED_ART = [
  "       __     _         __  _                    __   __       __",
  " ___  / /    (_)__ ____/ /_(_)  _____   ___ ____/ /__/ /__ ___/ /",
  "/ _ \\/ _ \\  / / -_) __/ __/ / |/ / -_) / _ `/ _  / _  / -_) _  / ",
  "\\___/_.__/_/ /\\__/\\__/\\__/_/|___/\\__/  \\_,_/\\_,_/\\_,_/\\__/\\_,_/  "
];
var OBJECTIVE_COMPLETED_ART = [
  "       __     _         __  _                                __    __         __",
  " ___  / /    (_)__ ____/ /_(_)  _____   _______  __ _  ___  / /__ / /____ ___/ /",
  "/ _ \\/ _ \\  / / -_) __/ __/ / |/ / -_) / __/ _ \\/  ' \\/ _ \\/ / -_) __/ -_) _  / ",
  "\\___/_.__/_/ /\\__/\\__/\\__/_/|___/\\__/  \\__/_\\___/_/_/_/ .__/_/\\__/\\__/\\__/\\_,_/  "
];
var TITLE_VARIANTS = {
  default: { art: PRIMARY_ART, compactLabel: "pina" },
  stageAdvanced: { art: STAGE_ADVANCED_ART, compactLabel: "stage advanced" },
  projectCompleted: { art: PROJECT_COMPLETED_ART, compactLabel: "project completed" },
  projectArchived: { art: PROJECT_ARCHIVED_ART, compactLabel: "project archived" },
  projectSwitched: { art: PROJECT_SWITCHED_ART, compactLabel: "project switched" },
  folderOpened: { art: FOLDER_OPENED_ART, compactLabel: "folder opened" },
  vscodeOpened: { art: VSCODE_OPENED_ART, compactLabel: "VS Code opened" },
  terminalOpened: { art: TERMINAL_OPENED_ART, compactLabel: "terminal opened" },
  gitAdd: { art: GIT_ADD_ART, compactLabel: "git add ok" },
  gitCommit: { art: GIT_COMMIT_ART, compactLabel: "git commit ok" },
  gitPush: { art: GIT_PUSH_ART, compactLabel: "git push ok" },
  browserOpened: { art: BROWSER_OPENED_ART, compactLabel: "browser opened" },
  gitPull: { art: GIT_PULL_ART, compactLabel: "git pull ok" },
  gitFetch: { art: GIT_FETCH_ART, compactLabel: "git fetch ok" },
  gitRefresh: { art: GIT_REFRESH_ART, compactLabel: "git refresh ok" },
  gitCheckout: { art: GIT_CHECKOUT_ART, compactLabel: "git checkout ok" },
  assetCreated: { art: ASSET_CREATED_ART, compactLabel: "asset created" },
  objectiveAdded: { art: OBJECTIVE_ADDED_ART, compactLabel: "objective added" },
  objectiveCompleted: { art: OBJECTIVE_COMPLETED_ART, compactLabel: "objective completed" }
};
function getLineColor(index, compact, shift, palette) {
  if (palette.length === 0) return theme.matcha;
  if (compact) return palette[shift % palette.length];
  return palette[(index + shift) % palette.length];
}
function PinaHeader({ variant = "default" }) {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;
  const [colorShift, setColorShift] = useState3(0);
  const paletteColors = React3.useMemo(
    () => [theme.matcha, theme.slushie, theme.ube, theme.peach],
    [theme.matcha, theme.slushie, theme.ube, theme.peach]
  );
  const paletteLength = paletteColors.length || 1;
  const config = TITLE_VARIANTS[variant] ?? TITLE_VARIANTS.default;
  const artWidth = config.art.reduce((max, line) => Math.max(max, line.length), 0);
  const minWidth = Math.max(artWidth, MIN_WIDTH);
  const useCompact = cols < minWidth + 4;
  const lines = useCompact ? [config.compactLabel] : config.art;
  const paddingX = 1;
  useEffect2(() => {
    setColorShift(0);
    const interval = setInterval(() => {
      setColorShift((shift) => (shift + 1) % paletteLength);
    }, COLOR_INTERVAL_MS);
    const timeout = setTimeout(() => {
      clearInterval(interval);
      setColorShift(0);
    }, COLOR_DURATION_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [variant, paletteLength]);
  return /* @__PURE__ */ jsx4(Box3, { paddingX, paddingY: 0, children: /* @__PURE__ */ jsx4(Box3, { flexDirection: "column", alignItems: "flex-start", children: lines.map((line, idx) => /* @__PURE__ */ jsx4(
    Text4,
    {
      bold: true,
      color: getLineColor(idx, useCompact, colorShift, paletteColors),
      children: line
    },
    `pina-row-${variant}-${idx}`
  )) }) });
}

// src/lib/claudeAssets.ts
import * as fs7 from "fs";
import * as path6 from "path";
import * as os5 from "os";
function personalRoot(kind) {
  return path6.join(os5.homedir(), ".claude", kind === "agent" ? "agents" : "skills");
}
function projectRoot(projectPath, kind) {
  return path6.join(projectPath, ".claude", kind === "agent" ? "agents" : "skills");
}
function ensureDir(dir) {
  fs7.mkdirSync(dir, { recursive: true });
}
function parseFrontmatter(src) {
  if (!src.startsWith("---")) return { fm: {}, body: src };
  const end = src.indexOf("\n---", 3);
  if (end === -1) return { fm: {}, body: src };
  const header = src.slice(3, end).replace(/^\r?\n/, "");
  const rest = src.slice(end + 4).replace(/^\r?\n/, "");
  const fm = {};
  for (const raw of header.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (val.startsWith('"') && val.endsWith('"') || val.startsWith("'") && val.endsWith("'")) {
      val = val.slice(1, -1);
    }
    if (key === "tools") {
      const arr = val.startsWith("[") && val.endsWith("]") ? val.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean) : val.split(",").map((s) => s.trim()).filter(Boolean);
      fm.tools = arr;
    } else if (key === "name" || key === "description" || key === "model") {
      ;
      fm[key] = val;
    }
  }
  return { fm, body: rest };
}
function serializeFrontmatter(fm, body) {
  const lines = ["---"];
  if (fm.name) lines.push(`name: ${fm.name}`);
  if (fm.description !== void 0) {
    const d = fm.description.includes("\n") || fm.description.includes(":") ? JSON.stringify(fm.description) : fm.description;
    lines.push(`description: ${d}`);
  }
  if (fm.model) lines.push(`model: ${fm.model}`);
  if (fm.tools && fm.tools.length > 0) lines.push(`tools: ${fm.tools.join(", ")}`);
  lines.push("---", "", body.replace(/^\n+/, ""));
  return lines.join("\n");
}
function readAgentFile(filePath, scope) {
  try {
    const raw = fs7.readFileSync(filePath, "utf-8");
    const { fm, body } = parseFrontmatter(raw);
    const name = fm.name ?? path6.basename(filePath, ".md");
    return {
      kind: "agent",
      scope,
      name,
      description: fm.description ?? "",
      model: fm.model,
      tools: fm.tools,
      filePath,
      body
    };
  } catch {
    return null;
  }
}
function readSkillFile(skillMdPath2, scope) {
  try {
    const raw = fs7.readFileSync(skillMdPath2, "utf-8");
    const { fm, body } = parseFrontmatter(raw);
    const name = fm.name ?? path6.basename(path6.dirname(skillMdPath2));
    return {
      kind: "skill",
      scope,
      name,
      description: fm.description ?? "",
      filePath: skillMdPath2,
      body
    };
  } catch {
    return null;
  }
}
function listAgentsInDir(dir, scope) {
  if (!fs7.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs7.readdirSync(dir)) {
    if (!entry.endsWith(".md")) continue;
    const a = readAgentFile(path6.join(dir, entry), scope);
    if (a) out.push(a);
  }
  return out;
}
function listSkillsInDir(dir, scope) {
  if (!fs7.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs7.readdirSync(dir)) {
    const skillMd = path6.join(dir, entry, "SKILL.md");
    if (fs7.existsSync(skillMd)) {
      const s = readSkillFile(skillMd, scope);
      if (s) out.push(s);
    }
  }
  return out;
}
function applyShadow(personal, project) {
  const projectNames = new Set(project.map((a) => a.name));
  const personalMarked = personal.map(
    (a) => projectNames.has(a.name) ? { ...a, shadowedBy: "project" } : a
  );
  return [...project, ...personalMarked];
}
function listAgents(projectPath) {
  const personal = listAgentsInDir(personalRoot("agent"), "personal");
  const project = projectPath ? listAgentsInDir(projectRoot(projectPath, "agent"), "project") : [];
  return applyShadow(personal, project);
}
function listSkills(projectPath) {
  const personal = listSkillsInDir(personalRoot("skill"), "personal");
  const project = projectPath ? listSkillsInDir(projectRoot(projectPath, "skill"), "project") : [];
  return applyShadow(personal, project);
}
function agentFilePath(scope, name, projectPath) {
  const root = scope === "personal" ? personalRoot("agent") : projectRoot(projectPath, "agent");
  return path6.join(root, `${name}.md`);
}
function skillMdPath(scope, name, projectPath) {
  const root = scope === "personal" ? personalRoot("skill") : projectRoot(projectPath, "skill");
  return path6.join(root, name, "SKILL.md");
}
function writeAsset(asset, fields) {
  const fm = {
    name: asset.name,
    description: fields.description ?? asset.description,
    model: fields.model ?? asset.model,
    tools: fields.tools ?? asset.tools
  };
  const body = fields.body ?? asset.body;
  ensureDir(path6.dirname(asset.filePath));
  fs7.writeFileSync(asset.filePath, serializeFrontmatter(fm, body), "utf-8");
}
function createAsset(params) {
  const { kind, scope, name, projectPath } = params;
  if (scope === "project" && !projectPath) {
    throw new Error("projectPath required for project scope");
  }
  const filePath = kind === "agent" ? agentFilePath(scope, name, projectPath) : skillMdPath(scope, name, projectPath);
  if (fs7.existsSync(filePath)) {
    throw new Error(`${kind} '${name}' already exists in ${scope} scope`);
  }
  const asset = {
    kind,
    scope,
    name,
    description: params.description ?? "",
    model: params.model,
    filePath,
    body: params.body ?? ""
  };
  writeAsset(asset, {});
  return asset;
}
function deleteAsset(asset) {
  if (asset.kind === "agent") {
    if (fs7.existsSync(asset.filePath)) fs7.unlinkSync(asset.filePath);
  } else {
    const dir = path6.dirname(asset.filePath);
    if (fs7.existsSync(dir)) fs7.rmSync(dir, { recursive: true, force: true });
  }
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

// src/lib/quickActions.ts
import fs8 from "fs";
import path7 from "path";
var PRIMARY_IDS = [
  "npm:dev",
  "npm:start",
  "cargo:run",
  "go:run",
  "npm:build",
  "cargo:build",
  "mvn:compile",
  "make:all",
  "make:build",
  "npm:test",
  "cargo:test",
  "mvn:test",
  "python:test",
  "go:test",
  "npm:install",
  "python:install"
];
var NODE_SCRIPT_ORDER = ["dev", "start", "build", "test", "lint", "typecheck", "check", "format"];
function detectPackageManager(dir) {
  if (fs8.existsSync(path7.join(dir, "pnpm-lock.yaml"))) return "pnpm";
  if (fs8.existsSync(path7.join(dir, "yarn.lock"))) return "yarn";
  if (fs8.existsSync(path7.join(dir, "bun.lockb"))) return "bun";
  return "npm";
}
function detectNode(dir) {
  const pkgPath = path7.join(dir, "package.json");
  if (!fs8.existsSync(pkgPath)) return [];
  const pm = detectPackageManager(dir);
  const actions = [];
  actions.push({ id: "npm:install", label: `${pm} install`, command: pm, args: ["install"], source: "detected" });
  try {
    const pkg = JSON.parse(fs8.readFileSync(pkgPath, "utf-8"));
    const scripts = pkg.scripts ?? {};
    const scriptNames = Object.keys(scripts);
    const ordered = [
      ...NODE_SCRIPT_ORDER.filter((s) => scriptNames.includes(s)),
      ...scriptNames.filter((s) => !NODE_SCRIPT_ORDER.includes(s))
    ];
    for (const name of ordered) {
      actions.push({
        id: `npm:${name}`,
        label: `${pm} run ${name}`,
        command: pm,
        args: ["run", name],
        source: "detected"
      });
    }
  } catch {
  }
  return actions;
}
function detectPython(dir) {
  const actions = [];
  if (fs8.existsSync(path7.join(dir, "requirements.txt"))) {
    actions.push({ id: "python:install", label: "pip install -r requirements.txt", command: "pip", args: ["install", "-r", "requirements.txt"], source: "detected" });
  }
  if (fs8.existsSync(path7.join(dir, "pyproject.toml")) || fs8.existsSync(path7.join(dir, "setup.py")) || fs8.existsSync(path7.join(dir, "pytest.ini"))) {
    actions.push({ id: "python:test", label: "pytest", command: "pytest", args: [], source: "detected" });
  }
  return actions;
}
function detectMake(dir) {
  const makefile = path7.join(dir, "Makefile");
  if (!fs8.existsSync(makefile)) return [];
  const actions = [];
  try {
    const content = fs8.readFileSync(makefile, "utf-8");
    const targetRe = /^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:/gm;
    const seen = /* @__PURE__ */ new Set();
    let match;
    while ((match = targetRe.exec(content)) !== null) {
      const target = match[1];
      if (seen.has(target)) continue;
      seen.add(target);
      actions.push({
        id: `make:${target}`,
        label: `make ${target}`,
        command: "make",
        args: [target],
        source: "detected"
      });
    }
  } catch {
  }
  return actions;
}
function detectMaven(dir) {
  if (!fs8.existsSync(path7.join(dir, "pom.xml"))) return [];
  return [
    { id: "mvn:compile", label: "mvn compile", command: "mvn", args: ["compile"], source: "detected" },
    { id: "mvn:test", label: "mvn test", command: "mvn", args: ["test"], source: "detected" },
    { id: "mvn:package", label: "mvn package", command: "mvn", args: ["package"], source: "detected" },
    { id: "mvn:clean", label: "mvn clean", command: "mvn", args: ["clean"], source: "detected" }
  ];
}
function detectQuickActions(projectPath) {
  return [
    ...detectNode(projectPath),
    ...detectPython(projectPath),
    ...detectMake(projectPath),
    ...detectMaven(projectPath)
  ];
}
var ACTIONS_DIR = ".pina";
var ACTIONS_FILE = "actions.json";
function actionsFilePath(projectPath) {
  return path7.join(projectPath, ACTIONS_DIR, ACTIONS_FILE);
}
function loadCustomActions(projectPath) {
  const fp = actionsFilePath(projectPath);
  if (!fs8.existsSync(fp)) return [];
  try {
    const raw = JSON.parse(fs8.readFileSync(fp, "utf-8"));
    if (!Array.isArray(raw)) return [];
    return raw.map((entry) => ({
      id: entry.id ?? `custom:${entry.label}`,
      label: entry.label ?? `${entry.command} ${(entry.args ?? []).join(" ")}`,
      command: entry.command,
      args: entry.args ?? [],
      source: "custom"
    }));
  } catch {
    return [];
  }
}
function saveCustomActions(projectPath, actions) {
  const dir = path7.join(projectPath, ACTIONS_DIR);
  fs8.mkdirSync(dir, { recursive: true });
  const data = actions.map((a) => ({
    id: a.id,
    label: a.label,
    command: a.command,
    args: a.args
  }));
  fs8.writeFileSync(actionsFilePath(projectPath), JSON.stringify(data, null, 2), "utf-8");
}
function getQuickActions(projectPath) {
  const detected = detectQuickActions(projectPath);
  const custom = loadCustomActions(projectPath);
  const customIds = new Set(custom.map((a) => a.id));
  const merged = detected.filter((a) => !customIds.has(a.id));
  return [...custom, ...merged];
}
function metaFilePath(projectPath) {
  return path7.join(projectPath, ACTIONS_DIR, "actions-meta.json");
}
function loadActionsMeta(projectPath) {
  const fp = metaFilePath(projectPath);
  if (!fs8.existsSync(fp)) return { defaults: [], history: [] };
  try {
    const raw = JSON.parse(fs8.readFileSync(fp, "utf-8"));
    return {
      defaults: Array.isArray(raw.defaults) ? raw.defaults : [],
      history: Array.isArray(raw.history) ? raw.history : []
    };
  } catch {
    return { defaults: [], history: [] };
  }
}
function saveActionsMeta(projectPath, meta) {
  const dir = path7.join(projectPath, ACTIONS_DIR);
  fs8.mkdirSync(dir, { recursive: true });
  fs8.writeFileSync(metaFilePath(projectPath), JSON.stringify(meta, null, 2), "utf-8");
}
function recordActionUsage(projectPath, actionId) {
  const meta = loadActionsMeta(projectPath);
  meta.history = [actionId, ...meta.history.filter((id) => id !== actionId)].slice(0, 50);
  saveActionsMeta(projectPath, meta);
}
function toggleDefault(projectPath, actionId) {
  const meta = loadActionsMeta(projectPath);
  const idx = meta.defaults.indexOf(actionId);
  if (idx >= 0) {
    meta.defaults.splice(idx, 1);
    saveActionsMeta(projectPath, meta);
    return false;
  } else {
    meta.defaults.push(actionId);
    saveActionsMeta(projectPath, meta);
    return true;
  }
}
var MAX_SURFACE = 5;
function getSurfaceActions(projectPath) {
  const all = getQuickActions(projectPath);
  if (all.length === 0) return [];
  const meta = loadActionsMeta(projectPath);
  const byId = new Map(all.map((a) => [a.id, a]));
  const surface = [];
  const seen = /* @__PURE__ */ new Set();
  for (const id of meta.defaults) {
    const a = byId.get(id);
    if (a && !seen.has(id)) {
      surface.push(a);
      seen.add(id);
    }
  }
  for (const id of meta.history) {
    if (surface.length >= MAX_SURFACE) break;
    const a = byId.get(id);
    if (a && !seen.has(id)) {
      surface.push(a);
      seen.add(id);
    }
  }
  for (const id of PRIMARY_IDS) {
    if (surface.length >= MAX_SURFACE) break;
    const a = byId.get(id);
    if (a && !seen.has(id)) {
      surface.push(a);
      seen.add(id);
    }
  }
  for (const a of all) {
    if (surface.length >= MAX_SURFACE) break;
    if (!seen.has(a.id)) {
      surface.push(a);
      seen.add(a.id);
    }
  }
  return surface;
}
var ACTIONS_AGENT_PROMPT = `You are a project setup assistant. Analyze this project's structure and generate a \`.pina/actions.json\` file containing useful quick actions.

Look at the project's build system, scripts, Makefile targets, and common development workflows. Output a JSON array where each entry has:
- "id": unique identifier like "custom:deploy"
- "label": human-readable name shown in the menu
- "command": the executable to run
- "args": array of arguments

Focus on: build, test, lint, format, dev server, deploy, clean, and any project-specific workflows.

Write the file to \`.pina/actions.json\` in the project root.`;

// src/components/RunOutputOverlay.tsx
import { useEffect as useEffect3, useRef, useState as useState4 } from "react";
import { execSync as execSync2 } from "child_process";
import { Box as Box4, Text as Text5, useInput as useInput3, useStdout as useStdout2 } from "ink";

// src/lib/actionRunner.ts
import { spawn as spawn2 } from "child_process";
var MAX_LINES = 1e4;
function runAction(action, cwd) {
  const dataCbs = /* @__PURE__ */ new Set();
  const exitCbs = /* @__PURE__ */ new Set();
  let lineCount = 0;
  const child = spawn2(action.command, action.args, {
    cwd,
    env: { ...process.env, FORCE_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const handleChunk = (chunk) => {
    if (lineCount >= MAX_LINES) return;
    const text = chunk.toString("utf-8");
    lineCount += text.split("\n").length;
    for (const cb of dataCbs) cb(text);
  };
  child.stdout?.on("data", handleChunk);
  child.stderr?.on("data", handleChunk);
  let exited = false;
  child.on("exit", (code) => {
    exited = true;
    for (const cb of exitCbs) cb(code);
  });
  child.on("error", (err) => {
    if (!exited) {
      for (const cb of dataCbs) cb(`
[error] ${err.message}
`);
      for (const cb of exitCbs) cb(1);
      exited = true;
    }
  });
  return {
    kill() {
      if (!child.killed && !exited) {
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed && !exited) child.kill("SIGKILL");
        }, 2e3);
      }
    },
    onData(cb) {
      dataCbs.add(cb);
      return () => {
        dataCbs.delete(cb);
      };
    },
    onExit(cb) {
      exitCbs.add(cb);
      return () => {
        exitCbs.delete(cb);
      };
    }
  };
}

// src/components/RunOutputOverlay.tsx
import { jsx as jsx5, jsxs as jsxs4 } from "react/jsx-runtime";
function RunOutputOverlay({
  action,
  projectPath,
  onClose
}) {
  const [lines, setLines] = useState4([]);
  const [status, setStatus] = useState4("running");
  const [exitCode, setExitCode] = useState4(null);
  const [scroll, setScroll] = useState4(0);
  const [runId, setRunId] = useState4(0);
  const handleRef = useRef(null);
  const bufferRef = useRef("");
  const { stdout } = useStdout2();
  const rows = Math.max(8, (stdout?.rows ?? 24) - 10);
  useEffect3(() => {
    setLines([]);
    setStatus("running");
    setExitCode(null);
    setScroll(0);
    bufferRef.current = "";
    const h = runAction(action, projectPath);
    handleRef.current = h;
    const offData = h.onData((chunk) => {
      bufferRef.current += chunk;
      const parts = bufferRef.current.split("\n");
      bufferRef.current = parts.pop() ?? "";
      if (parts.length > 0) {
        setLines((prev) => {
          const next = prev.concat(parts);
          return next.length > 1e4 ? next.slice(next.length - 1e4) : next;
        });
      }
    });
    const offExit = h.onExit((code) => {
      if (bufferRef.current) {
        const tail = bufferRef.current;
        bufferRef.current = "";
        setLines((prev) => prev.concat([tail]));
      }
      setStatus("exited");
      setExitCode(code);
    });
    return () => {
      offData();
      offExit();
      h.kill();
    };
  }, [action.id, runId, projectPath]);
  useInput3((input, key) => {
    if (key.escape || input === "q") {
      handleRef.current?.kill();
      onClose();
      return;
    }
    if (input === "r" && status === "exited") {
      setRunId((n) => n + 1);
      return;
    }
    if (input === "k" && status === "running") {
      handleRef.current?.kill();
      return;
    }
    if (input === "c") {
      try {
        execSync2("pbcopy", { input: lines.join("\n"), stdio: ["pipe", "pipe", "pipe"] });
      } catch {
      }
      return;
    }
    if (key.upArrow) {
      setScroll((s) => s + 1);
      return;
    }
    if (key.downArrow) {
      setScroll((s) => Math.max(0, s - 1));
      return;
    }
    if (input === "g") {
      setScroll(lines.length);
      return;
    }
    if (input === "G") {
      setScroll(0);
      return;
    }
  });
  const total = lines.length;
  const end = Math.max(0, total - scroll);
  const start = Math.max(0, end - rows);
  const visible = lines.slice(start, end);
  const statusColor = status === "running" ? theme.slushie : exitCode === 0 ? theme.matcha : theme.rose;
  const statusLabel = status === "running" ? "running" : exitCode === 0 ? "exited 0" : `exited ${exitCode ?? "?"}`;
  return /* @__PURE__ */ jsxs4(Box4, { flexDirection: "column", borderStyle: "round", borderColor: statusColor, paddingX: 1, children: [
    /* @__PURE__ */ jsxs4(Box4, { justifyContent: "space-between", children: [
      /* @__PURE__ */ jsxs4(Text5, { bold: true, color: statusColor, children: [
        "\u25B6 ",
        action.label
      ] }),
      /* @__PURE__ */ jsx5(Text5, { color: statusColor, children: statusLabel })
    ] }),
    /* @__PURE__ */ jsx5(Text5, { dimColor: true, children: projectPath }),
    /* @__PURE__ */ jsx5(Text5, { children: " " }),
    visible.length === 0 ? /* @__PURE__ */ jsx5(Text5, { dimColor: true, children: "(no output yet)" }) : visible.map((line, i) => /* @__PURE__ */ jsx5(Text5, { children: line || " " }, `out-${start + i}`)),
    /* @__PURE__ */ jsx5(Text5, { children: " " }),
    /* @__PURE__ */ jsxs4(Text5, { dimColor: true, children: [
      status === "running" ? "k kill  " : "r re-run  ",
      "c copy  \u2191\u2193 scroll  g/G top/bottom  esc close"
    ] })
  ] });
}

// src/lib/claudeUsage.ts
import fs9 from "fs";
import path8 from "path";
import os6 from "os";
function projectDirFor(projectPath) {
  const encoded = projectPath.replace(/[/.]/g, "-");
  return path8.join(os6.homedir(), ".claude", "projects", encoded);
}
function getClaudeUsage(projectPath) {
  const stats = {
    sessions: 0,
    messages: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    models: {}
  };
  const dir = projectDirFor(projectPath);
  if (!fs9.existsSync(dir)) return stats;
  let files;
  try {
    files = fs9.readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  } catch {
    return stats;
  }
  stats.sessions = files.length;
  for (const f of files) {
    const full = path8.join(dir, f);
    let content;
    try {
      content = fs9.readFileSync(full, "utf-8");
    } catch {
      continue;
    }
    for (const line of content.split("\n")) {
      if (!line) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      const msg = obj?.message;
      const usage = msg?.usage;
      const ts = obj?.timestamp;
      if (ts) {
        if (!stats.lastActivity || ts > stats.lastActivity) stats.lastActivity = ts;
        if (!stats.firstActivity || ts < stats.firstActivity) stats.firstActivity = ts;
      }
      if (!usage) continue;
      stats.messages += 1;
      stats.inputTokens += usage.input_tokens ?? 0;
      stats.outputTokens += usage.output_tokens ?? 0;
      stats.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
      stats.cacheCreationTokens += usage.cache_creation_input_tokens ?? 0;
      const model = msg?.model;
      if (model) stats.models[model] = (stats.models[model] ?? 0) + 1;
    }
  }
  return stats;
}
function formatTokens(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return `${n}`;
}
function formatRelative(iso) {
  if (!iso) return "\u2014";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "\u2014";
  const diff = Date.now() - t;
  const s = Math.floor(diff / 1e3);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
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
    case "subagents":
      return "Sub-Agents";
    case "skills":
      return "Skills";
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
        { key: "rename_project", label: "Rename project", action: () => dispatch({ type: "rename_project", projectName: name }) },
        ...STAGES.filter((s) => s !== project.stage).map((stage) => ({
          key: `set_stage:${stage}`,
          label: `Set stage to '${stage}'`,
          action: () => dispatch({ type: "set_stage", projectName: name, stage })
        })),
        {
          key: "toggle_pause",
          label: project.status === "paused" ? "Resume project" : "Pause project",
          action: () => dispatch({ type: "toggle_pause", projectName: name })
        }
      ];
    case "path":
      return [
        { key: "open_folder", label: "Open project folder", action: () => dispatch({ type: "open_folder", projectPath: project.path }) },
        { key: "open_vscode", label: "Open in VS Code", action: () => dispatch({ type: "open_vscode", projectPath: project.path }) },
        { key: "open_terminal_tab", label: "Open in new tab", action: () => dispatch({ type: "open_terminal_tab", projectPath: project.path }) }
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
        { key: "git_add", label: "git add .", action: () => dispatch({ type: "git_add", projectName: name }) },
        { key: "git_commit", label: "git commit", action: () => dispatch({ type: "git_commit", projectName: name }) },
        { key: "git_push", label: "git push", action: () => dispatch({ type: "git_push", projectName: name }) },
        { key: "git_add_commit", label: "git add + commit", action: () => dispatch({ type: "git_add_commit", projectName: name }) },
        { key: "git_add_commit_push", label: "git add + commit + push", action: () => dispatch({ type: "git_add_commit_push", projectName: name }) },
        { key: "git_pull", label: "git pull", action: () => dispatch({ type: "git_pull", projectName: name }) },
        { key: "git_fetch", label: "git fetch", action: () => dispatch({ type: "git_fetch", projectName: name }) },
        ...otherLocalBranches.map((branch) => ({
          key: `checkout:${branch}`,
          label: `Checkout '${branch}'`,
          action: () => dispatch({ type: "git_checkout", projectName: name, branch })
        })),
        ...remoteOnly.map((remote) => ({
          key: `track_remote:${remote}`,
          label: `Track remote '${remote}'`,
          action: () => dispatch({ type: "git_checkout", projectName: name, branch: remote, trackRemote: true })
        }))
      ];
      items.push({
        key: "refresh_branches",
        label: "Refresh branch list (fetch --all)",
        action: () => dispatch({ type: "git_refresh_branches", projectName: name })
      });
      return items;
    }
    case "remote":
      return [
        { key: "open_remote_browser", label: "Open in browser", action: () => dispatch({ type: "open_remote_browser", projectName: name }) }
      ];
    case "milestones":
      return [
        { key: "show_milestones", label: "Show all milestones", action: () => dispatch({ type: "show_milestones", projectName: name }) }
      ];
    case "tags":
      return [
        { key: "add_tag", label: "Add tag", action: () => dispatch({ type: "add_tag", projectName: name }) },
        ...project.tags.map((tag) => ({
          key: `remove_tag:${tag}`,
          label: `Remove tag '${tag}'`,
          action: () => dispatch({ type: "remove_tag", projectName: name, tag })
        }))
      ];
    case "subagents": {
      const agents = listAgents(project.path);
      const items = [];
      const order = [
        ...agents.filter((a) => a.scope === "project"),
        ...agents.filter((a) => a.scope === "personal")
      ];
      for (const a of order) {
        const tag = a.scope === "project" ? "project" : "personal";
        const suffix = a.shadowedBy ? " [shadowed]" : "";
        items.push({
          key: `open_agent:${a.scope}:${a.name}`,
          label: `${a.name}  (${tag})${suffix}`,
          action: () => dispatch({ type: "open_agent_detail", scope: a.scope, name: a.name })
        });
      }
      items.push({ key: "new_agent_project", label: "New project sub-agent\u2026", action: () => dispatch({ type: "new_agent", scope: "project" }) });
      items.push({ key: "new_agent_personal", label: "New personal sub-agent\u2026", action: () => dispatch({ type: "new_agent", scope: "personal" }) });
      return items;
    }
    case "skills": {
      const skills = listSkills(project.path);
      const items = [];
      const order = [
        ...skills.filter((s) => s.scope === "project"),
        ...skills.filter((s) => s.scope === "personal")
      ];
      for (const s of order) {
        const tag = s.scope === "project" ? "project" : "personal";
        const suffix = s.shadowedBy ? " [shadowed]" : "";
        items.push({
          key: `open_skill:${s.scope}:${s.name}`,
          label: `${s.name}  (${tag})${suffix}`,
          action: () => dispatch({ type: "open_skill_detail", scope: s.scope, name: s.name })
        });
      }
      items.push({ key: "new_skill_project", label: "New project skill\u2026", action: () => dispatch({ type: "new_skill", scope: "project" }) });
      items.push({ key: "new_skill_personal", label: "New personal skill\u2026", action: () => dispatch({ type: "new_skill", scope: "personal" }) });
      return items;
    }
    default:
      if (selectableKey.startsWith("note:")) {
        const noteContent = selectableKey.slice(5);
        const noteIndex = project.notes.indexOf(noteContent);
        return [
          { key: "delete_note", label: "Delete note", action: () => dispatch({ type: "delete_note", projectName: name, noteIndex }) },
          { key: "add_note", label: "Add new note", action: () => dispatch({ type: "add_note", projectName: name }) }
        ];
      }
      return [
        { key: "rename_project", label: "Rename project", action: () => dispatch({ type: "rename_project", projectName: name }) },
        { key: "add_note", label: "Add note", action: () => dispatch({ type: "add_note", projectName: name }) }
      ];
  }
}
function getObjectivesMenuItems(objectiveIndex, project, dispatch, isHiddenList) {
  const name = project.name;
  if (isHiddenList) {
    return [
      { key: "unhide_objective", label: "Unhide objective", action: () => dispatch({ type: "unhide_objective", projectName: name, objectiveIndex }) },
      { key: "complete_objective", label: "Complete objective", action: () => dispatch({ type: "complete_objective", projectName: name, objectiveIndex }) }
    ];
  }
  const obj = project.objectives[objectiveIndex];
  const items = [
    { key: "complete_objective", label: "Complete objective", action: () => dispatch({ type: "complete_objective", projectName: name, objectiveIndex }) },
    { key: "edit_objective", label: "Edit objective", action: () => dispatch({ type: "edit_objective", projectName: name, objectiveIndex }) },
    {
      key: "toggle_focus",
      label: obj?.focused ? "Unfocus objective" : "Focus objective",
      action: () => dispatch({ type: "focus_objective", projectName: name, objectiveIndex })
    },
    { key: "hide_objective", label: "Hide objective", action: () => dispatch({ type: "hide_objective", projectName: name, objectiveIndex }) },
    { key: "add_objective", label: "Add new objective", action: () => dispatch({ type: "add_objective", projectName: name }) }
  ];
  if (project.objectives.some((o) => o.hidden)) {
    items.push({ key: "show_hidden_objectives", label: "Show hidden objectives", action: () => dispatch({ type: "show_hidden_objectives", projectName: name }) });
  }
  return items;
}
function getProjectsMenuItems(project, isActive, dispatch) {
  const name = project.name;
  const items = [];
  if (!isActive) {
    items.push({ key: "switch_project", label: "Switch to this project", action: () => dispatch({ type: "switch_project", projectName: name }) });
  }
  items.push(
    { key: "rename_project", label: "Rename project", action: () => dispatch({ type: "rename_project", projectName: name }) }
  );
  for (const stage of STAGES) {
    if (stage !== project.stage) {
      items.push({
        key: `set_stage:${stage}`,
        label: `Set stage to '${stage}'`,
        action: () => dispatch({ type: "set_stage", projectName: name, stage })
      });
    }
  }
  items.push({
    key: "toggle_pause",
    label: project.status === "paused" ? "Resume project" : "Pause project",
    action: () => dispatch({ type: "toggle_pause", projectName: name })
  });
  if (project.stage !== "archived") {
    items.push({ key: "archive_project", label: "Archive project", action: () => dispatch({ type: "archive_project", projectName: name }) });
  }
  items.push({ key: "delete_project", label: "Delete project", action: () => dispatch({ type: "delete_project", projectName: name }) });
  return items;
}
function getAssetDetailTitle(asset) {
  const kind = asset.kind === "agent" ? "Sub-Agent" : "Skill";
  return `${kind}: ${asset.name} (${asset.scope})`;
}
function getAssetDetailMenuItems(asset, dispatch) {
  const items = [];
  const desc = asset.description ? asset.description : "(no description)";
  const truncDesc = desc.length > 60 ? desc.slice(0, 57) + "\u2026" : desc;
  items.push({ key: "info_description", label: `Description: ${truncDesc}`, action: () => {
  } });
  if (asset.kind === "agent") {
    if (asset.model) items.push({ key: "info_model", label: `Model: ${asset.model}`, action: () => {
    } });
    if (asset.tools && asset.tools.length > 0) {
      items.push({ key: "info_tools", label: `Tools: ${asset.tools.join(", ")}`, action: () => {
      } });
    }
  }
  const bodyLines = asset.body.split("\n").length;
  items.push({ key: "info_prompt", label: `Prompt: ${bodyLines} line${bodyLines === 1 ? "" : "s"}`, action: () => {
  } });
  if (asset.shadowedBy) {
    items.push({ key: "info_shadowed", label: `Shadowed by ${asset.shadowedBy} entry`, action: () => {
    } });
  }
  if (asset.kind === "agent") {
    items.push({
      key: "edit_prompt",
      label: "Edit prompt",
      action: () => dispatch({ type: "edit_agent_prompt", scope: asset.scope, name: asset.name })
    });
    items.push({
      key: "edit_description",
      label: "Edit description",
      action: () => dispatch({ type: "edit_agent_description", scope: asset.scope, name: asset.name })
    });
    items.push({
      key: "delete_asset",
      label: "Delete sub-agent",
      action: () => dispatch({ type: "delete_agent", scope: asset.scope, name: asset.name })
    });
  } else {
    items.push({
      key: "edit_prompt",
      label: "Edit prompt",
      action: () => dispatch({ type: "edit_skill_prompt", scope: asset.scope, name: asset.name })
    });
    items.push({
      key: "edit_description",
      label: "Edit description",
      action: () => dispatch({ type: "edit_skill_description", scope: asset.scope, name: asset.name })
    });
    items.push({
      key: "delete_asset",
      label: "Delete skill",
      action: () => dispatch({ type: "delete_skill", scope: asset.scope, name: asset.name })
    });
  }
  return items;
}

// src/commands/dashboard.tsx
import { Fragment, jsx as jsx6, jsxs as jsxs5 } from "react/jsx-runtime";
var PANEL_ORDER = ["active", "objectives", "projects"];
var RAINBOW_COLORS = SHIMMER_COLORS;
var COMPLETED_GLOW_DURATION = 4e3;
var NEW_OBJECTIVE_GLOW_DURATION = 1e3;
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
      execSync3(`osascript -e 'tell application "iTerm2" to tell current window to create tab with default profile command "cd \\"${escaped}\\" && exec $SHELL"'`, { stdio: "pipe" });
      break;
    case "Apple_Terminal":
    case "Terminal":
      execSync3(`osascript -e 'tell application "Terminal" to do script "cd \\"${escaped}\\""'`, { stdio: "pipe" });
      break;
    default:
      execSync3(`open -a "${app}" "${escaped}"`, { stdio: "pipe" });
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
  items.push("subagents");
  items.push("skills");
  items.push("claude");
  const surface = getSurfaceActions(project.path);
  for (const a of surface) {
    items.push(`action:${a.id}`);
  }
  const allActions = getQuickActions(project.path);
  if (allActions.length > surface.length) {
    items.push("actions_more");
  }
  items.push("actions_add");
  items.push("actions_ai");
  for (const note of project.notes.slice(-3)) {
    items.push(`note:${note}`);
  }
  if (isGitRepo(project.path)) items.push("git_history");
  if (Object.keys(project.milestones).length > 0) items.push("milestones");
  return items;
}
function ActiveProjectPanel({
  project,
  entered,
  selectedIndex
}) {
  if (!project) {
    return /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", paddingX: 1, children: [
      /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "No active project." }),
      /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "Run `pina switch <name>` to select one." })
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
  const recentCommits = inGitRepo ? getCommitHistory(project.path, 2) : [];
  return /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", paddingX: 1, children: [
    /* @__PURE__ */ jsxs5(Box5, { gap: 2, children: [
      /* @__PURE__ */ jsx6(Text6, { bold: true, color: theme.matcha, inverse: hi("name"), children: project.name }),
      /* @__PURE__ */ jsx6(StatusBadge, { stage: project.stage, stale: project.stale, status: project.status })
    ] }),
    /* @__PURE__ */ jsx6(Text6, { dimColor: true, inverse: hi("path"), children: project.path }),
    /* @__PURE__ */ jsx6(Text6, { children: " " }),
    inGitRepo && /* @__PURE__ */ jsxs5(Text6, { inverse: hi("branch"), children: [
      /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "Branch   " }),
      branch ? /* @__PURE__ */ jsx6(Text6, { color: theme.slushie, children: branch }) : /* @__PURE__ */ jsx6(Text6, { color: theme.peach, children: "detached HEAD" }),
      dirty ? /* @__PURE__ */ jsx6(Text6, { color: theme.peach, children: " (dirty)" }) : ""
    ] }),
    remoteUrl && /* @__PURE__ */ jsxs5(Text6, { inverse: hi("remote"), children: [
      /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "Remote   " }),
      upstream ? /* @__PURE__ */ jsxs5(Fragment, { children: [
        /* @__PURE__ */ jsx6(Text6, { color: upstream.ahead > 0 || upstream.behind > 0 ? theme.peach : theme.matcha, children: upstream.ahead === 0 && upstream.behind === 0 ? "up to date" : `${upstream.ahead > 0 ? `${upstream.ahead} ahead` : ""}${upstream.ahead > 0 && upstream.behind > 0 ? ", " : ""}${upstream.behind > 0 ? `${upstream.behind} behind` : ""}` }),
        /* @__PURE__ */ jsxs5(Text6, { dimColor: true, children: [
          " (",
          upstream.tracking,
          ")"
        ] })
      ] }) : /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "not tracking" })
    ] }),
    project.tags.length > 0 && /* @__PURE__ */ jsxs5(Text6, { inverse: hi("tags"), children: [
      /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "Tags     " }),
      /* @__PURE__ */ jsx6(Text6, { children: project.tags.join(", ") })
    ] }),
    (() => {
      const agents = listAgents(project.path);
      const skills = listSkills(project.path);
      const agentProj = agents.filter((a) => a.scope === "project").length;
      const agentPers = agents.filter((a) => a.scope === "personal" && !a.shadowedBy).length;
      const skillProj = skills.filter((s) => s.scope === "project").length;
      const skillPers = skills.filter((s) => s.scope === "personal" && !s.shadowedBy).length;
      return /* @__PURE__ */ jsxs5(Fragment, { children: [
        /* @__PURE__ */ jsxs5(Text6, { inverse: hi("subagents"), children: [
          /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "Agents   " }),
          /* @__PURE__ */ jsxs5(Text6, { children: [
            agentPers,
            " personal \xB7 ",
            agentProj,
            " project"
          ] })
        ] }),
        /* @__PURE__ */ jsxs5(Text6, { inverse: hi("skills"), children: [
          /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "Skills   " }),
          /* @__PURE__ */ jsxs5(Text6, { children: [
            skillPers,
            " personal \xB7 ",
            skillProj,
            " project"
          ] })
        ] })
      ] });
    })(),
    (() => {
      const usage = getClaudeUsage(project.path);
      const total = usage.inputTokens + usage.outputTokens;
      return /* @__PURE__ */ jsxs5(Text6, { inverse: hi("claude"), children: [
        /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "Claude   " }),
        usage.sessions === 0 ? /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "no sessions" }) : /* @__PURE__ */ jsxs5(Text6, { children: [
          usage.sessions,
          " sessions \xB7 ",
          formatTokens(total),
          " tok \xB7 ",
          formatRelative(usage.lastActivity)
        ] })
      ] });
    })(),
    (() => {
      const surface = getSurfaceActions(project.path);
      const allActions = getQuickActions(project.path);
      const meta = loadActionsMeta(project.path);
      const defaultSet = new Set(meta.defaults);
      const hasMore = allActions.length > surface.length;
      return /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", marginTop: 1, children: [
        /* @__PURE__ */ jsx6(Text6, { bold: true, dimColor: true, children: "Quick Actions" }),
        surface.map((a) => /* @__PURE__ */ jsxs5(Text6, { inverse: hi(`action:${a.id}`), children: [
          "  ",
          defaultSet.has(a.id) ? /* @__PURE__ */ jsx6(Text6, { color: theme.butter, children: "\u2605 " }) : "",
          /* @__PURE__ */ jsx6(Text6, { color: theme.butter, children: a.label })
        ] }, `qa-${a.id}`)),
        hasMore && /* @__PURE__ */ jsxs5(Text6, { inverse: hi("actions_more"), dimColor: true, children: [
          "  ",
          "more\u2026 (",
          allActions.length - surface.length,
          " more)"
        ] }),
        /* @__PURE__ */ jsxs5(Text6, { inverse: hi("actions_add"), dimColor: true, children: [
          "  ",
          "[+] New action\u2026"
        ] }),
        /* @__PURE__ */ jsxs5(Text6, { inverse: hi("actions_ai"), dimColor: true, children: [
          "  ",
          "Generate with AI\u2026"
        ] })
      ] });
    })(),
    notes.length > 0 && /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", marginTop: 1, children: [
      /* @__PURE__ */ jsx6(Text6, { bold: true, dimColor: true, children: "Recent Notes" }),
      notes.map((note, i) => /* @__PURE__ */ jsxs5(Text6, { dimColor: true, inverse: hi(`note:${note}`), children: [
        "  ",
        note
      ] }, `note-${i}`))
    ] }),
    inGitRepo && recentCommits.length > 0 && /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", marginTop: 1, children: [
      /* @__PURE__ */ jsx6(Text6, { bold: true, dimColor: true, inverse: hi("git_history"), children: "Git History" }),
      recentCommits.map((c) => /* @__PURE__ */ jsxs5(Text6, { dimColor: true, inverse: hi("git_history"), children: [
        "  ",
        /* @__PURE__ */ jsx6(Text6, { color: theme.peach, children: c.shortHash }),
        " ",
        c.subject,
        " ",
        /* @__PURE__ */ jsx6(Text6, { italic: true, children: c.relativeDate })
      ] }, `gh-${c.hash}`))
    ] }),
    recentMilestones.length > 0 && /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", marginTop: 1, children: [
      /* @__PURE__ */ jsx6(Text6, { bold: true, dimColor: true, inverse: hi("milestones"), children: "Milestones" }),
      recentMilestones.map(([key, date]) => /* @__PURE__ */ jsxs5(Text6, { dimColor: true, inverse: hi("milestones"), children: [
        "  ",
        getMilestoneLabel(key),
        " ",
        /* @__PURE__ */ jsx6(Text6, { italic: true, children: formatMilestoneDate(date) })
      ] }, `ms-${key}`))
    ] })
  ] });
}
function useFocusedObjectiveColor() {
  const [colorIdx, setColorIdx] = useState5(0);
  useEffect4(() => {
    const timer = setInterval(() => setColorIdx((i) => (i + 1) % SHIMMER_COLORS.length), 200);
    return () => clearInterval(timer);
  }, []);
  return SHIMMER_COLORS[colorIdx];
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
  return /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", paddingX: 1, children: [
    sorted.length === 0 && hiddenCount === 0 && completedCount === 0 && /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "No objectives set." }),
    sorted.map((obj, i) => {
      const isSelected = entered && selectedIndex === i;
      const objectiveId = obj.createdAt ?? `${obj.text}-${i}`;
      const isNewlyAdded = newObjectiveHighlightId && objectiveId === newObjectiveHighlightId;
      const color = isNewlyAdded ? newObjectivePulse ? theme.ube : theme.matcha : void 0;
      return /* @__PURE__ */ jsx6(Box5, { children: /* @__PURE__ */ jsx6(Text6, { inverse: isSelected, color: obj.focused ? focusedColor : color, children: `${i + 1}. ${obj.focused ? "\u2605 " : ""}${obj.text}` }) }, `obj-${i}`);
    }),
    /* @__PURE__ */ jsx6(Text6, { children: " " }),
    /* @__PURE__ */ jsx6(Text6, { inverse: isAddSelected, color: theme.matcha, children: "  [+] Add objective" }),
    /* @__PURE__ */ jsxs5(
      Text6,
      {
        inverse: isCompletedSelected,
        color: completedHighlightColor ?? (completedCount > 0 ? theme.slushie : void 0),
        dimColor: !completedHighlightColor && completedCount === 0,
        children: [
          "  ",
          `Completed objectives(${completedCount})`
        ]
      }
    ),
    hiddenCount > 0 && /* @__PURE__ */ jsxs5(Text6, { inverse: isHiddenSelected, dimColor: true, children: [
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
  const { stdout } = useStdout3();
  const cols = stdout?.columns ?? 80;
  const panelWidth = Math.max(20, Math.floor(cols / 2) - 6);
  const nameWidth = Math.max(12, panelWidth - 14);
  if (projects.length === 0) {
    return /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", paddingX: 1, children: [
      /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "No projects registered." }),
      /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "Run `pina init` or `pina scan` to get started." })
    ] });
  }
  return /* @__PURE__ */ jsx6(Box5, { flexDirection: "column", paddingX: 1, children: projects.map((project, i) => {
    const isActive = project.name === activeProjectName;
    const marker = isActive ? "\u25B8" : " ";
    const isSelected = entered && selectedIndex === i;
    const displayName = formatProjectName(project.name, nameWidth);
    return /* @__PURE__ */ jsxs5(Box5, { gap: 1, children: [
      /* @__PURE__ */ jsxs5(Text6, { color: isActive ? theme.matcha : void 0, inverse: isSelected, children: [
        marker,
        " ",
        displayName
      ] }),
      /* @__PURE__ */ jsx6(StatusBadge, { stage: project.stage, stale: project.stale, status: project.status })
    ] }, project.name);
  }) });
}
function formatProjectName(name, width) {
  if (width <= 0) return name;
  if (name.length <= width) return name;
  if (width <= 5) return name.slice(0, width);
  const suffixLength = Math.max(2, Math.min(6, Math.floor(width / 3)));
  const prefixLength = Math.max(1, width - suffixLength - 3);
  return `${name.slice(0, prefixLength)}...${name.slice(-suffixLength)}`;
}
function TimelineOverlay({ milestones, onClose }) {
  useInput4((input, key) => {
    if (key.escape || key.return) {
      onClose();
    }
  });
  return /* @__PURE__ */ jsxs5(
    Box5,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: theme.slushie,
      paddingX: 2,
      paddingY: 1,
      children: [
        /* @__PURE__ */ jsx6(Text6, { bold: true, color: theme.slushie, children: "Milestone Timeline" }),
        /* @__PURE__ */ jsx6(Text6, { children: " " }),
        milestones.map(([key, date], i) => {
          const label = getMilestoneLabel(key);
          const isLast = i === milestones.length - 1;
          return /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", children: [
            /* @__PURE__ */ jsxs5(Box5, { children: [
              /* @__PURE__ */ jsx6(Text6, { color: theme.slushie, children: "  \u25CF " }),
              /* @__PURE__ */ jsx6(Text6, { bold: true, children: label }),
              /* @__PURE__ */ jsxs5(Text6, { color: theme.dimCream, children: [
                "  ",
                formatMilestoneDate(date)
              ] })
            ] }),
            !isLast && /* @__PURE__ */ jsx6(Text6, { color: theme.slushie, children: "  \u2502" })
          ] }, key);
        }),
        /* @__PURE__ */ jsx6(Text6, { children: " " }),
        /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "enter/esc dismiss" })
      ]
    }
  );
}
function GitHistoryOverlay({
  projectPath,
  onClose,
  onError,
  onReset,
  onInfo
}) {
  const commits = useMemo(() => getCommitHistory(projectPath, 50), [projectPath]);
  const [selected, setSelected] = useState5(0);
  const [view, setView] = useState5({ kind: "list" });
  const resetModes = ["soft", "mixed", "hard"];
  const actions = ["View diff", "Copy commit id", "Reset to commit"];
  useInput4((input, key) => {
    if (view.kind === "reset") {
      if (key.escape) {
        setView({ kind: "menu", commit: view.commit, idx: 2 });
        return;
      }
      if (key.leftArrow) {
        setView({ ...view, modeIdx: (view.modeIdx + resetModes.length - 1) % resetModes.length });
        return;
      }
      if (key.rightArrow) {
        setView({ ...view, modeIdx: (view.modeIdx + 1) % resetModes.length });
        return;
      }
      if (key.return) {
        const ok = resetToCommit(projectPath, view.commit.hash, resetModes[view.modeIdx]);
        if (!ok) {
          onError(`git reset --${resetModes[view.modeIdx]} ${view.commit.shortHash} failed`);
          return;
        }
        onReset();
      }
      return;
    }
    if (view.kind === "diff") {
      if (key.escape || input === "q") {
        setView({ kind: "menu", commit: view.commit, idx: 0 });
        return;
      }
      if (key.upArrow) {
        setView({ ...view, scroll: Math.max(0, view.scroll - 1) });
        return;
      }
      if (key.downArrow) {
        setView({ ...view, scroll: view.scroll + 1 });
        return;
      }
      return;
    }
    if (view.kind === "menu") {
      if (key.escape) {
        setView({ kind: "list" });
        return;
      }
      if (key.upArrow) {
        setView({ ...view, idx: (view.idx + actions.length - 1) % actions.length });
        return;
      }
      if (key.downArrow) {
        setView({ ...view, idx: (view.idx + 1) % actions.length });
        return;
      }
      if (key.return) {
        const action = actions[view.idx];
        if (action === "View diff") {
          try {
            const text = execSync3(`git show --stat --patch ${view.commit.hash}`, {
              cwd: projectPath,
              encoding: "utf-8",
              stdio: ["pipe", "pipe", "pipe"],
              maxBuffer: 10 * 1024 * 1024
            });
            setView({ kind: "diff", commit: view.commit, text, scroll: 0 });
          } catch (e) {
            onError(`git show failed: ${e instanceof Error ? e.message : String(e)}`);
          }
          return;
        }
        if (action === "Copy commit id") {
          try {
            execSync3("pbcopy", { input: view.commit.hash, stdio: ["pipe", "pipe", "pipe"] });
            onInfo(`Copied ${view.commit.shortHash} to clipboard`);
          } catch (e) {
            onError(`copy failed: ${e instanceof Error ? e.message : String(e)}`);
          }
          return;
        }
        if (action === "Reset to commit") {
          setView({ kind: "reset", commit: view.commit, modeIdx: 1 });
          return;
        }
      }
      return;
    }
    if (key.escape) {
      onClose();
      return;
    }
    if (key.upArrow) {
      setSelected((s) => Math.max(0, s - 1));
      return;
    }
    if (key.downArrow) {
      setSelected((s) => Math.min(commits.length - 1, s + 1));
      return;
    }
    if (key.return && commits[selected]) {
      setView({ kind: "menu", commit: commits[selected], idx: 0 });
    }
  });
  if (view.kind === "diff") {
    const lines = view.text.split("\n");
    const visibleCount = 20;
    const visible = lines.slice(view.scroll, view.scroll + visibleCount);
    return /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", borderStyle: "round", borderColor: theme.peach, paddingX: 2, paddingY: 1, children: [
      /* @__PURE__ */ jsxs5(Text6, { bold: true, color: theme.peach, children: [
        view.commit.shortHash,
        " ",
        view.commit.subject
      ] }),
      /* @__PURE__ */ jsx6(Text6, { children: " " }),
      visible.map((l, i) => {
        const color = l.startsWith("+") && !l.startsWith("+++") ? theme.matcha : l.startsWith("-") && !l.startsWith("---") ? theme.peach : l.startsWith("@@") ? theme.slushie : void 0;
        return /* @__PURE__ */ jsx6(Text6, { color, children: l || " " }, i);
      }),
      /* @__PURE__ */ jsx6(Text6, { children: " " }),
      /* @__PURE__ */ jsxs5(Text6, { dimColor: true, children: [
        "\u2191/\u2193 scroll  esc/q back  (",
        view.scroll + 1,
        "-",
        Math.min(view.scroll + visibleCount, lines.length),
        "/",
        lines.length,
        ")"
      ] })
    ] });
  }
  return /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", borderStyle: "round", borderColor: theme.peach, paddingX: 2, paddingY: 1, children: [
    /* @__PURE__ */ jsx6(Text6, { bold: true, color: theme.peach, children: "Git History" }),
    /* @__PURE__ */ jsx6(Text6, { children: " " }),
    commits.length === 0 && /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "No commits." }),
    commits.map((c, i) => /* @__PURE__ */ jsxs5(Text6, { inverse: view.kind === "list" && selected === i, children: [
      /* @__PURE__ */ jsx6(Text6, { color: theme.peach, children: c.shortHash }),
      " ",
      c.subject,
      " ",
      /* @__PURE__ */ jsx6(Text6, { dimColor: true, italic: true, children: c.relativeDate })
    ] }, c.hash)),
    /* @__PURE__ */ jsx6(Text6, { children: " " }),
    view.kind === "menu" && /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", children: [
      /* @__PURE__ */ jsxs5(Text6, { children: [
        /* @__PURE__ */ jsx6(Text6, { color: theme.peach, children: view.commit.shortHash }),
        " ",
        view.commit.subject
      ] }),
      actions.map((a, i) => /* @__PURE__ */ jsxs5(Text6, { inverse: view.idx === i, children: [
        "  ",
        a
      ] }, a)),
      /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "\u2191/\u2193 choose  enter select  esc back" })
    ] }),
    view.kind === "reset" && /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", children: [
      /* @__PURE__ */ jsxs5(Text6, { children: [
        "Reset to ",
        /* @__PURE__ */ jsx6(Text6, { color: theme.peach, children: view.commit.shortHash }),
        " ",
        view.commit.subject
      ] }),
      /* @__PURE__ */ jsx6(Box5, { gap: 2, marginTop: 1, children: resetModes.map((m, i) => /* @__PURE__ */ jsx6(Text6, { inverse: view.modeIdx === i, color: m === "hard" ? theme.peach : void 0, children: ` --${m} ` }, m)) }),
      /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "\u2190/\u2192 choose mode  enter confirm  esc back" })
    ] }),
    view.kind === "list" && /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "\u2191/\u2193 navigate  enter actions  esc dismiss" })
  ] });
}
function ClaudeUsageOverlay({
  projectPath,
  onClose,
  onError
}) {
  const usage = useMemo(() => getClaudeUsage(projectPath), [projectPath]);
  const [selected, setSelected] = useState5(0);
  const actions = ["Open usage dashboard"];
  useInput4((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    if (key.upArrow) {
      setSelected((s) => (s + actions.length - 1) % actions.length);
      return;
    }
    if (key.downArrow) {
      setSelected((s) => (s + 1) % actions.length);
      return;
    }
    if (key.return) {
      const a = actions[selected];
      if (a === "Open usage dashboard") {
        try {
          execSync3("open https://console.anthropic.com/settings/usage", { stdio: "pipe" });
          onClose();
        } catch (e) {
          onError(`open failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
  });
  const total = usage.inputTokens + usage.outputTokens;
  const modelEntries = Object.entries(usage.models).sort((a, b) => b[1] - a[1]);
  return /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", borderStyle: "round", borderColor: theme.matcha, paddingX: 2, paddingY: 1, children: [
    /* @__PURE__ */ jsx6(Text6, { bold: true, color: theme.matcha, children: "Claude Usage" }),
    /* @__PURE__ */ jsx6(Text6, { children: " " }),
    usage.sessions === 0 ? /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "No Claude Code sessions logged for this project." }) : /* @__PURE__ */ jsxs5(Fragment, { children: [
      /* @__PURE__ */ jsxs5(Text6, { children: [
        /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "Sessions       " }),
        usage.sessions
      ] }),
      /* @__PURE__ */ jsxs5(Text6, { children: [
        /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "Messages       " }),
        usage.messages
      ] }),
      /* @__PURE__ */ jsxs5(Text6, { children: [
        /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "Input tokens   " }),
        formatTokens(usage.inputTokens)
      ] }),
      /* @__PURE__ */ jsxs5(Text6, { children: [
        /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "Output tokens  " }),
        formatTokens(usage.outputTokens)
      ] }),
      /* @__PURE__ */ jsxs5(Text6, { children: [
        /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "Cache read     " }),
        formatTokens(usage.cacheReadTokens)
      ] }),
      /* @__PURE__ */ jsxs5(Text6, { children: [
        /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "Cache create   " }),
        formatTokens(usage.cacheCreationTokens)
      ] }),
      /* @__PURE__ */ jsxs5(Text6, { children: [
        /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "Total          " }),
        formatTokens(total)
      ] }),
      /* @__PURE__ */ jsxs5(Text6, { children: [
        /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "First activity " }),
        formatRelative(usage.firstActivity)
      ] }),
      /* @__PURE__ */ jsxs5(Text6, { children: [
        /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "Last activity  " }),
        formatRelative(usage.lastActivity)
      ] }),
      modelEntries.length > 0 && /* @__PURE__ */ jsxs5(Fragment, { children: [
        /* @__PURE__ */ jsx6(Text6, { children: " " }),
        /* @__PURE__ */ jsx6(Text6, { bold: true, dimColor: true, children: "Models" }),
        modelEntries.map(([m, n]) => /* @__PURE__ */ jsxs5(Text6, { children: [
          "  ",
          /* @__PURE__ */ jsx6(Text6, { color: theme.slushie, children: m }),
          " ",
          /* @__PURE__ */ jsxs5(Text6, { dimColor: true, children: [
            "\xD7",
            n
          ] })
        ] }, m))
      ] })
    ] }),
    /* @__PURE__ */ jsx6(Text6, { children: " " }),
    actions.map((a, i) => /* @__PURE__ */ jsxs5(Text6, { inverse: selected === i, children: [
      "  ",
      a
    ] }, a)),
    /* @__PURE__ */ jsx6(Text6, { children: " " }),
    /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "\u2191/\u2193 choose  enter select  esc dismiss" })
  ] });
}
function HiddenObjectivesOverlay({
  project,
  onUnhide,
  onClose
}) {
  const hidden = project.objectives.map((obj, i) => ({ obj, realIndex: i })).filter(({ obj }) => obj.hidden);
  const [selected, setSelected] = useState5(0);
  useInput4((input, key) => {
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
  return /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", borderStyle: "round", borderColor: theme.peach, paddingX: 2, paddingY: 1, children: [
    /* @__PURE__ */ jsx6(Text6, { bold: true, color: theme.peach, children: "Hidden Objectives" }),
    /* @__PURE__ */ jsx6(Text6, { children: " " }),
    hidden.length === 0 && /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "No hidden objectives." }),
    hidden.map(({ obj, realIndex }, i) => /* @__PURE__ */ jsx6(Text6, { inverse: selected === i, children: `  ${obj.text}` }, realIndex)),
    /* @__PURE__ */ jsx6(Text6, { children: " " }),
    /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "enter unhide  esc back" })
  ] });
}
function CompletedObjectivesOverlay({
  project,
  onRelist,
  onClose
}) {
  const completed = project.objectives.map((obj, i) => ({ obj, realIndex: i })).filter(({ obj }) => obj.completed);
  const [selected, setSelected] = useState5(0);
  useInput4((input, key) => {
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
  return /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", borderStyle: "round", borderColor: theme.matcha, paddingX: 2, paddingY: 1, children: [
    /* @__PURE__ */ jsx6(Text6, { bold: true, color: theme.matcha, children: "Completed Objectives" }),
    /* @__PURE__ */ jsx6(Text6, { children: " " }),
    completed.length === 0 && /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "No completed objectives." }),
    completed.map(({ obj, realIndex }, i) => /* @__PURE__ */ jsx6(Text6, { inverse: selected === i, children: `  ${obj.text}` }, realIndex)),
    /* @__PURE__ */ jsx6(Text6, { children: " " }),
    /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "enter re-list  esc back" })
  ] });
}
function ErrorOverlay({ message, onClose }) {
  useInput4((input, key) => {
    if (key.escape || key.return) {
      onClose();
    }
  });
  return /* @__PURE__ */ jsxs5(
    Box5,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: theme.rose,
      paddingX: 2,
      paddingY: 1,
      children: [
        /* @__PURE__ */ jsx6(Text6, { bold: true, color: theme.rose, children: "Error" }),
        /* @__PURE__ */ jsx6(Text6, { children: " " }),
        /* @__PURE__ */ jsx6(Text6, { children: message }),
        /* @__PURE__ */ jsx6(Text6, { children: " " }),
        /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "enter/esc dismiss" })
      ]
    }
  );
}
function SuccessOverlay({ message, onClose }) {
  useInput4((input, key) => {
    if (key.escape || key.return) {
      onClose();
    }
  });
  return /* @__PURE__ */ jsxs5(
    Box5,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: theme.matcha,
      paddingX: 2,
      paddingY: 1,
      children: [
        /* @__PURE__ */ jsx6(Text6, { bold: true, color: theme.matcha, children: "Success" }),
        /* @__PURE__ */ jsx6(Text6, { children: " " }),
        /* @__PURE__ */ jsx6(Text6, { children: message }),
        /* @__PURE__ */ jsx6(Text6, { children: " " }),
        /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "enter/esc dismiss" })
      ]
    }
  );
}
function Dashboard() {
  const { exit } = useApp();
  const [refreshKey, setRefreshKey] = useState5(0);
  const registry = useMemo(() => loadRegistry(), [refreshKey]);
  const projects = useMemo(() => Object.values(registry.projects), [registry]);
  const activeProject = registry.config.activeProject ? registry.projects[registry.config.activeProject] : void 0;
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  const [focusedPanel, setFocusedPanel] = useState5("active");
  const [enteredPanel, setEnteredPanel] = useState5(null);
  const [selectedIndices, setSelectedIndices] = useState5({
    active: 0,
    objectives: 0,
    projects: 0
  });
  const [overlay, setOverlay] = useState5(null);
  const [completedGlow, setCompletedGlow] = useState5({ project: void 0, until: 0 });
  const [rainbowIndex, setRainbowIndex] = useState5(0);
  const recentlyCompletedText = useRef2(null);
  const [recentAddition, setRecentAddition] = useState5(null);
  const [recentAdditionPulse, setRecentAdditionPulse] = useState5(false);
  const [titleVariant, setTitleVariant] = useState5("default");
  const titleCueTimeout = useRef2(null);
  const titleCueSequenceTimeouts = useRef2([]);
  const clearTitleCueSequence = useCallback(() => {
    for (const timer of titleCueSequenceTimeouts.current) {
      clearTimeout(timer);
    }
    titleCueSequenceTimeouts.current = [];
  }, []);
  const showTitleCue = useCallback((variant, duration = 2400) => {
    setTitleVariant(variant);
    if (titleCueTimeout.current) {
      clearTimeout(titleCueTimeout.current);
    }
    titleCueTimeout.current = setTimeout(() => {
      setTitleVariant("default");
      titleCueTimeout.current = null;
    }, duration);
  }, []);
  const showTitleCueSequence = useCallback((variants, stepDuration = 1400) => {
    if (variants.length === 0) return;
    clearTitleCueSequence();
    showTitleCue(variants[0], stepDuration);
    variants.slice(1).forEach((variantName, idx) => {
      const timer = setTimeout(() => {
        showTitleCue(variantName, stepDuration);
      }, stepDuration * (idx + 1));
      titleCueSequenceTimeouts.current.push(timer);
    });
  }, [clearTitleCueSequence, showTitleCue]);
  useEffect4(() => {
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
  useEffect4(() => {
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
  useEffect4(() => () => {
    if (titleCueTimeout.current) {
      clearTimeout(titleCueTimeout.current);
    }
    clearTitleCueSequence();
  }, [clearTitleCueSequence]);
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
          showTitleCue("projectCompleted");
        } else {
          playSound("success");
          showTitleCue("stageAdvanced");
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
        showTitleCue("projectArchived");
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
        showTitleCue("projectSwitched");
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
              showTitleCue("objectiveAdded");
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
        recentlyCompletedText.current = objective.text;
        playSound("completion");
        showTitleCue("objectiveCompleted");
        setCompletedGlow({ project: action.projectName, until: Date.now() + COMPLETED_GLOW_DURATION });
        if (isDirty(project.path)) {
          const openGitMenu = () => {
            const latest = loadRegistry().projects[action.projectName] ?? project;
            setOverlay({
              type: "menu",
              title: getMenuTitle("active", "remote", latest),
              items: getActiveMenuItems("remote", latest, dispatch),
              menuKind: "active:remote"
            });
          };
          setOverlay({
            type: "menu",
            title: "Branch has uncommitted changes",
            items: [
              { key: "open_git_menu", label: "Open git menu", action: () => openGitMenu() },
              { key: "later", label: "Later", action: () => {
                setOverlay(null);
              } }
            ],
            menuKind: "uncommitted_changes"
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
          execSync3(`open "${action.projectPath}"`, { stdio: "pipe" });
          playSound("success");
          showTitleCue("folderOpened");
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
          execSync3(`code "${action.projectPath}"`, { stdio: "pipe" });
          playSound("success");
          showTitleCue("vscodeOpened");
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
          showTitleCue("terminalOpened");
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
          execSync3("git add .", { cwd: project.path, stdio: "pipe" });
          playSound("success");
          showTitleCue("gitAdd");
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
        const justCompleted = recentlyCompletedText.current;
        recentlyCompletedText.current = null;
        const focusedObj = project.objectives.find((o) => o.focused && !o.hidden && !o.completed);
        const firstVisible = project.objectives.find((o) => !o.hidden && !o.completed);
        const defaultMsg = justCompleted ? `complete: ${justCompleted}` : focusedObj ? `work on ${focusedObj.text}` : firstVisible ? `work on ${firstVisible.text}` : "update";
        setOverlay({
          type: "text_input",
          prompt: "Commit message:",
          defaultValue: defaultMsg,
          onSubmit: (msg) => {
            try {
              execSync3(`git commit -m "${msg.replace(/"/g, '\\"')}"`, { cwd: project.path, stdio: "pipe" });
              playSound("success");
              showTitleCue("gitCommit");
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
          execSync3("git push", { cwd: project.path, stdio: "pipe" });
          playSound("success");
          showTitleCue("gitPush");
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
        const justCompleted = recentlyCompletedText.current;
        recentlyCompletedText.current = null;
        const focusedObj = project.objectives.find((o) => o.focused && !o.hidden && !o.completed);
        const firstVisible = project.objectives.find((o) => !o.hidden && !o.completed);
        const defaultMsg = justCompleted ? `complete: ${justCompleted}` : focusedObj ? `work on ${focusedObj.text}` : firstVisible ? `work on ${firstVisible.text}` : "update";
        setOverlay({
          type: "text_input",
          prompt: "Commit message:",
          defaultValue: defaultMsg,
          onSubmit: (msg) => {
            try {
              execSync3("git add .", { cwd: project.path, stdio: "pipe" });
              execSync3(`git commit -m "${msg.replace(/"/g, '\\"')}"`, { cwd: project.path, stdio: "pipe" });
              playSound("success");
              showTitleCueSequence(["gitAdd", "gitCommit"]);
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
        const justCompleted = recentlyCompletedText.current;
        recentlyCompletedText.current = null;
        const focusedObj = project.objectives.find((o) => o.focused && !o.hidden && !o.completed);
        const firstVisible = project.objectives.find((o) => !o.hidden && !o.completed);
        const defaultMsg = justCompleted ? `complete: ${justCompleted}` : focusedObj ? `work on ${focusedObj.text}` : firstVisible ? `work on ${firstVisible.text}` : "update";
        setOverlay({
          type: "text_input",
          prompt: "Commit message:",
          defaultValue: defaultMsg,
          onSubmit: (msg) => {
            try {
              execSync3("git add .", { cwd: project.path, stdio: "pipe" });
              execSync3(`git commit -m "${msg.replace(/"/g, '\\"')}"`, { cwd: project.path, stdio: "pipe" });
              execSync3("git push", { cwd: project.path, stdio: "pipe" });
              playSound("success");
              showTitleCueSequence(["gitAdd", "gitCommit", "gitPush"]);
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
          execSync3(`open "${browserUrl}"`, { stdio: "pipe" });
          playSound("success");
          showTitleCue("browserOpened");
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
          execSync3("git pull", { cwd: project.path, stdio: "pipe" });
          playSound("success");
          showTitleCue("gitPull");
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
          execSync3("git fetch", { cwd: project.path, stdio: "pipe" });
          playSound("success");
          showTitleCue("gitFetch");
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
          execSync3("git fetch --all --prune", { cwd: project.path, stdio: "pipe" });
          playSound("success");
          showTitleCue("gitRefresh");
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
          execSync3(command, { cwd: project.path, stdio: "pipe" });
          playSound("success");
          showTitleCue("gitCheckout");
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
      case "open_agent_detail":
      case "open_skill_detail": {
        const isAgent = action.type === "open_agent_detail";
        const projectPath = activeProject?.path;
        const list = isAgent ? listAgents(projectPath) : listSkills(projectPath);
        const asset = list.find((a) => a.scope === action.scope && a.name === action.name);
        if (!asset) break;
        setOverlay({
          type: "menu",
          title: getAssetDetailTitle(asset),
          items: getAssetDetailMenuItems(asset, dispatch),
          menuKind: `asset_detail:${asset.kind}`
        });
        return;
      }
      case "edit_agent_prompt":
      case "edit_skill_prompt": {
        const isAgent = action.type === "edit_agent_prompt";
        const projectPath = activeProject?.path;
        const list = isAgent ? listAgents(projectPath) : listSkills(projectPath);
        const asset = list.find((a) => a.scope === action.scope && a.name === action.name);
        if (!asset) break;
        setOverlay({
          type: "text_input",
          prompt: `Edit ${isAgent ? "sub-agent" : "skill"} '${asset.name}' prompt (${asset.scope}):`,
          defaultValue: asset.body,
          multiline: true,
          onSubmit: (text) => {
            writeAsset(asset, { body: text });
            setOverlay(null);
            refresh();
          }
        });
        return;
      }
      case "edit_agent_description":
      case "edit_skill_description": {
        const isAgent = action.type === "edit_agent_description";
        const projectPath = activeProject?.path;
        const list = isAgent ? listAgents(projectPath) : listSkills(projectPath);
        const asset = list.find((a) => a.scope === action.scope && a.name === action.name);
        if (!asset) break;
        setOverlay({
          type: "text_input",
          prompt: `Edit '${asset.name}' description (${asset.scope}):`,
          defaultValue: asset.description,
          onSubmit: (text) => {
            writeAsset(asset, { description: text });
            setOverlay(null);
            refresh();
          }
        });
        return;
      }
      case "new_agent":
      case "new_skill": {
        const isAgent = action.type === "new_agent";
        if (action.scope === "project" && !activeProject) {
          setOverlay({ type: "error", message: "No active project for project-scope asset." });
          return;
        }
        const kind = isAgent ? "agent" : "skill";
        setOverlay({
          type: "text_input",
          prompt: `New ${isAgent ? "sub-agent" : "skill"} name (${action.scope}):`,
          onSubmit: (name) => {
            const cleanName = name.trim().replace(/\s+/g, "-");
            if (!cleanName) {
              setOverlay(null);
              return;
            }
            setOverlay({
              type: "text_input",
              prompt: `Description for '${cleanName}':`,
              onSubmit: (description) => {
                setOverlay({
                  type: "text_input",
                  prompt: `Prompt body for '${cleanName}':`,
                  multiline: true,
                  onSubmit: (body) => {
                    try {
                      createAsset({
                        kind,
                        scope: action.scope,
                        name: cleanName,
                        description,
                        body,
                        projectPath: activeProject?.path
                      });
                      playSound("success");
                      showTitleCue("assetCreated");
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : String(err);
                      setOverlay({ type: "error", message: `Create failed:
${msg}` });
                      return;
                    }
                    setOverlay(null);
                    refresh();
                  }
                });
              }
            });
          }
        });
        return;
      }
      case "delete_agent":
      case "delete_skill": {
        const isAgent = action.type === "delete_agent";
        const projectPath = activeProject?.path;
        const list = isAgent ? listAgents(projectPath) : listSkills(projectPath);
        const asset = list.find((a) => a.scope === action.scope && a.name === action.name);
        if (!asset) break;
        try {
          deleteAsset(asset);
          playSound("delete");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setOverlay({ type: "error", message: `Delete failed:
${msg}` });
          return;
        }
        break;
      }
      case "run_quick_action": {
        const project = registry.projects[action.projectName];
        if (!project) break;
        const actions = getQuickActions(project.path);
        const qa = actions.find((a) => a.id === action.actionId);
        if (!qa) {
          setOverlay({ type: "error", message: `Action '${action.actionId}' not found.` });
          return;
        }
        recordActionUsage(project.path, action.actionId);
        setOverlay({ type: "run_action", action: qa, projectPath: project.path });
        playSound("enter");
        return;
      }
      case "toggle_default_action": {
        const project = registry.projects[action.projectName];
        if (!project) break;
        const isDefault = toggleDefault(project.path, action.actionId);
        playSound("toggle");
        setOverlay({ type: "success", message: isDefault ? `Set '${action.actionId}' as default` : `Removed '${action.actionId}' from defaults` });
        return;
      }
      case "add_quick_action": {
        const project = registry.projects[action.projectName];
        if (!project) break;
        setOverlay({
          type: "text_input",
          prompt: 'Command to run (e.g. "npm run lint"):',
          onSubmit: (raw) => {
            const parts = raw.trim().split(/\s+/);
            if (parts.length === 0 || !parts[0]) {
              setOverlay(null);
              return;
            }
            const cmd = parts[0];
            const args = parts.slice(1);
            const id = `custom:${raw.trim().replace(/\s+/g, "-")}`;
            const newAction = {
              id,
              label: raw.trim(),
              command: cmd,
              args,
              source: "custom"
            };
            const existing = loadCustomActions(project.path);
            const idx = existing.findIndex((a) => a.id === id);
            if (idx >= 0) existing[idx] = newAction;
            else existing.push(newAction);
            saveCustomActions(project.path, existing);
            playSound("success");
            setOverlay(null);
            refresh();
          }
        });
        return;
      }
      case "generate_actions_agent": {
        const project = registry.projects[action.projectName];
        if (!project) break;
        try {
          createAsset({
            kind: "agent",
            scope: "project",
            name: "quick-actions-generator",
            description: "Generates .pina/actions.json with suggested quick actions for this project",
            body: ACTIONS_AGENT_PROMPT,
            projectPath: project.path
          });
          setOverlay({
            type: "success",
            message: 'Created agent "quick-actions-generator" in .claude/agents/.\nRelaunch Claude Code to index it, then ask it to generate actions.'
          });
          playSound("success");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setOverlay({ type: "error", message: `Failed to create agent:
${msg}` });
        }
        return;
      }
      case "close":
        break;
    }
    setOverlay(null);
    refresh();
  }, [registry, refresh, setCompletedGlow, setRecentAddition, activeProject, showTitleCue]);
  const openMenu = useCallback(() => {
    if (!enteredPanel) return;
    if (enteredPanel === "active" && activeProject) {
      const selectables = getActiveSelectables(activeProject);
      const key = selectables[selectedIndices.active];
      if (!key) return;
      if (key === "git_history") {
        setOverlay({ type: "git_history", projectPath: activeProject.path });
        playSound("enter");
        return;
      }
      if (key === "claude") {
        setOverlay({ type: "claude_usage", projectPath: activeProject.path });
        playSound("enter");
        return;
      }
      if (key.startsWith("action:")) {
        const actionId = key.slice(7);
        dispatch({ type: "run_quick_action", projectName: activeProject.name, actionId });
        return;
      }
      if (key === "actions_more") {
        const all = getQuickActions(activeProject.path);
        const surface = getSurfaceActions(activeProject.path);
        const surfaceIds = new Set(surface.map((a) => a.id));
        const rest = all.filter((a) => !surfaceIds.has(a.id));
        const meta = loadActionsMeta(activeProject.path);
        const defaultSet = new Set(meta.defaults);
        const items2 = rest.map((a) => ({
          key: `action:${a.id}`,
          label: `${defaultSet.has(a.id) ? "\u2605 " : ""}${a.label}`,
          action: () => dispatch({ type: "run_quick_action", projectName: activeProject.name, actionId: a.id })
        }));
        setOverlay({ type: "menu", title: "More Actions", items: items2, menuKind: "active:actions" });
        playSound("enter");
        return;
      }
      if (key === "actions_add") {
        dispatch({ type: "add_quick_action", projectName: activeProject.name });
        return;
      }
      if (key === "actions_ai") {
        dispatch({ type: "generate_actions_agent", projectName: activeProject.name });
        return;
      }
      const title = getMenuTitle("active", key, activeProject);
      const items = getActiveMenuItems(key, activeProject, dispatch);
      const menuKind = key.startsWith("note:") ? "active:note" : `active:${key}`;
      setOverlay({ type: "menu", title, items, menuKind });
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
      setOverlay({ type: "menu", title, items, menuKind: "objective" });
    }
    if (enteredPanel === "projects") {
      const project = projects[selectedIndices.projects];
      if (!project) return;
      const isActive = project.name === registry.config.activeProject;
      const title = getMenuTitle("projects", "", project);
      const items = getProjectsMenuItems(project, isActive, dispatch);
      setOverlay({ type: "menu", title, items, menuKind: "project" });
    }
  }, [enteredPanel, activeProject, projects, selectedIndices, registry, dispatch]);
  const [muted, setMutedState] = useState5(() => isMuted());
  const [soundProfile, setSoundProfileState] = useState5(() => getSoundProfile());
  const [paletteName, setPaletteNameState] = useState5(() => getPaletteName());
  useInput4((input, key) => {
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
    if (input === "p" && !enteredPanel) {
      const next = cyclePalette();
      setPaletteNameState(next);
      playSound("toggle");
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
    if (input === "d" && enteredPanel === "active" && activeProject) {
      const selectables = getActiveSelectables(activeProject);
      const key2 = selectables[selectedIndices.active];
      if (key2?.startsWith("action:")) {
        dispatch({ type: "toggle_default_action", projectName: activeProject.name, actionId: key2.slice(7) });
        return;
      }
    }
    if (enteredPanel && key.leftArrow) {
      playSound("back");
      setEnteredPanel(null);
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
    if (!enteredPanel && (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow)) {
      let next = focusedPanel;
      if (key.leftArrow) next = "active";
      else if (key.rightArrow) next = focusedPanel === "active" ? "objectives" : focusedPanel;
      else if (key.upArrow) next = focusedPanel === "projects" ? "objectives" : focusedPanel === "objectives" ? "active" : "active";
      else if (key.downArrow) next = focusedPanel === "objectives" ? "projects" : focusedPanel === "active" ? "objectives" : "projects";
      if (next !== focusedPanel) {
        playSound("navigate", PANEL_ORDER.indexOf(next));
        setFocusedPanel(next);
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
    if (enteredPanel === panel) return sectionColor[panel === "active" ? "active" : panel === "objectives" ? "objectives" : "projects"];
    if (enteredPanel && enteredPanel !== panel) return theme.dimCream;
    if (!enteredPanel && focusedPanel === panel) return sectionColor[panel === "active" ? "active" : panel === "objectives" ? "objectives" : "projects"];
    return theme.oat;
  };
  const headingColor = (panel) => {
    if (enteredPanel && enteredPanel !== panel) return theme.dimCream;
    return sectionColor[panel === "active" ? "active" : panel === "objectives" ? "objectives" : "projects"];
  };
  const muteIndicator = muted ? " [muted]" : "";
  const profileIndicator = ` [${soundProfile}]`;
  const helpText = overlay ? "" : enteredPanel ? `\u2191\u2193/tab navigate  enter action${enteredPanel === "active" ? "  d default" : ""}  esc back${profileIndicator}${muteIndicator}` : `tab panel  enter open  p palette [${paletteName}]  s sound${profileIndicator}  m ${muted ? "unmute" : "mute"}  q quit`;
  const dashboardContent = /* @__PURE__ */ jsxs5(Fragment, { children: [
    /* @__PURE__ */ jsxs5(Box5, { flexGrow: 1, children: [
      /* @__PURE__ */ jsxs5(
        Box5,
        {
          flexDirection: "column",
          width: "50%",
          borderStyle: focusedPanel === "active" ? "bold" : "round",
          borderColor: borderColor("active"),
          paddingX: 1,
          paddingY: 1,
          children: [
            /* @__PURE__ */ jsx6(Box5, { marginTop: -2, marginBottom: 1, justifyContent: "flex-end", paddingRight: 2, children: /* @__PURE__ */ jsx6(Text6, { bold: true, color: headingColor("active"), children: " Active Project " }) }),
            /* @__PURE__ */ jsx6(
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
      /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", width: "50%", children: [
        /* @__PURE__ */ jsxs5(
          Box5,
          {
            flexDirection: "column",
            borderStyle: focusedPanel === "objectives" ? "bold" : "round",
            borderColor: borderColor("objectives"),
            paddingX: 1,
            paddingY: 1,
            children: [
              /* @__PURE__ */ jsx6(Box5, { marginTop: -2, marginLeft: 1, marginBottom: 1, children: /* @__PURE__ */ jsx6(Text6, { bold: true, color: headingColor("objectives"), children: " Objectives " }) }),
              /* @__PURE__ */ jsx6(
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
        /* @__PURE__ */ jsxs5(
          Box5,
          {
            flexDirection: "column",
            borderStyle: focusedPanel === "projects" ? "bold" : "round",
            borderColor: borderColor("projects"),
            paddingX: 1,
            paddingY: 1,
            flexGrow: 1,
            children: [
              /* @__PURE__ */ jsx6(Box5, { marginTop: -2, marginLeft: 1, marginBottom: 1, children: /* @__PURE__ */ jsxs5(Text6, { children: [
                " ",
                /* @__PURE__ */ jsx6(Text6, { bold: true, color: headingColor("projects"), children: "All Projects" }),
                /* @__PURE__ */ jsxs5(Text6, { color: theme.dimCream, children: [
                  " (",
                  projects.length,
                  ")"
                ] }),
                " "
              ] }) }),
              /* @__PURE__ */ jsx6(
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
    helpText && /* @__PURE__ */ jsx6(Box5, { paddingX: 2, justifyContent: "center", children: /* @__PURE__ */ jsx6(Text6, { color: theme.dimCream, children: helpText }) })
  ] });
  const overlayContent = overlay ? /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", alignItems: "center", justifyContent: "center", flexGrow: 1, paddingY: 2, children: [
    overlay.type === "run_action" && /* @__PURE__ */ jsx6(
      RunOutputOverlay,
      {
        action: overlay.action,
        projectPath: overlay.projectPath,
        onClose: () => {
          setOverlay(null);
          refresh();
        }
      }
    ),
    /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", width: overlay.type === "run_action" ? void 0 : 50, children: [
      overlay.type === "menu" && /* @__PURE__ */ jsx6(
        ContextMenu,
        {
          title: overlay.title,
          items: overlay.items,
          menuKind: overlay.menuKind,
          onClose: () => {
            setOverlay(null);
            refresh();
          }
        }
      ),
      overlay.type === "text_input" && /* @__PURE__ */ jsx6(
        TextInput,
        {
          prompt: overlay.prompt,
          defaultValue: overlay.defaultValue,
          multiline: overlay.multiline,
          onSubmit: overlay.onSubmit,
          onCancel: () => {
            setOverlay(null);
          }
        }
      ),
      overlay.type === "error" && /* @__PURE__ */ jsx6(
        ErrorOverlay,
        {
          message: overlay.message,
          onClose: () => {
            setOverlay(null);
          }
        }
      ),
      overlay.type === "success" && /* @__PURE__ */ jsx6(
        SuccessOverlay,
        {
          message: overlay.message,
          onClose: () => {
            setOverlay(null);
          }
        }
      ),
      overlay.type === "timeline" && /* @__PURE__ */ jsx6(
        TimelineOverlay,
        {
          milestones: overlay.milestones,
          onClose: () => {
            setOverlay(null);
          }
        }
      ),
      overlay.type === "claude_usage" && /* @__PURE__ */ jsx6(
        ClaudeUsageOverlay,
        {
          projectPath: overlay.projectPath,
          onClose: () => {
            setOverlay(null);
          },
          onError: (message) => {
            setOverlay({ type: "error", message });
          }
        }
      ),
      overlay.type === "git_history" && /* @__PURE__ */ jsx6(
        GitHistoryOverlay,
        {
          projectPath: overlay.projectPath,
          onClose: () => {
            setOverlay(null);
          },
          onError: (message) => {
            setOverlay({ type: "error", message });
          },
          onReset: () => {
            setOverlay(null);
            refresh();
          },
          onInfo: (message) => {
            setOverlay({ type: "success", message });
          }
        }
      ),
      overlay.type === "hidden_objectives" && registry.projects[overlay.projectName] && /* @__PURE__ */ jsx6(
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
      overlay.type === "completed_objectives" && registry.projects[overlay.projectName] && /* @__PURE__ */ jsx6(
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
    ] })
  ] }) : null;
  return /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", children: [
    /* @__PURE__ */ jsx6(PinaHeader, { variant: titleVariant }),
    overlayContent ?? dashboardContent
  ] });
}

// src/commands/init.tsx
import { useEffect as useEffect5, useState as useState6 } from "react";
import { Text as Text7, Box as Box6 } from "ink";
import path10 from "path";

// src/lib/venv.ts
import fs10 from "fs";
import path9 from "path";
function detectVenv(projectPath) {
  const candidates = [".venv", "venv"];
  for (const candidate of candidates) {
    const venvPath = path9.join(projectPath, candidate);
    if (fs10.existsSync(venvPath) && fs10.statSync(venvPath).isDirectory()) {
      const activatePath = path9.join(venvPath, "bin", "activate");
      if (fs10.existsSync(activatePath)) {
        return candidate;
      }
    }
  }
  return void 0;
}
function getActivateCommand(projectPath, venvName) {
  return `source ${path9.join(projectPath, venvName, "bin", "activate")}`;
}

// src/commands/init.tsx
import { jsx as jsx7, jsxs as jsxs6 } from "react/jsx-runtime";
function InitCommand({ path: projectPath }) {
  const [status, setStatus] = useState6("loading");
  const [projectName, setProjectName] = useState6("");
  useEffect5(() => {
    const name = path10.basename(projectPath);
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
  return /* @__PURE__ */ jsxs6(Box6, { flexDirection: "column", padding: 1, children: [
    status === "loading" && /* @__PURE__ */ jsx7(Text7, { color: "yellow", children: "Initializing project..." }),
    status === "exists" && /* @__PURE__ */ jsxs6(Text7, { color: "red", children: [
      'Project "',
      projectName,
      '" is already registered.'
    ] }),
    status === "done" && /* @__PURE__ */ jsxs6(Box6, { flexDirection: "column", children: [
      /* @__PURE__ */ jsxs6(Text7, { color: "green", children: [
        'Registered "',
        projectName,
        '" as a pina project.'
      ] }),
      /* @__PURE__ */ jsxs6(Text7, { dimColor: true, children: [
        "Path: ",
        projectPath
      ] })
    ] })
  ] });
}

// src/commands/list.tsx
import { Text as Text9, Box as Box8 } from "ink";

// src/components/ProjectTable.tsx
import { Text as Text8, Box as Box7 } from "ink";
import { jsx as jsx8, jsxs as jsxs7 } from "react/jsx-runtime";
function ProjectTable({ projects, activeProject }) {
  const maxName = Math.max(...projects.map((p) => p.name.length), 4);
  const maxPath = Math.max(...projects.map((p) => p.path.length), 4);
  return /* @__PURE__ */ jsxs7(Box7, { flexDirection: "column", children: [
    /* @__PURE__ */ jsxs7(Box7, { gap: 2, children: [
      /* @__PURE__ */ jsxs7(Text8, { bold: true, dimColor: true, children: [
        "  ",
        "Name".padEnd(maxName)
      ] }),
      /* @__PURE__ */ jsx8(Text8, { bold: true, dimColor: true, children: "Stage".padEnd(14) }),
      /* @__PURE__ */ jsx8(Text8, { bold: true, dimColor: true, children: "Tags".padEnd(20) }),
      /* @__PURE__ */ jsx8(Text8, { bold: true, dimColor: true, children: "Last Switched".padEnd(12) }),
      /* @__PURE__ */ jsx8(Text8, { bold: true, dimColor: true, children: "XP" })
    ] }),
    projects.map((project) => {
      const isActive = project.name === activeProject;
      const marker = isActive ? "\u25B8" : " ";
      return /* @__PURE__ */ jsxs7(Box7, { gap: 2, children: [
        /* @__PURE__ */ jsxs7(Text8, { color: isActive ? "green" : void 0, children: [
          marker,
          " ",
          project.name.padEnd(maxName)
        ] }),
        /* @__PURE__ */ jsx8(Box7, { width: 14, children: /* @__PURE__ */ jsx8(StatusBadge, { stage: project.stage, stale: project.stale, status: project.status }) }),
        /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: (project.tags.join(", ") || "\u2014").padEnd(20) }),
        /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: (project.lastSwitched ?? "\u2014").padEnd(12) }),
        /* @__PURE__ */ jsx8(Text8, { color: "yellow", children: project.xp })
      ] }, project.name);
    })
  ] });
}

// src/commands/list.tsx
import { jsx as jsx9 } from "react/jsx-runtime";
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
    return /* @__PURE__ */ jsx9(Box8, { padding: 1, children: /* @__PURE__ */ jsx9(Text9, { dimColor: true, children: "No projects found. Run `pina init` or `pina scan` to add projects." }) });
  }
  return /* @__PURE__ */ jsx9(Box8, { padding: 1, children: /* @__PURE__ */ jsx9(ProjectTable, { projects, activeProject: registry.config.activeProject }) });
}

// src/commands/switch.tsx
import { useEffect as useEffect6, useState as useState7 } from "react";
import { Text as Text10, Box as Box9 } from "ink";
import { jsx as jsx10, jsxs as jsxs8 } from "react/jsx-runtime";
function SwitchCommand({ name }) {
  const [status, setStatus] = useState7("loading");
  const [venvCommand, setVenvCommand] = useState7();
  useEffect6(() => {
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
  return /* @__PURE__ */ jsxs8(Box9, { flexDirection: "column", padding: 1, children: [
    status === "loading" && /* @__PURE__ */ jsx10(Text10, { color: "yellow", children: "Switching..." }),
    status === "not_found" && /* @__PURE__ */ jsxs8(Text10, { color: "red", children: [
      'Project "',
      name,
      '" not found.'
    ] }),
    status === "done" && /* @__PURE__ */ jsxs8(Box9, { flexDirection: "column", children: [
      /* @__PURE__ */ jsxs8(Text10, { color: "green", children: [
        'Switched to "',
        name,
        '"'
      ] }),
      venvCommand && /* @__PURE__ */ jsxs8(Text10, { dimColor: true, children: [
        "Activate venv: ",
        venvCommand
      ] })
    ] })
  ] });
}

// src/commands/status.tsx
import { Text as Text11, Box as Box10 } from "ink";
import { jsx as jsx11, jsxs as jsxs9 } from "react/jsx-runtime";
function StatusCommand() {
  const registry = loadRegistry();
  const project = getActiveProject();
  if (!project) {
    return /* @__PURE__ */ jsx11(Box10, { padding: 1, children: /* @__PURE__ */ jsx11(Text11, { dimColor: true, children: "No active project. Run `pina switch <name>` to select one." }) });
  }
  const branch = getCurrentBranch(project.path);
  const dirty = isDirty(project.path);
  const commits = getCommitCount(project.path);
  return /* @__PURE__ */ jsxs9(Box10, { flexDirection: "column", padding: 1, gap: 1, children: [
    /* @__PURE__ */ jsxs9(Box10, { flexDirection: "column", children: [
      /* @__PURE__ */ jsxs9(Box10, { gap: 2, children: [
        /* @__PURE__ */ jsx11(Text11, { bold: true, children: project.name }),
        /* @__PURE__ */ jsx11(StatusBadge, { stage: project.stage, stale: project.stale, status: project.status })
      ] }),
      /* @__PURE__ */ jsx11(Text11, { dimColor: true, children: project.path })
    ] }),
    /* @__PURE__ */ jsxs9(Box10, { flexDirection: "column", children: [
      branch && /* @__PURE__ */ jsxs9(Text11, { children: [
        "Branch: ",
        /* @__PURE__ */ jsx11(Text11, { color: "cyan", children: branch }),
        dirty ? /* @__PURE__ */ jsx11(Text11, { color: "yellow", children: " (dirty)" }) : ""
      ] }),
      project.remote && /* @__PURE__ */ jsxs9(Text11, { children: [
        "Remote: ",
        /* @__PURE__ */ jsx11(Text11, { color: "blue", children: project.remote })
      ] }),
      /* @__PURE__ */ jsxs9(Text11, { children: [
        "Commits: ",
        commits,
        " | Switches: ",
        project.stats.switches,
        " | XP: ",
        project.xp
      ] }),
      project.tags.length > 0 && /* @__PURE__ */ jsxs9(Text11, { children: [
        "Tags: ",
        project.tags.join(", ")
      ] })
    ] }),
    project.notes.length > 0 && /* @__PURE__ */ jsxs9(Box10, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx11(Text11, { bold: true, children: "Notes:" }),
      project.notes.slice(-3).map((note, i) => /* @__PURE__ */ jsxs9(Text11, { dimColor: true, children: [
        "  - ",
        note
      ] }, i))
    ] }),
    Object.keys(project.milestones).length > 0 && /* @__PURE__ */ jsxs9(Box10, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx11(Text11, { bold: true, children: "Milestones:" }),
      Object.entries(project.milestones).map(([key, date]) => /* @__PURE__ */ jsxs9(Text11, { dimColor: true, children: [
        "  ",
        MILESTONE_LABELS[key] ?? key,
        ": ",
        date
      ] }, key))
    ] })
  ] });
}

// src/commands/new.tsx
import { useEffect as useEffect7, useState as useState8 } from "react";
import { Text as Text12, Box as Box11 } from "ink";
import path11 from "path";
import fs11 from "fs";
import { jsx as jsx12, jsxs as jsxs10 } from "react/jsx-runtime";
function NewCommand({ name, path: inputPath }) {
  const [status, setStatus] = useState8("loading");
  const [resolvedPath, setResolvedPath] = useState8("");
  useEffect7(() => {
    const projectPath = inputPath ? path11.resolve(inputPath.replace(/^~/, process.env["HOME"] ?? "")) : process.cwd();
    setResolvedPath(projectPath);
    if (!fs11.existsSync(projectPath)) {
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
  return /* @__PURE__ */ jsxs10(Box11, { flexDirection: "column", padding: 1, children: [
    status === "loading" && /* @__PURE__ */ jsx12(Text12, { color: "yellow", children: "Registering project..." }),
    status === "not_found" && /* @__PURE__ */ jsxs10(Text12, { color: "red", children: [
      "Directory not found: ",
      resolvedPath
    ] }),
    status === "exists" && /* @__PURE__ */ jsxs10(Text12, { color: "red", children: [
      'Project "',
      name,
      '" already exists.'
    ] }),
    status === "done" && /* @__PURE__ */ jsxs10(Box11, { flexDirection: "column", children: [
      /* @__PURE__ */ jsxs10(Text12, { color: "green", children: [
        'Registered "',
        name,
        '" as a pina project.'
      ] }),
      /* @__PURE__ */ jsxs10(Text12, { dimColor: true, children: [
        "Path: ",
        resolvedPath
      ] })
    ] })
  ] });
}

// src/commands/archive.tsx
import { useEffect as useEffect8, useState as useState9 } from "react";
import { Text as Text13, Box as Box12 } from "ink";
import { jsx as jsx13, jsxs as jsxs11 } from "react/jsx-runtime";
function ArchiveCommand({ name }) {
  const [status, setStatus] = useState9("loading");
  useEffect8(() => {
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
  return /* @__PURE__ */ jsxs11(Box12, { padding: 1, children: [
    status === "loading" && /* @__PURE__ */ jsx13(Text13, { color: "yellow", children: "Archiving..." }),
    status === "not_found" && /* @__PURE__ */ jsxs11(Text13, { color: "red", children: [
      'Project "',
      name,
      '" not found.'
    ] }),
    status === "done" && /* @__PURE__ */ jsxs11(Text13, { color: "green", children: [
      'Archived "',
      name,
      '".'
    ] })
  ] });
}

// src/commands/note.tsx
import { useEffect as useEffect9, useState as useState10 } from "react";
import { Text as Text14, Box as Box13 } from "ink";
import { jsx as jsx14, jsxs as jsxs12 } from "react/jsx-runtime";
function NoteCommand({ text }) {
  const [status, setStatus] = useState10("loading");
  useEffect9(() => {
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
  return /* @__PURE__ */ jsxs12(Box13, { padding: 1, children: [
    status === "loading" && /* @__PURE__ */ jsx14(Text14, { color: "yellow", children: "Adding note..." }),
    status === "no_project" && /* @__PURE__ */ jsx14(Text14, { color: "red", children: "No active project. Run `pina switch <name>` first." }),
    status === "done" && /* @__PURE__ */ jsx14(Text14, { color: "green", children: "Note added." })
  ] });
}

// src/commands/scan.tsx
import { useState as useState11, useEffect as useEffect10 } from "react";
import { Text as Text15, Box as Box14, useInput as useInput5, useApp as useApp2 } from "ink";

// src/lib/detector.ts
import fs12 from "fs";
import path12 from "path";
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
  if (fs12.existsSync(path12.join(dir, ".venv"))) return ".venv";
  if (fs12.existsSync(path12.join(dir, "venv"))) return "venv";
  return void 0;
}
function detectAiConfig(dir) {
  if (fs12.existsSync(path12.join(dir, "CLAUDE.md"))) return "CLAUDE.md";
  if (fs12.existsSync(path12.join(dir, ".claude"))) return ".claude";
  return void 0;
}
function detectProject(dir) {
  const name = path12.basename(dir);
  const tags = /* @__PURE__ */ new Set();
  let matched = false;
  for (const signal of SIGNALS) {
    const fullPath = path12.join(dir, signal.file);
    const exists = signal.isDir ? fs12.existsSync(fullPath) && fs12.statSync(fullPath).isDirectory() : fs12.existsSync(fullPath);
    if (exists) {
      matched = true;
      for (const tag of signal.tags) {
        tags.add(tag);
      }
    }
  }
  const hasGit = fs12.existsSync(path12.join(dir, ".git"));
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
  const resolvedDir = path12.resolve(dir.replace(/^~/, process.env["HOME"] ?? ""));
  if (!fs12.existsSync(resolvedDir)) return [];
  const entries = fs12.readdirSync(resolvedDir, { withFileTypes: true });
  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path12.join(resolvedDir, entry.name);
    if (skipPaths?.has(fullPath)) continue;
    const detected = detectProject(fullPath);
    if (detected) {
      projects.push(detected);
    }
  }
  return projects.sort((a, b) => a.name.localeCompare(b.name));
}

// src/commands/scan.tsx
import { jsx as jsx15, jsxs as jsxs13 } from "react/jsx-runtime";
function ScanCommand({ directory }) {
  const { exit } = useApp2();
  const [detected, setDetected] = useState11([]);
  const [selected, setSelected] = useState11(/* @__PURE__ */ new Set());
  const [cursor, setCursor] = useState11(0);
  const [phase, setPhase] = useState11("scanning");
  const [registered, setRegistered] = useState11(0);
  const [skippedCount, setSkippedCount] = useState11(0);
  useEffect10(() => {
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
  useInput5((input, key) => {
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
    return /* @__PURE__ */ jsx15(Box14, { padding: 1, children: /* @__PURE__ */ jsxs13(Text15, { color: "yellow", children: [
      "Scanning ",
      directory,
      "..."
    ] }) });
  }
  if (phase === "done" && detected.length === 0) {
    return /* @__PURE__ */ jsx15(Box14, { padding: 1, flexDirection: "column", children: skippedCount > 0 ? /* @__PURE__ */ jsxs13(Text15, { dimColor: true, children: [
      "All ",
      skippedCount,
      " detected projects are already registered."
    ] }) : /* @__PURE__ */ jsxs13(Text15, { dimColor: true, children: [
      "No projects detected in ",
      directory,
      "."
    ] }) });
  }
  if (phase === "done") {
    return /* @__PURE__ */ jsx15(Box14, { padding: 1, children: /* @__PURE__ */ jsxs13(Text15, { color: "green", children: [
      "Registered ",
      registered,
      " project",
      registered !== 1 ? "s" : "",
      "."
    ] }) });
  }
  return /* @__PURE__ */ jsxs13(Box14, { flexDirection: "column", padding: 1, children: [
    /* @__PURE__ */ jsxs13(Text15, { bold: true, children: [
      "Found ",
      detected.length,
      " new project",
      detected.length !== 1 ? "s" : "",
      skippedCount > 0 ? /* @__PURE__ */ jsxs13(Text15, { dimColor: true, children: [
        " (",
        skippedCount,
        " already registered)"
      ] }) : ""
    ] }),
    /* @__PURE__ */ jsx15(Text15, { dimColor: true, children: " " }),
    detected.map((project, idx) => {
      const isSelected = selected.has(idx);
      const isCursor = cursor === idx;
      const indicator = isSelected ? "\u25C9" : "\u25CB";
      const tags = project.tags.length > 0 ? `[${project.tags.join(", ")}]` : "[unknown]";
      return /* @__PURE__ */ jsxs13(Text15, { children: [
        isCursor ? /* @__PURE__ */ jsx15(Text15, { color: "cyan", children: "\u276F " }) : "  ",
        /* @__PURE__ */ jsxs13(Text15, { color: isSelected ? "green" : "gray", children: [
          indicator,
          " "
        ] }),
        /* @__PURE__ */ jsx15(Text15, { bold: isCursor, children: project.name.padEnd(24) }),
        /* @__PURE__ */ jsx15(Text15, { dimColor: true, children: tags })
      ] }, project.path);
    }),
    /* @__PURE__ */ jsx15(Text15, { dimColor: true, children: " " }),
    /* @__PURE__ */ jsx15(Text15, { dimColor: true, children: "\u2191\u2193 navigate  space toggle  a all  enter confirm  q quit" })
  ] });
}

// src/cli.ts
var program = new Command();
program.name("pina").description("Personal project management CLI").version("0.1.0").action(() => {
  render(React12.createElement(Dashboard));
});
program.command("init").description("Register the current directory as a pina project").action(() => {
  render(React12.createElement(InitCommand, { path: process.cwd() }));
});
program.command("new <name>").description("Register an existing directory as a project").option("-p, --path <path>", "Path to the project directory").action((name, opts) => {
  render(React12.createElement(NewCommand, { name, path: opts.path }));
});
program.command("scan <directory>").description("Scan a directory and detect projects").action((directory) => {
  render(React12.createElement(ScanCommand, { directory }));
});
program.command("switch <name>").description("Switch to a project").action((name) => {
  render(React12.createElement(SwitchCommand, { name }));
});
program.command("list").alias("ls").description("List all projects").option("-s, --stage <stage>", "Filter by stage").option("-t, --tag <tag>", "Filter by tag").action((opts) => {
  render(React12.createElement(ListCommand, opts));
});
program.command("status").description("Show current project status").action(() => {
  render(React12.createElement(StatusCommand));
});
program.command("note <text>").description("Add a note to the current project").action((text) => {
  render(React12.createElement(NoteCommand, { text }));
});
program.command("archive <name>").description("Archive a project").action((name) => {
  render(React12.createElement(ArchiveCommand, { name }));
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