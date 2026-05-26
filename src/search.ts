import {MemoEntry, SearchMode} from "./types";

export function tokeniseSearchQuery(query: string): string[] {
	return query
		.trim()
		.toLowerCase()
		.split(/[ \u3000]+/)
		.filter((token) => token.length > 0);
}

export function entryMatchesSearch(entry: MemoEntry, tokens: string[]): boolean {
	if (tokens.length === 0) {
		return true;
	}

	const searchableText = `${entry.body}\n${entry.tags.join(" ")}`.toLowerCase();
	return tokens.every((token) => searchableText.includes(token));
}

export function filterMemoEntries(
	entries: MemoEntry[],
	query: string,
	includeExpired: boolean,
	filterDate?: string,
): MemoEntry[] {
	const tokens = tokeniseSearchQuery(query);
	return entries.filter((entry) => {
		if (!includeExpired && entry.metadata.expiredTime) {
			return false;
		}

		if (filterDate && entry.date > filterDate) {
			return false;
		}

		return entryMatchesSearch(entry, tokens);
	});
}

export function resolveDisplayEntries(
	allEntries: MemoEntry[],
	matchedEntries: MemoEntry[],
	mode: SearchMode,
	includeExpired: boolean,
): MemoEntry[] {
	if (mode !== "day") {
		return matchedEntries;
	}

	const matchedDates = new Set(matchedEntries.map((entry) => entry.date));
	return allEntries.filter((entry) => {
		if (!includeExpired && entry.metadata.expiredTime) {
			return false;
		}

		return matchedDates.has(entry.date);
	});
}