/**
 * Inline Footer Extension
 *
 * Replaces the built-in footer so extension statuses (notably plan-mode) render
 * inline with the footer stats instead of on an extra line below the footer.
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { isAbsolute, relative, resolve, sep } from "node:path";

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${Math.round(count / 1000000)}M`;
}

function formatCwd(cwd: string): string {
	const home = process.env.HOME || process.env.USERPROFILE;
	if (!home) return cwd;

	const resolvedCwd = resolve(cwd);
	const resolvedHome = resolve(home);
	const relativeToHome = relative(resolvedHome, resolvedCwd);
	const isInsideHome =
		relativeToHome === "" ||
		(relativeToHome !== ".." && !relativeToHome.startsWith(`..${sep}`) && !isAbsolute(relativeToHome));

	if (!isInsideHome) return cwd;
	return relativeToHome === "" ? "~" : `~${sep}${relativeToHome}`;
}

function sanitizeStatusText(text: string): string {
	return text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}

function stripAnsi(text: string): string {
	return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

function latestThinkingLevel(entries: ReturnType<ExtensionContext["sessionManager"]["getEntries"]>): string | undefined {
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry?.type === "thinking_level_change" && "thinkingLevel" in entry && typeof entry.thinkingLevel === "string") {
			return entry.thinkingLevel;
		}
	}
	return undefined;
}

function modeBadge(status: string | undefined, theme: ExtensionContext["ui"]["theme"]): string {
	const clean = stripAnsi(sanitizeStatusText(status ?? ""));
	const lower = clean.toLowerCase();
	if (lower.includes("/")) {
		const progress = clean.match(/\d+\s*\/\s*\d+/)?.[0] ?? "";
		return theme.fg("accent", `📋 ${progress}`);
	}
	if (lower.includes("plan")) return theme.fg("warning", "📝 PLAN");
	return theme.fg("accent", "🛠️ BUILD");
}

export default function inlineFooterExtension(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsubscribe = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose: unsubscribe,
				invalidate() {},
				render(width: number): string[] {
					const entries = ctx.sessionManager.getEntries();
					let totalInput = 0;
					let totalOutput = 0;
					let totalCacheRead = 0;
					let totalCacheWrite = 0;
					let totalCost = 0;
					let latestCacheHitRate: number | undefined;

					for (const entry of entries) {
						if (entry.type === "message" && entry.message.role === "assistant") {
							const message = entry.message as AssistantMessage;
							totalInput += message.usage.input;
							totalOutput += message.usage.output;
							totalCacheRead += message.usage.cacheRead;
							totalCacheWrite += message.usage.cacheWrite;
							totalCost += message.usage.cost.total;

							const latestPromptTokens = message.usage.input + message.usage.cacheRead + message.usage.cacheWrite;
							latestCacheHitRate =
								latestPromptTokens > 0 ? (message.usage.cacheRead / latestPromptTokens) * 100 : undefined;
						}
					}

					let pwd = formatCwd(ctx.sessionManager.getCwd());
					const branch = footerData.getGitBranch();
					if (branch) pwd = `${pwd} (${branch})`;
					const sessionName = ctx.sessionManager.getSessionName();
					if (sessionName) pwd = `${pwd} • ${sessionName}`;

					const statsParts: string[] = [];
					const planStatus = footerData.getExtensionStatuses().get("plan-mode");
					statsParts.push(modeBadge(planStatus, theme));

					const tokenParts: string[] = [];
					if (totalInput) tokenParts.push(`↑${formatTokens(totalInput)}`);
					if (totalOutput) tokenParts.push(`↓${formatTokens(totalOutput)}`);
					if (totalCacheRead) tokenParts.push(`R${formatTokens(totalCacheRead)}`);
					if (totalCacheWrite) tokenParts.push(`W${formatTokens(totalCacheWrite)}`);
					if ((totalCacheRead > 0 || totalCacheWrite > 0) && latestCacheHitRate !== undefined) {
						tokenParts.push(`CH${latestCacheHitRate.toFixed(1)}%`);
					}
					if (tokenParts.length > 0) statsParts.push(tokenParts.join(" "));
					if (totalCost) statsParts.push(`$${totalCost.toFixed(3)}`);

					const contextUsage = ctx.getContextUsage();
					const contextWindow = contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
					const contextPercentValue = contextUsage?.percent ?? 0;
					const contextPercent = contextUsage?.percent !== null ? contextPercentValue.toFixed(1) : "?";
					const contextDisplay =
						contextPercent === "?"
							? `ctx ?/${formatTokens(contextWindow)}`
							: `ctx ${contextPercent}%/${formatTokens(contextWindow)}`;

					if (contextPercentValue > 90) {
						statsParts.push(theme.fg("error", contextDisplay));
					} else if (contextPercentValue > 70) {
						statsParts.push(theme.fg("warning", contextDisplay));
					} else {
						statsParts.push(contextDisplay);
					}

					let statsLeft = statsParts.join(theme.fg("dim", " · "));
					let statsLeftWidth = visibleWidth(statsLeft);
					if (statsLeftWidth > width) {
						statsLeft = truncateToWidth(statsLeft, width, "...");
						statsLeftWidth = visibleWidth(statsLeft);
					}

					const modelName = ctx.model?.id || "no-model";
					const thinkingLevel = latestThinkingLevel(entries);
					let rightSide = thinkingLevel ? `${modelName} · ${thinkingLevel}` : modelName;
					if (footerData.getAvailableProviderCount() > 1 && ctx.model) {
						rightSide = `(${ctx.model.provider}) ${rightSide}`;
					}

					const rightSideWidth = visibleWidth(rightSide);
					const minPadding = 2;
					let statsLine: string;
					if (statsLeftWidth + minPadding + rightSideWidth <= width) {
						statsLine = statsLeft + " ".repeat(width - statsLeftWidth - rightSideWidth) + rightSide;
					} else {
						const availableForRight = width - statsLeftWidth - minPadding;
						if (availableForRight > 0) {
							const truncatedRight = truncateToWidth(rightSide, availableForRight, "");
							statsLine = statsLeft + " ".repeat(Math.max(0, width - statsLeftWidth - visibleWidth(truncatedRight))) + truncatedRight;
						} else {
							statsLine = statsLeft;
						}
					}

					const dimRemainder = theme.fg("dim", statsLine.slice(statsLeft.length));
					return [
						truncateToWidth(theme.fg("dim", pwd), width, theme.fg("dim", "...")),
						statsLeft + dimRemainder,
					];
				},
			};
		});
	});
}
