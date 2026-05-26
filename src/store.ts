import {App, Notice, TFile, normalizePath} from "obsidian";
import {MemoDraft, MemoEntry, MemoMetadata, MemoPluginSettings} from "./types";

const META_PREFIX = "%%memo-meta:";
const META_PATTERN = /^%%memo-meta:\s*e=([^;]+);\s*u=([^;%]+)(?:;\s*x=([^;%]+))?(?:;\s*la=([^;%]+))?(?:;\s*lo=([^;%]+))?%%$/;

export class MemoStore {
	constructor(private readonly app: App, private readonly settings: MemoPluginSettings) {}

	async listEntries(): Promise<MemoEntry[]> {
		const files = this.getCandidateFiles();
		const entries: MemoEntry[] = [];

		for (const file of files) {
			const content = await this.app.vault.read(file);
			if (!this.hasIdentificationTag(file, content)) {
				continue;
			}

			entries.push(...this.parseFile(file, content));
		}

		return entries.sort((leftEntry, rightEntry) => {
			return rightEntry.metadata.updatedTime.localeCompare(leftEntry.metadata.updatedTime);
		});
	}

	async collectTags(): Promise<string[]> {
		const counts = new Map<string, number>();
		const entries = await this.listEntries();

		for (const entry of entries) {
			for (const tag of entry.tags) {
				counts.set(tag, (counts.get(tag) ?? 0) + 1);
			}
		}

		return Array.from(counts.entries())
			.sort((leftEntry, rightEntry) => {
				const countDifference = rightEntry[1] - leftEntry[1];
				return countDifference !== 0 ? countDifference : leftEntry[0].localeCompare(rightEntry[0]);
			})
			.map(([tag]) => tag);
	}

	async createEntry(draft: MemoDraft): Promise<void> {
		const target = splitDateTime(draft.targetDateTime);
		const now = formatDateTime(new Date());
		const metadata: MemoMetadata = {
			expressionTime: draft.expressionTime ?? draft.targetDateTime,
			updatedTime: now,
		};

		if (this.settings.useGeolocation && !draft.expressionTime) {
			try {
				const pos = await getCurrentLocation();
				metadata.latitude = pos.coords.latitude;
				metadata.longitude = pos.coords.longitude;
			} catch (e) {
				console.warn("Failed to get geolocation", e);
			}
		}

		const entryLines = buildEntryLines(draft.body, draft.tags, metadata);
		const file = await this.ensureDailyFile(target.date);
		const content = await this.app.vault.read(file);
		const nextContent = insertEntry(content, target.date, target.time, entryLines);

		await this.app.vault.modify(file, nextContent);
	}

	async reviseEntry(entry: MemoEntry, draft: MemoDraft): Promise<void> {
		await this.expireEntry(entry);
		await this.createEntry({...draft, expressionTime: entry.metadata.expressionTime});
	}

	async expireEntry(entry: MemoEntry): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(entry.filePath);
		if (!(file instanceof TFile)) {
			new Notice("Memo file was not found.");
			return;
		}

		const content = await this.app.vault.read(file);
		const lines = splitLines(content);
		const metaLine = lines[entry.metaLine];
		if (!metaLine || !metaLine.startsWith(META_PREFIX) || metaLine.includes("; x=")) {
			return;
		}

		lines[entry.metaLine] = metaLine.replace(/%%$/, `; x=${formatDateTime(new Date())}%%`);
		await this.app.vault.modify(file, joinLines(lines));
	}

	private getCandidateFiles(): TFile[] {
		const folder = normaliseFolder(this.settings.saveFolder);
		const folderPrefix = folder.length > 0 ? `${folder}/` : "";

		return this.app.vault.getMarkdownFiles().filter((file) => {
			return file.path.startsWith(folderPrefix) && /^\d{4}-\d{2}-\d{2}\.md$/.test(file.name);
		});
	}

	private hasIdentificationTag(file: TFile, content: string): boolean {
		const cache = this.app.metadataCache.getFileCache(file);
		const frontmatterTags = cache?.frontmatter?.tags as string[] | string | undefined;
		const tag = this.settings.identificationTag.replace(/^#/, "");

		if (Array.isArray(frontmatterTags)) {
			return frontmatterTags.includes(tag) || frontmatterTags.includes(`#${tag}`);
		}

		if (typeof frontmatterTags === "string") {
			return frontmatterTags === tag || frontmatterTags === `#${tag}`;
		}

		return content.includes(`tags: [${tag}]`) || content.includes(`tags: #${tag}`);
	}

	private parseFile(file: TFile, content: string): MemoEntry[] {
		const lines = splitLines(content);
		const entries: MemoEntry[] = [];
		let currentDate = file.basename;
		let currentTime = "00:00";
		let blockStart = -1;
		let blockLines: string[] = [];

		for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
			const line = lines[lineIndex] ?? "";
			const dateMatch = line.match(/^##\s+(\d{4}-\d{2}-\d{2})\s*$/);
			const timeMatch = line.match(/^###\s+(\d{2}:\d{2})\s*$/);

			if (dateMatch?.[1]) {
				currentDate = dateMatch[1];
				continue;
			}

			if (timeMatch?.[1]) {
				currentTime = timeMatch[1];
				blockStart = -1;
				blockLines = [];
				continue;
			}

			if (line.startsWith(META_PREFIX)) {
				const metadata = parseMetadata(line);
				if (!metadata) {
					blockStart = -1;
					blockLines = [];
					continue;
				}

				const bodyLines = trimBlankLines(blockLines);
				const body = bodyLines.join("\n");
				const tags = extractTags(body);
				const editableBody = removeTrailingTagOnlyLine(bodyLines).join("\n");
				entries.push({
					id: `${file.path}:${lineIndex}:${metadata.updatedTime}`,
					filePath: file.path,
					date: currentDate,
					time: currentTime,
					body,
					editableBody,
					bodyLines,
					tags,
					metadata,
					startLine: blockStart >= 0 ? blockStart : lineIndex,
					endLine: lineIndex,
					metaLine: lineIndex,
				});

				blockStart = -1;
				blockLines = [];
				continue;
			}

			if (line.trim().length === 0 && blockStart < 0) {
				continue;
			}

			if (blockStart < 0) {
				blockStart = lineIndex;
			}

			blockLines.push(line);
		}

		return entries;
	}

	private async ensureDailyFile(date: string): Promise<TFile> {
		const folder = normaliseFolder(this.settings.saveFolder);
		if (folder.length > 0 && !this.app.vault.getAbstractFileByPath(folder)) {
			await this.app.vault.createFolder(folder);
		}

		const path = normalizePath(`${folder}/${date}.md`);
		const existingFile = this.app.vault.getAbstractFileByPath(path);
		if (existingFile instanceof TFile) {
			return existingFile;
		}

		const tag = this.settings.identificationTag.replace(/^#/, "");
		return this.app.vault.create(path, `---\ntags: [${tag}]\n---\n\n## ${date}\n`);
	}
}

export function formatDateTime(date: Date): string {
	const year = date.getFullYear();
	const month = padTwoDigits(date.getMonth() + 1);
	const day = padTwoDigits(date.getDate());
	const hour = padTwoDigits(date.getHours());
	const minute = padTwoDigits(date.getMinutes());
	return `${year}-${month}-${day} ${hour}:${minute}`;
}

export function formatDateTimeInput(dateTime: string): string {
	return dateTime.replace(" ", "T");
}

export function parseDateTimeInput(value: string): string {
	return value.replace("T", " ").slice(0, 16);
}

function normaliseFolder(folder: string): string {
	return normalizePath(folder.trim()).replace(/^\/+|\/+$/g, "");
}

function splitDateTime(dateTime: string): {date: string; time: string} {
	return {date: dateTime.slice(0, 10), time: dateTime.slice(11, 16)};
}

function buildEntryLines(body: string, tags: string[], metadata: MemoMetadata): string[] {
	const lines = normaliseBodyLines(body).map((line) => {
		return /^\s*[-*]\s+/.test(line) ? line : `- ${line}`;
	});
	const normalisedTags = normaliseTags(tags);

	if (normalisedTags.length > 0) {
		lines.push(`- ${normalisedTags.join(" ")}`);
	}

	lines.push(formatMetadata(metadata));
	return lines;
}

function normaliseBodyLines(body: string): string[] {
	const rawLines = body.replace(/\r\n/g, "\n").split("\n");
	const trimmedLines = trimBlankLines(rawLines);
	const result: string[] = [];
	let previousWasBlank = false;

	for (const rawLine of trimmedLines) {
		const line = rawLine.replace(/\s+$/g, "");
		if (line.trim().length === 0) {
			if (!previousWasBlank) {
				result.push("");
			}
			previousWasBlank = true;
			continue;
		}

		result.push(line);
		previousWasBlank = false;
	}

	return result;
}

function padTwoDigits(value: number): string {
	return value < 10 ? `0${value}` : String(value);
}

function normaliseTags(tags: string[]): string[] {
	return tags
		.map((tag) => tag.trim())
		.filter((tag) => tag.length > 0)
		.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
}

function formatMetadata(metadata: MemoMetadata): string {
	const expiredPart = metadata.expiredTime ? `; x=${metadata.expiredTime}` : "";
	const latPart = metadata.latitude !== undefined ? `; la=${metadata.latitude}` : "";
	const lonPart = metadata.longitude !== undefined ? `; lo=${metadata.longitude}` : "";
	return `${META_PREFIX} e=${metadata.expressionTime}; u=${metadata.updatedTime}${expiredPart}${latPart}${lonPart}%%`;
}

function parseMetadata(line: string): MemoMetadata | null {
	const match = line.match(META_PATTERN);
	if (!match?.[1] || !match[2]) {
		return null;
	}

	return {
		expressionTime: match[1].trim(),
		updatedTime: match[2].trim(),
		expiredTime: match[3]?.trim(),
		latitude: match[4] ? parseFloat(match[4]) : undefined,
		longitude: match[5] ? parseFloat(match[5]) : undefined,
	};
}

async function getCurrentLocation(): Promise<GeolocationPosition> {
	return new Promise((resolve, reject) => {
		if (!navigator.geolocation) {
			reject(new Error("Geolocation is not supported by this browser."));
			return;
		}
		navigator.geolocation.getCurrentPosition(resolve, reject, {
			enableHighAccuracy: true,
			timeout: 5000,
			maximumAge: 0,
		});
	});
}

function insertEntry(content: string, date: string, time: string, entryLines: string[]): string {
	const lines = splitLines(content);
	const insertion = ["", `### ${time}`, "", ...entryLines, ""];
	let dateStart = lines.findIndex((line) => line === `## ${date}`);

	if (dateStart < 0) {
		const needsBlank = lines.length > 0 && (lines[lines.length - 1] ?? "").trim().length > 0;
		const appended = [...lines, ...(needsBlank ? [""] : []), `## ${date}`, ...insertion];
		return joinLines(appended);
	}

	const dateEnd = findNextHeading(lines, dateStart + 1, "## ");
	const exactTimeStart = findTimeHeading(lines, dateStart + 1, dateEnd, time);
	if (exactTimeStart >= 0) {
		const exactTimeEnd = findNextTimeOrDateHeading(lines, exactTimeStart + 1, dateEnd);
		const insertionAtExistingTime = ["", ...entryLines, ""];
		lines.splice(exactTimeEnd, 0, ...insertionAtExistingTime);
		return joinLines(lines);
	}

	for (let lineIndex = dateStart + 1; lineIndex < dateEnd; lineIndex++) {
		const timeMatch = lines[lineIndex]?.match(/^###\s+(\d{2}:\d{2})\s*$/);
		if (timeMatch?.[1] && timeMatch[1] > time) {
			lines.splice(lineIndex, 0, ...insertion);
			return joinLines(lines);
		}
	}

	lines.splice(dateEnd, 0, ...insertion);
	return joinLines(lines);
}

function extractTags(body: string): string[] {
	const matches = body.match(/#[\p{L}\p{N}_/-]+/gu) ?? [];
	return Array.from(new Set(matches));
}

function removeTrailingTagOnlyLine(lines: string[]): string[] {
	const result = [...lines];
	const lastLine = result[result.length - 1];
	if (lastLine && /^\s*[-*]?\s*(#[\p{L}\p{N}_/-]+\s*)+$/u.test(lastLine)) {
		result.pop();
	}

	return result;
}

function trimBlankLines(lines: string[]): string[] {
	let startIndex = 0;
	let endIndex = lines.length;

	while (startIndex < endIndex && (lines[startIndex] ?? "").trim().length === 0) {
		startIndex++;
	}

	while (endIndex > startIndex && (lines[endIndex - 1] ?? "").trim().length === 0) {
		endIndex--;
	}

	return lines.slice(startIndex, endIndex);
}

function splitLines(content: string): string[] {
	return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function joinLines(lines: string[]): string {
	return lines.join("\n").replace(/\n*$/, "\n");
}

function findNextHeading(lines: string[], startIndex: number, prefix: string): number {
	for (let lineIndex = startIndex; lineIndex < lines.length; lineIndex++) {
		if (lines[lineIndex]?.startsWith(prefix)) {
			return lineIndex;
		}
	}

	return lines.length;
}

function findTimeHeading(lines: string[], startIndex: number, endIndex: number, time: string): number {
	for (let lineIndex = startIndex; lineIndex < endIndex; lineIndex++) {
		if (lines[lineIndex] === `### ${time}`) {
			return lineIndex;
		}
	}

	return -1;
}

function findNextTimeOrDateHeading(lines: string[], startIndex: number, endIndex: number): number {
	for (let lineIndex = startIndex; lineIndex < endIndex; lineIndex++) {
		const line = lines[lineIndex] ?? "";
		if (line.startsWith("## ") || line.startsWith("### ")) {
			return lineIndex;
		}
	}

	return endIndex;
}
