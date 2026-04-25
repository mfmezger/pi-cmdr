import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	CustomEditor,
	type ExtensionAPI,
	getAgentDir,
	type KeybindingsManager,
} from "@mariozechner/pi-coding-agent";
import {
	type EditorTheme,
	matchesKey,
	type TUI,
	truncateToWidth,
} from "@mariozechner/pi-tui";
import { parse as parseYaml } from "yaml";
import { DEFAULT_COMMANDS } from "./config/default-commands.js";
import type {
	CmdrAction,
	CmdrCommand,
	CmdrSettings,
	CmdrSource,
} from "./types.js";

type TriggerMatch = {
	start: number;
	end: number;
	query: string;
	key: string;
};

const MAX_RESULTS = 8;
const DEFAULT_TRIGGER = "$";
const DEFAULT_ENTER_ACTION: CmdrAction = "send";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAction(value: unknown): value is CmdrAction {
	return value === "insert" || value === "send";
}

function readString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: undefined;
}

function readStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter(
			(item): item is string =>
				typeof item === "string" && item.trim().length > 0,
		)
		.map((item) => item.trim());
}

function normalizeTrigger(value: unknown, fallback: string): string {
	const trigger = readString(value);
	if (!trigger || /\s/.test(trigger)) return fallback;
	return trigger;
}

function validateCommand(
	value: unknown,
	source: CmdrSource,
	index: number,
): { command?: CmdrCommand; error?: string } {
	if (!isRecord(value)) {
		return { error: `${source} command #${index + 1} is not an object` };
	}

	const id = readString(value.id);
	const title = readString(value.title);
	const prompt = readString(value.prompt);

	if (!id)
		return {
			error: `${source} command #${index + 1} is missing a non-empty id`,
		};
	if (!title)
		return { error: `${source} command "${id}" is missing a non-empty title` };
	if (!prompt)
		return { error: `${source} command "${id}" is missing a non-empty prompt` };

	const command: CmdrCommand = {
		id,
		title,
		prompt,
		tags: readStringArray(value.tags),
		source,
	};

	const description = readString(value.description);
	if (description) command.description = description;

	const category = readString(value.category);
	if (category) command.category = category;

	if (isAction(value.defaultAction))
		command.defaultAction = value.defaultAction;

	return { command };
}

type LoadedConfig = {
	raw?: Record<string, unknown>;
	commands: CmdrCommand[];
	errors: string[];
};

function getConfigPaths(baseDir: string): string[] {
	return [
		join(baseDir, "cmdr.json"),
		join(baseDir, "cmdr.yaml"),
		join(baseDir, "cmdr.yml"),
		join(baseDir, "extensions", "cmdr.json"),
		join(baseDir, "extensions", "cmdr.yaml"),
		join(baseDir, "extensions", "cmdr.yml"),
	];
}

function parseConfig(path: string): unknown {
	const content = readFileSync(path, "utf8");
	return path.endsWith(".json") ? JSON.parse(content) : parseYaml(content);
}

function loadConfigFile(path: string, source: CmdrSource): LoadedConfig {
	if (!existsSync(path)) return { commands: [], errors: [] };

	let parsed: unknown;
	try {
		parsed = parseConfig(path);
	} catch (error) {
		return {
			commands: [],
			errors: [`Failed to parse ${path}: ${String(error)}`],
		};
	}

	if (!isRecord(parsed)) {
		return { commands: [], errors: [`${path} must contain a config object`] };
	}

	const commandsValue = parsed.commands;
	if (commandsValue !== undefined && !Array.isArray(commandsValue)) {
		return {
			raw: parsed,
			commands: [],
			errors: [`${path}: commands must be an array`],
		};
	}

	const errors: string[] = [];
	const commands = (commandsValue ?? []).flatMap((entry, index) => {
		const result = validateCommand(entry, source, index);
		if (result.error) {
			errors.push(`${path}: ${result.error}`);
			return [];
		}
		return result.command ? [result.command] : [];
	});

	return { raw: parsed, commands, errors };
}

function getConfigValue(configs: LoadedConfig[], key: string): unknown {
	for (let index = configs.length - 1; index >= 0; index--) {
		const raw = configs[index]?.raw;
		if (raw && key in raw) return raw[key];
	}
	return undefined;
}

function loadSettings(cwd: string): CmdrSettings {
	const globalPaths = getConfigPaths(getAgentDir());
	const projectPaths = getConfigPaths(join(cwd, ".pi"));
	const globalConfigs = globalPaths.map((path) =>
		loadConfigFile(path, "global"),
	);
	const projectConfigs = projectPaths.map((path) =>
		loadConfigFile(path, "project"),
	);
	const byId = new Map<string, CmdrCommand>();

	for (const command of DEFAULT_COMMANDS) byId.set(command.id, command);
	for (const config of globalConfigs) {
		for (const command of config.commands) byId.set(command.id, command);
	}
	for (const config of projectConfigs) {
		for (const command of config.commands) byId.set(command.id, command);
	}

	const globalTrigger = getConfigValue(globalConfigs, "trigger");
	const projectTrigger = getConfigValue(projectConfigs, "trigger");
	const trigger = normalizeTrigger(
		projectTrigger,
		normalizeTrigger(globalTrigger, DEFAULT_TRIGGER),
	);

	const globalEnterAction = getConfigValue(globalConfigs, "enterAction");
	const projectEnterAction = getConfigValue(projectConfigs, "enterAction");
	const enterAction = isAction(projectEnterAction)
		? projectEnterAction
		: isAction(globalEnterAction)
			? globalEnterAction
			: DEFAULT_ENTER_ACTION;

	return {
		trigger,
		enterAction,
		commands: [...byId.values()].sort(compareCommands),
		errors: [
			...globalConfigs.flatMap((config) => config.errors),
			...projectConfigs.flatMap((config) => config.errors),
		],
		configPaths: { global: globalPaths, project: projectPaths },
	};
}

function compareCommands(a: CmdrCommand, b: CmdrCommand): number {
	const category = (a.category ?? "").localeCompare(b.category ?? "");
	if (category !== 0) return category;
	return a.title.localeCompare(b.title);
}

function getCursorOffset(text: string, line: number, col: number): number {
	const lines = text.split("\n");
	let offset = col;

	for (let i = 0; i < line; i++) {
		offset += (lines[i]?.length ?? 0) + 1;
	}

	return offset;
}

function findTriggerAtCursor(
	text: string,
	cursorOffset: number,
	trigger: string,
): TriggerMatch | null {
	const lineStart = text.lastIndexOf("\n", Math.max(0, cursorOffset - 1)) + 1;

	for (let start = cursorOffset - trigger.length; start >= lineStart; start--) {
		if (!text.startsWith(trigger, start)) continue;
		if (start > 0 && !/\s/.test(text[start - 1] ?? "")) continue;

		const query = text.slice(start + trigger.length, cursorOffset);
		if (trigger === "$" && /^\d/.test(query)) return null;

		return {
			start,
			end: cursorOffset,
			query,
			key: `${start}:${cursorOffset}:${query}`,
		};
	}

	return null;
}

function normalize(value: string): string {
	return value.trim().toLowerCase();
}

function fuzzyContains(haystack: string, needle: string): boolean {
	let index = 0;
	for (const char of needle) {
		index = haystack.indexOf(char, index);
		if (index === -1) return false;
		index++;
	}
	return true;
}

function wordStartsWith(value: string, query: string): boolean {
	return value.split(/[^a-z0-9]+/i).some((word) => word.startsWith(query));
}

function scoreTerm(command: CmdrCommand, term: string): number {
	const id = normalize(command.id);
	const title = normalize(command.title);
	const category = normalize(command.category ?? "");
	const description = normalize(command.description ?? "");
	const tags = command.tags.map(normalize);
	const prompt = normalize(command.prompt);
	const titled = `${category} ${title}`.trim();
	const everything = [id, titled, description, tags.join(" "), prompt].join(
		" ",
	);

	if (id === term || title === term || titled === term) return 0;
	if (id.startsWith(term) || title.startsWith(term) || titled.startsWith(term))
		return 5;
	if (wordStartsWith(titled, term)) return 8;
	if (tags.some((tag) => tag === term)) return 10;
	if (tags.some((tag) => tag.startsWith(term))) return 12;
	if (title.includes(term) || titled.includes(term)) return 20;
	if (description.includes(term)) return 35;
	if (prompt.includes(term)) return 60;
	if (fuzzyContains(title, term) || fuzzyContains(titled, term)) return 80;
	if (fuzzyContains(everything, term)) return 100;
	return Number.POSITIVE_INFINITY;
}

function scoreCommand(command: CmdrCommand, query: string): number {
	const terms = normalize(query).split(/\s+/).filter(Boolean);
	if (terms.length === 0) return 0;

	let score = 0;
	for (const term of terms) {
		const termScore = scoreTerm(command, term);
		if (!Number.isFinite(termScore)) return Number.POSITIVE_INFINITY;
		score += termScore;
	}
	return score;
}

function filterCommands(commands: CmdrCommand[], query: string): CmdrCommand[] {
	const normalizedQuery = normalize(query);
	if (!normalizedQuery) return [...commands].sort(compareCommands);

	return commands
		.map((command) => ({
			command,
			score: scoreCommand(command, normalizedQuery),
		}))
		.filter((entry) => Number.isFinite(entry.score))
		.sort((a, b) => {
			const scoreDiff = a.score - b.score;
			if (scoreDiff !== 0) return scoreDiff;
			return compareCommands(a.command, b.command);
		})
		.map((entry) => entry.command);
}

function formatTitle(command: CmdrCommand): string {
	return command.category
		? `${command.category}: ${command.title}`
		: command.title;
}

class CmdrEditor extends CustomEditor {
	private readonly editorTheme: EditorTheme;
	private readonly getSettings: () => CmdrSettings;
	private activeTrigger: TriggerMatch | null = null;
	private selectedIndex = 0;
	private visibleMatches: CmdrCommand[] = [];
	private dismissedTriggerKey: string | undefined;

	constructor(
		tui: TUI,
		theme: EditorTheme,
		keybindings: KeybindingsManager,
		getSettings: () => CmdrSettings,
	) {
		super(tui, theme, keybindings);
		this.editorTheme = theme;
		this.getSettings = getSettings;
		this.refreshCommandMenu();
	}

	private refreshCommandMenu(): void {
		const settings = this.getSettings();
		const text = this.getText();
		const cursor = this.getCursor();
		const cursorOffset = getCursorOffset(text, cursor.line, cursor.col);
		const trigger = findTriggerAtCursor(text, cursorOffset, settings.trigger);

		if (!trigger || trigger.key === this.dismissedTriggerKey) {
			this.activeTrigger = null;
			this.visibleMatches = [];
			this.selectedIndex = 0;
			return;
		}

		const matches = filterCommands(settings.commands, trigger.query);
		this.activeTrigger = trigger;
		this.visibleMatches = matches;

		if (matches.length === 0) {
			this.selectedIndex = 0;
		} else if (this.selectedIndex >= matches.length) {
			this.selectedIndex = matches.length - 1;
		}
	}

	private closeCommandMenu(): void {
		this.dismissedTriggerKey = this.activeTrigger?.key;
		this.activeTrigger = null;
		this.visibleMatches = [];
		this.selectedIndex = 0;
	}

	private moveSelection(delta: number): void {
		if (this.visibleMatches.length === 0) return;
		this.selectedIndex =
			(this.selectedIndex + delta + this.visibleMatches.length) %
			this.visibleMatches.length;
	}

	private insertSelectedCommand(action: CmdrAction): void {
		if (!this.activeTrigger) return;

		const selected = this.visibleMatches[this.selectedIndex];
		if (!selected) return;

		const currentText = this.getText();
		const nextText =
			currentText.slice(0, this.activeTrigger.start) +
			selected.prompt +
			currentText.slice(this.activeTrigger.end);
		this.dismissedTriggerKey = undefined;

		if (action === "send") {
			const submittedText = nextText.trim();
			this.setText("");
			this.refreshCommandMenu();
			if (submittedText) this.onSubmit?.(submittedText);
			return;
		}

		this.setText(nextText);
		this.refreshCommandMenu();
	}

	override handleInput(data: string): void {
		if (this.activeTrigger) {
			if (
				matchesKey(data, "up") ||
				matchesKey(data, "ctrl+p") ||
				matchesKey(data, "shift+tab")
			) {
				this.moveSelection(-1);
				return;
			}

			if (matchesKey(data, "down") || matchesKey(data, "ctrl+n")) {
				this.moveSelection(1);
				return;
			}

			if (matchesKey(data, "enter")) {
				if (this.visibleMatches.length > 0) {
					const settings = this.getSettings();
					const selected = this.visibleMatches[this.selectedIndex];
					this.insertSelectedCommand(
						selected?.defaultAction ?? settings.enterAction,
					);
					return;
				}
			}

			if (matchesKey(data, "tab")) {
				if (this.visibleMatches.length > 0) {
					this.insertSelectedCommand("insert");
					return;
				}
			}

			if (matchesKey(data, "alt+enter") || matchesKey(data, "ctrl+enter")) {
				if (this.visibleMatches.length > 0) {
					this.insertSelectedCommand("send");
					return;
				}
			}

			if (matchesKey(data, "escape")) {
				this.closeCommandMenu();
				return;
			}
		}

		super.handleInput(data);
		this.dismissedTriggerKey = undefined;
		this.refreshCommandMenu();
	}

	override render(width: number): string[] {
		const lines = super.render(width);
		if (!this.activeTrigger) return lines;

		const settings = this.getSettings();
		const countText =
			this.visibleMatches.length === 1
				? "1 command"
				: `${this.visibleMatches.length} commands`;
		lines.push(
			this.editorTheme.borderColor(
				` ${settings.trigger} command search · ${countText} `,
			),
		);

		if (this.visibleMatches.length === 0) {
			lines.push(this.editorTheme.selectList.noMatch("  no matching commands"));
			lines.push(this.editorTheme.selectList.scrollInfo("  esc close"));
			return lines.map((line) => truncateToWidth(line, width));
		}

		const firstVisibleIndex = Math.max(
			0,
			Math.min(
				this.selectedIndex - MAX_RESULTS + 1,
				this.visibleMatches.length - MAX_RESULTS,
			),
		);
		const visible = this.visibleMatches.slice(
			firstVisibleIndex,
			firstVisibleIndex + MAX_RESULTS,
		);

		for (let offset = 0; offset < visible.length; offset++) {
			const command = visible[offset];
			if (!command) continue;

			const actualIndex = firstVisibleIndex + offset;
			const isSelected = actualIndex === this.selectedIndex;
			const prefix = isSelected
				? this.editorTheme.selectList.selectedPrefix("› ")
				: "  ";
			const labelText = formatTitle(command);
			const label = isSelected
				? this.editorTheme.selectList.selectedText(labelText)
				: labelText;

			let line = prefix + label;
			if (command.description) {
				line +=
					" " +
					this.editorTheme.selectList.description(`— ${command.description}`);
			}
			line += ` ${this.editorTheme.selectList.scrollInfo(`[${command.source}]`)}`;

			lines.push(truncateToWidth(line, width));
		}

		if (this.visibleMatches.length > MAX_RESULTS) {
			lines.push(
				truncateToWidth(
					this.editorTheme.selectList.scrollInfo(
						`  showing ${firstVisibleIndex + 1}-${firstVisibleIndex + visible.length} of ${this.visibleMatches.length} matches`,
					),
					width,
				),
			);
		}

		const enterVerb = settings.enterAction === "send" ? "send" : "insert";
		lines.push(
			truncateToWidth(
				this.editorTheme.selectList.scrollInfo(
					`  ↑↓ navigate • enter ${enterVerb} • tab insert • alt+enter send • esc close`,
				),
				width,
			),
		);

		return lines.map((line) => truncateToWidth(line, width));
	}
}

export default function cmdrExtension(pi: ExtensionAPI): void {
	let settings: CmdrSettings | undefined;

	const getSettings = (): CmdrSettings => {
		if (!settings) settings = loadSettings(process.cwd());
		return settings;
	};

	pi.on("session_start", (_event, ctx) => {
		settings = loadSettings(ctx.cwd);
		if (!ctx.hasUI) return;

		ctx.ui.setEditorComponent(
			(tui, theme, keybindings) =>
				new CmdrEditor(tui, theme, keybindings, getSettings),
		);

		if (settings.errors.length > 0) {
			ctx.ui.notify(
				`pi-cmdr loaded with ${settings.errors.length} config warning(s).`,
				"warning",
			);
			return;
		}

		ctx.ui.notify(
			`pi-cmdr loaded: type ${settings.trigger} to open the command picker`,
			"info",
		);
	});

	pi.registerCommand("cmdr", {
		description: "Show pi-cmdr configuration status",
		handler: async (_args, ctx) => {
			settings = loadSettings(ctx.cwd);
			const lines = [
				`pi-cmdr: ${settings.commands.length} commands loaded`,
				`trigger: ${settings.trigger}`,
				`enterAction: ${settings.enterAction}`,
				"global config paths:",
				...settings.configPaths.global.map((path) => `- ${path}`),
				"project config paths:",
				...settings.configPaths.project.map((path) => `- ${path}`),
			];

			if (settings.errors.length > 0) {
				lines.push(
					"",
					"warnings:",
					...settings.errors.map((error) => `- ${error}`),
				);
			}

			ctx.ui.setEditorText(lines.join("\n"));
		},
	});
}
