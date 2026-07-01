# Plan Mode Extension

Read-only exploration modes for safe code analysis and context building.

## Features

- **Plan mode**: read-only planning with numbered plan extraction and execution tracking
- **Discuss mode**: read-only context-building without pressure to produce a formal plan
- **Built-in write tools disabled**: Disables edit/write while preserving other active tools in plan/discuss modes
- **Bash allowlist**: Only approved bash commands are allowed in plan/discuss modes
- **Plan extraction**: Extracts numbered steps from `Plan:` sections while in plan mode
- **Progress tracking**: Widget shows completion status during execution
- **[DONE:n] markers**: Explicit step completion tracking
- **Session persistence**: State survives session resume

## Commands

- `/plan` - Toggle between plan and build modes
- `/discuss` - Toggle between discuss and build modes
- `/todos` - Show current plan progress
- `Tab` - Cycle build → plan → discuss → build (shortcut; overrides path completion while this extension is loaded)
- `Ctrl+Alt+P` - Cycle build → plan → discuss → build (shortcut)

## Flags

- `--plan` - Start in plan mode
- `--discuss` - Start in discuss mode

## Usage

### Plan mode

1. Enable plan mode with `/plan`, `Tab`, `Ctrl+Alt+P`, or `--plan` (`Tab`/`Ctrl+Alt+P` cycle through build, plan, and discuss)
2. Ask the agent to analyze code and create a plan
3. The agent should output a numbered plan under a `Plan:` header:

```
Plan:
1. First step description
2. Second step description
3. Third step description
```

4. Choose "Execute the plan" when prompted
5. During execution, the agent marks steps complete with `[DONE:n]` tags
6. Progress widget shows completion status

### Discuss mode

1. Enable discuss mode with `/discuss`, by cycling with `Tab`/`Ctrl+Alt+P`, or with `--discuss`
2. Ask questions, explore code, or establish shared context for later in the chat
3. The agent can read/search/inspect and ask clarifying questions, but should not make changes
4. The agent should capture relevant context, constraints, decisions, risks, and open questions instead of producing a formal implementation plan unless explicitly asked
5. Return to build mode with `/discuss` when ready to act on the established context

## How It Works

### Plan Mode (Read-Only)

- Built-in edit/write tools disabled
- Other active tools remain available
- Bash commands filtered through allowlist
- Agent creates a numbered plan without making changes
- Plan steps can be promoted into execution mode with progress tracking

### Discuss Mode (Read-Only)

- Built-in edit/write tools disabled
- Other active tools remain available
- Bash commands filtered through allowlist
- Agent focuses on shared context, explanations, clarifying questions, and notes for later turns
- Plan extraction and execution prompts are disabled unless you switch to plan mode

### Execution Mode

- Full tool access restored
- Agent executes steps in order
- `[DONE:n]` markers track completion
- Widget shows progress

### Command Allowlist

Allowed commands include:
- File inspection: `cat`, `head`, `tail`, `less`, `more`
- Search: `grep`, `find`, `rg`, `fd`
- Directory: `ls`, `pwd`, `tree`
- Git: `git status`, `git log`, `git diff`, `git pull`, `git checkout`, `git branch` (also via `git -C <repo> ...` or `cd <repo> && git ...`)
- GitHub CLI: `gh pr view`, `gh pr checks`
- Package info: `npm list`, `npm outdated`, `yarn info`
- System info: `uname`, `whoami`, `date`, `uptime`

Blocked commands:
- File modification: `rm`, `mv`, `cp`, `mkdir`, `touch`
- Git write: `git add`, `git commit`, `git push`
- Package install: `npm install`, `yarn add`, `pip install`
- System: `sudo`, `kill`, `reboot`
- Editors: `vim`, `nano`, `code`
