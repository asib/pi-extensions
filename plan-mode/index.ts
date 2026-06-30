/**
 * Plan Mode Extension
 *
 * Read-only exploration modes for safe code analysis and context building.
 * When enabled, built-in write tools are disabled.
 *
 * Features:
 * - /plan command to toggle between plan and build modes
 * - /discuss command to toggle between discuss and build modes
 * - Tab or Ctrl+Alt+P to cycle build → plan → discuss
 * - Bash restricted to allowlisted read-only commands
 * - Extracts numbered plan steps from "Plan:" sections in plan mode
 * - [DONE:n] markers to complete steps during execution
 * - Progress tracking widget during execution
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import { extractTodoItems, isSafeCommand, markCompletedSteps, type TodoItem } from "./utils.ts";

// Tools
const READ_ONLY_MODE_TOOLS = ["read", "bash", "grep", "find", "ls", "questionnaire"];
const NORMAL_MODE_TOOLS = ["read", "bash", "edit", "write"];
const READ_ONLY_MODE_DISABLED_TOOLS = new Set<string>(["edit", "write"]);
const MANAGED_TOOLS = new Set<string>([...READ_ONLY_MODE_TOOLS, ...NORMAL_MODE_TOOLS]);

type AssistantMode = "build" | "plan" | "discuss";

interface PlanModeState {
	enabled?: boolean;
	mode?: AssistantMode;
	todos?: TodoItem[];
	executing?: boolean;
	toolsBeforePlanMode?: string[];
}

// Type guard for assistant messages
function isAssistantMessage(m: AgentMessage): m is AssistantMessage {
	return m.role === "assistant" && Array.isArray(m.content);
}

// Extract text content from an assistant message
function getTextContent(message: AssistantMessage): string {
	return message.content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

function normalizeMode(value: unknown): AssistantMode | undefined {
	if (value === "build" || value === "plan" || value === "discuss") return value;
	return undefined;
}

export default function planModeExtension(pi: ExtensionAPI): void {
	let mode: AssistantMode = "build";
	let executionMode = false;
	let todoItems: TodoItem[] = [];
	let toolsBeforePlanMode: string[] | undefined;

	pi.registerFlag("plan", {
		description: "Start in plan mode (read-only exploration)",
		type: "boolean",
		default: false,
	});

	pi.registerFlag("discuss", {
		description: "Start in discuss mode (read-only context building)",
		type: "boolean",
		default: false,
	});

	function isReadOnlyMode(): boolean {
		return mode === "plan" || mode === "discuss";
	}

	function updateStatus(ctx: ExtensionContext): void {
		// Footer status
		if (executionMode && todoItems.length > 0) {
			const completed = todoItems.filter((t) => t.completed).length;
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("accent", `📋 ${completed}/${todoItems.length}`));
		} else if (mode === "plan") {
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("warning", "⏸ plan"));
		} else if (mode === "discuss") {
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("accent", "💬 discuss"));
		} else {
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("success", "build"));
		}

		// Widget showing todo list
		if (executionMode && todoItems.length > 0) {
			const lines = todoItems.map((item) => {
				if (item.completed) {
					return (
						ctx.ui.theme.fg("success", "☑ ") + ctx.ui.theme.fg("muted", ctx.ui.theme.strikethrough(item.text))
					);
				}
				return `${ctx.ui.theme.fg("muted", "☐ ")}${item.text}`;
			});
			ctx.ui.setWidget("plan-todos", lines);
		} else {
			ctx.ui.setWidget("plan-todos", undefined);
		}
	}

	function uniqueToolNames(toolNames: string[]): string[] {
		return [...new Set(toolNames)];
	}

	function getReadOnlyModeTools(activeToolNames: string[]): string[] {
		return uniqueToolNames([
			...activeToolNames.filter((name) => !READ_ONLY_MODE_DISABLED_TOOLS.has(name)),
			...READ_ONLY_MODE_TOOLS,
		]);
	}

	function getNormalModeTools(activeToolNames: string[]): string[] {
		return uniqueToolNames([
			...NORMAL_MODE_TOOLS,
			...activeToolNames.filter((name) => !MANAGED_TOOLS.has(name)),
		]);
	}

	function enableReadOnlyModeTools(): void {
		if (toolsBeforePlanMode === undefined) {
			toolsBeforePlanMode = pi.getActiveTools();
		}
		pi.setActiveTools(getReadOnlyModeTools(toolsBeforePlanMode));
	}

	function restoreNormalModeTools(): void {
		pi.setActiveTools(toolsBeforePlanMode ?? getNormalModeTools(pi.getActiveTools()));
		toolsBeforePlanMode = undefined;
	}

	function persistState(): void {
		pi.appendEntry("plan-mode", {
			enabled: mode === "plan",
			mode,
			todos: todoItems,
			executing: executionMode,
			toolsBeforePlanMode,
		});
	}

	function setAssistantMode(nextMode: AssistantMode, ctx: ExtensionContext): void {
		mode = nextMode;
		executionMode = false;
		todoItems = [];

		if (isReadOnlyMode()) {
			enableReadOnlyModeTools();
		} else {
			restoreNormalModeTools();
		}

		if (mode === "plan") {
			ctx.ui.notify("Plan mode enabled. Built-in write tools disabled.");
		} else if (mode === "discuss") {
			ctx.ui.notify("Discuss mode enabled. Built-in write tools disabled; focus on building shared context.");
		} else {
			ctx.ui.notify("Build mode enabled. Full access restored.");
		}
		updateStatus(ctx);
		persistState();
	}

	function togglePlanMode(ctx: ExtensionContext): void {
		setAssistantMode(mode === "plan" ? "build" : "plan", ctx);
	}

	function toggleDiscussMode(ctx: ExtensionContext): void {
		setAssistantMode(mode === "discuss" ? "build" : "discuss", ctx);
	}

	function cycleAssistantMode(ctx: ExtensionContext): void {
		const nextMode: AssistantMode = mode === "build" ? "plan" : mode === "plan" ? "discuss" : "build";
		setAssistantMode(nextMode, ctx);
	}

	pi.registerCommand("plan", {
		description: "Toggle between plan and build modes",
		handler: async (_args, ctx) => togglePlanMode(ctx),
	});

	pi.registerCommand("discuss", {
		description: "Toggle between discuss and build modes",
		handler: async (_args, ctx) => toggleDiscussMode(ctx),
	});

	pi.registerCommand("todos", {
		description: "Show current plan todo list",
		handler: async (_args, ctx) => {
			if (todoItems.length === 0) {
				ctx.ui.notify("No todos. Create a plan first with /plan", "info");
				return;
			}
			const list = todoItems.map((item, i) => `${i + 1}. ${item.completed ? "✓" : "○"} ${item.text}`).join("\n");
			ctx.ui.notify(`Plan Progress:\n${list}`, "info");
		},
	});

	pi.registerShortcut(Key.tab, {
		description: "Cycle build/plan/discuss mode",
		handler: async (ctx) => cycleAssistantMode(ctx),
	});

	pi.registerShortcut(Key.ctrlAlt("p"), {
		description: "Cycle build/plan/discuss mode",
		handler: async (ctx) => cycleAssistantMode(ctx),
	});

	// Block destructive bash commands in read-only modes
	pi.on("tool_call", async (event) => {
		if (!isReadOnlyMode() || event.toolName !== "bash") return;

		const command = event.input.command as string;
		if (!isSafeCommand(command)) {
			const modeName = mode === "discuss" ? "Discuss" : "Plan";
			const toggleCommand = mode === "discuss" ? "/discuss" : "/plan";
			return {
				block: true,
				reason: `${modeName} mode: command blocked (not allowlisted). Use ${toggleCommand} to disable ${mode} mode first.\nCommand: ${command}`,
			};
		}
	});

	// Filter out stale mode context when the matching mode is inactive
	pi.on("context", async (event) => {
		function includesInactiveMarker(text: string): boolean {
			return (
				(mode !== "plan" && text.includes("[PLAN MODE ACTIVE]")) ||
				(mode !== "discuss" && text.includes("[DISCUSS MODE ACTIVE]")) ||
				(!executionMode && text.includes("[EXECUTING PLAN"))
			);
		}

		return {
			messages: event.messages.filter((m) => {
				const msg = m as AgentMessage & { customType?: string };
				if (msg.customType === "plan-mode-context" && mode !== "plan") return false;
				if (msg.customType === "discuss-mode-context" && mode !== "discuss") return false;
				if (msg.customType === "plan-execution-context" && !executionMode) return false;
				if (msg.role !== "user") return true;

				const content = msg.content;
				if (typeof content === "string") {
					return !includesInactiveMarker(content);
				}
				if (Array.isArray(content)) {
					return !content.some((c) => c.type === "text" && includesInactiveMarker((c as TextContent).text ?? ""));
				}
				return true;
			}),
		};
	});

	// Inject plan/discuss/execution context before agent starts
	pi.on("before_agent_start", async () => {
		if (mode === "plan") {
			return {
				message: {
					customType: "plan-mode-context",
					content: `[PLAN MODE ACTIVE]
You are in plan mode - a read-only exploration mode for safe code analysis.

Restrictions:
- Built-in edit and write tools are disabled
- Other currently active tools remain available
- Bash is restricted to an allowlist of approved commands

Ask clarifying questions using the questionnaire tool.
Use brave-search skill via bash for web research.

Create a detailed numbered plan under a "Plan:" header:

Plan:
1. First step description
2. Second step description
...

Do NOT attempt to make changes - just describe what you would do.`,
					display: false,
				},
			};
		}

		if (mode === "discuss") {
			return {
				message: {
					customType: "discuss-mode-context",
					content: `[DISCUSS MODE ACTIVE]
You are in discuss mode - a read-only context-building mode for safe code analysis.

Goal:
- Establish shared context that can be used later in this chat
- Surface relevant facts, constraints, decisions, risks, and open questions
- Ask clarifying questions when they would improve the shared context

Restrictions:
- Built-in edit and write tools are disabled
- Other currently active tools remain available
- Bash is restricted to an allowlist of approved commands

Use available read/search/bash tools to inspect and understand the project when helpful.
Ask clarifying questions using the questionnaire tool when useful.
Do not produce a formal implementation plan unless the user explicitly asks for one.
Do NOT attempt to make changes - just discuss, explain, and capture context.`,
					display: false,
				},
			};
		}

		if (executionMode && todoItems.length > 0) {
			const remaining = todoItems.filter((t) => !t.completed);
			const todoList = remaining.map((t) => `${t.step}. ${t.text}`).join("\n");
			return {
				message: {
					customType: "plan-execution-context",
					content: `[EXECUTING PLAN - Full tool access enabled]

Remaining steps:
${todoList}

Execute each step in order.
After completing a step, include a [DONE:n] tag in your response.`,
					display: false,
				},
			};
		}
	});

	// Track progress after each turn
	pi.on("turn_end", async (event, ctx) => {
		if (!executionMode || todoItems.length === 0) return;
		if (!isAssistantMessage(event.message)) return;

		const text = getTextContent(event.message);
		if (markCompletedSteps(text, todoItems) > 0) {
			updateStatus(ctx);
		}
		persistState();
	});

	// Handle plan completion and plan mode UI
	pi.on("agent_end", async (event, ctx) => {
		// Check if execution is complete
		if (executionMode && todoItems.length > 0) {
			if (todoItems.every((t) => t.completed)) {
				const completedList = todoItems.map((t) => `~~${t.text}~~`).join("\n");
				pi.sendMessage(
					{ customType: "plan-complete", content: `**Plan Complete!** ✓\n\n${completedList}`, display: true },
					{ triggerTurn: false },
				);
				executionMode = false;
				todoItems = [];
				updateStatus(ctx);
				persistState(); // Save cleared state so resume doesn't restore old execution mode
			}
			return;
		}

		if (mode !== "plan" || !ctx.hasUI) return;

		// Extract todos from last assistant message
		const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
		if (lastAssistant) {
			const extracted = extractTodoItems(getTextContent(lastAssistant));
			if (extracted.length > 0) {
				todoItems = extracted;
			}
		}

		if (todoItems.length === 0) return;
		persistState();

		// Show plan steps and prompt for next action
		const todoListText = todoItems.map((t, i) => `${i + 1}. ☐ ${t.text}`).join("\n");
		const planTodoListMessage = {
			customType: "plan-todo-list",
			content: `**Plan Steps (${todoItems.length}):**\n\n${todoListText}`,
			display: true,
		};

		const choice = await ctx.ui.select("Plan mode - what next?", [
			"Execute the plan (track progress)",
			"Stay in plan mode",
			"Refine the plan",
		]);

		if (choice?.startsWith("Execute")) {
			const firstTodoItem = todoItems[0];
			if (!firstTodoItem) return;

			mode = "build";
			executionMode = true;
			restoreNormalModeTools();
			updateStatus(ctx);
			persistState();

			const remainingList = todoItems.map((t) => `${t.step}. ${t.text}`).join("\n");
			const execMessage = `Execute the plan.

Remaining steps:
${remainingList}

Start with: ${firstTodoItem.text}
After completing a step, include a [DONE:n] tag in your response.`;
			pi.sendMessage(planTodoListMessage, { deliverAs: "followUp" });
			pi.sendMessage(
				{ customType: "plan-mode-execute", content: execMessage, display: true },
				{ triggerTurn: true, deliverAs: "followUp" },
			);
		} else if (choice === "Refine the plan") {
			const refinement = await ctx.ui.editor("Refine the plan:", "");
			if (refinement?.trim()) {
				pi.sendMessage(planTodoListMessage, { deliverAs: "followUp" });
				pi.sendUserMessage(refinement.trim(), { deliverAs: "followUp" });
			}
		}
	});

	// Restore state on session start/resume
	pi.on("session_start", async (_event, ctx) => {
		if (pi.getFlag("plan") === true) {
			mode = "plan";
		}
		if (pi.getFlag("discuss") === true) {
			mode = "discuss";
		}

		const entries = ctx.sessionManager.getEntries();

		// Restore persisted state
		const planModeEntry = entries
			.filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === "plan-mode")
			.pop() as { data?: PlanModeState } | undefined;

		if (planModeEntry?.data) {
			const restoredMode = normalizeMode(planModeEntry.data.mode) ?? (planModeEntry.data.enabled ? "plan" : "build");
			mode = restoredMode;
			todoItems = planModeEntry.data.todos ?? todoItems;
			executionMode = planModeEntry.data.executing ?? executionMode;
			toolsBeforePlanMode = planModeEntry.data.toolsBeforePlanMode ?? toolsBeforePlanMode;
		}

		if (executionMode) {
			mode = "build";
		}

		// On resume: re-scan messages to rebuild completion state
		// Only scan messages AFTER the last "plan-mode-execute" to avoid picking up [DONE:n] from previous plans
		const isResume = planModeEntry !== undefined;
		if (isResume && executionMode && todoItems.length > 0) {
			// Find the index of the last plan-mode-execute entry (marks when current execution started)
			let executeIndex = -1;
			for (let i = entries.length - 1; i >= 0; i--) {
				const entry = entries[i] as { type: string; customType?: string };
				if (entry.customType === "plan-mode-execute") {
					executeIndex = i;
					break;
				}
			}

			// Only scan messages after the execute marker
			const messages: AssistantMessage[] = [];
			for (let i = executeIndex + 1; i < entries.length; i++) {
				const entry = entries[i];
				if (entry.type === "message" && "message" in entry && isAssistantMessage(entry.message as AgentMessage)) {
					messages.push(entry.message as AssistantMessage);
				}
			}
			const allText = messages.map(getTextContent).join("\n");
			markCompletedSteps(allText, todoItems);
		}

		if (isReadOnlyMode()) {
			enableReadOnlyModeTools();
		} else if (toolsBeforePlanMode !== undefined) {
			restoreNormalModeTools();
		}
		updateStatus(ctx);
	});
}
