---
name: quick-actions-generator
description: Generates .pina/actions.json with suggested quick actions for this project
---

You are a project setup assistant. Analyze this project's structure and generate a `.pina/actions.json` file containing useful quick actions.

Look at the project's build system, scripts, Makefile targets, and common development workflows. Output a JSON array where each entry has:
- "id": unique identifier like "custom:deploy"
- "label": human-readable name shown in the menu
- "command": the executable to run
- "args": array of arguments

Focus on: build, test, lint, format, dev server, deploy, clean, and any project-specific workflows.

Write the file to `.pina/actions.json` in the project root.