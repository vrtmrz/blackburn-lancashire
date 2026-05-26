export type SearchMode = "line" | "parent" | "day";

export interface MemoPluginSettings {
	saveFolder: string;
	identificationTag: string;
	searchMode: SearchMode;
	searchCollapsed: boolean;
	useGeolocation: boolean;
}

export interface MemoMetadata {
	expressionTime: string;
	updatedTime: string;
	expiredTime?: string;
	latitude?: number;
	longitude?: number;
}

export interface MemoEntry {
	id: string;
	filePath: string;
	date: string;
	time: string;
	body: string;
	editableBody: string;
	bodyLines: string[];
	tags: string[];
	metadata: MemoMetadata;
	startLine: number;
	endLine: number;
	metaLine: number;
}

export interface MemoDraft {
	body: string;
	tags: string[];
	targetDateTime: string;
	expressionTime?: string;
}