import { ItemView, Menu, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import type BlackburnLancashirePlugin from "./main";
import { MemoModal } from "./modal";
import { MemoStore } from "./store";
import { filterMemoEntries, resolveDisplayEntries } from "./search";
import { MemoEntry, SearchMode } from "./types";

export const MEMO_VIEW_TYPE = "blackburn-lancashire-memo-view";

const INITIAL_LIMIT = 100;
const LOAD_MORE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

export class MemoView extends ItemView {
	private readonly store: MemoStore;
	private entries: MemoEntry[] = [];
	private tagCandidates: string[] = [];
	private query = "";
	private filterDate = "";
	private includeExpired = false;
	private displayLimit = INITIAL_LIMIT;
	private expandedDates = new Set<string>();
	private debounceTimer: number | null = null;
	private listEl?: HTMLElement;
	private statusEl?: HTMLElement;

	constructor(leaf: WorkspaceLeaf, private readonly plugin: BlackburnLancashirePlugin) {
		super(leaf);
		this.store = plugin.createStore();
	}

	getViewType(): string {
		return MEMO_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Memos";
	}

	async onOpen(): Promise<void> {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("blackburn-view");

		const rootEl = containerEl.createDiv({ cls: "blackburn-root" });
		this.renderToolbar(rootEl);
		this.statusEl = rootEl.createDiv({ cls: "blackburn-status" });
		this.listEl = rootEl.createDiv({ cls: "blackburn-list" });

		this.listEl.addEventListener("scroll", () => {
			if (!this.listEl) {
				return;
			}

			const distanceFromBottom = this.listEl.scrollHeight - this.listEl.scrollTop - this.listEl.clientHeight;
			if (distanceFromBottom < 80) {
				this.loadMore();
			}
		});

		await this.refresh();
	}

	async onClose(): Promise<void> {
		if (this.debounceTimer !== null) {
			window.clearTimeout(this.debounceTimer);
		}
	}

	async refresh(): Promise<void> {
		this.setStatus("Loading...");
		this.entries = await this.store.listEntries();
		this.tagCandidates = await this.store.collectTags();
		this.displayLimit = INITIAL_LIMIT;
		this.renderList();
	}

	private renderToolbar(rootEl: HTMLElement): void {
		const toolbarEl = rootEl.createDiv({ cls: "blackburn-toolbar" });

		const headerRow = toolbarEl.createDiv({ cls: "blackburn-toolbar-header" });
		const toggleLabel = headerRow.createEl("label", { cls: "blackburn-toggle-search-label" });
		const toggleCheckbox = toggleLabel.createEl("input", { cls: "blackburn-toggle-search-checkbox", type: "checkbox" });
		toggleCheckbox.checked = !this.plugin.settings.searchCollapsed;
		toggleLabel.createSpan({ text: "Search & Filters", cls: "blackburn-toolbar-title" });

		const searchContentEl = toolbarEl.createDiv({ cls: "blackburn-toolbar-content" });
		if (this.plugin.settings.searchCollapsed) {
			searchContentEl.addClass("is-hidden");
		}

		toggleCheckbox.addEventListener("change", () => {
			void (async () => {
				this.plugin.settings.searchCollapsed = !toggleCheckbox.checked;
				await this.plugin.saveSettings();
				searchContentEl.toggleClass("is-hidden", !!this.plugin.settings.searchCollapsed);
			})();
		});

		const searchRow = searchContentEl.createDiv({ cls: "blackburn-toolbar-row" });
		const searchInput = searchRow.createEl("input");
		searchInput.type = "search";
		searchInput.placeholder = "Search keywords...";
		searchInput.addClass("blackburn-search");
		searchInput.value = this.query;
		searchInput.addEventListener("input", () => {
			this.query = searchInput.value;
			this.scheduleSearch();
		});

		const filterRow = searchContentEl.createDiv({ cls: "blackburn-toolbar-row" });
		const dateContainer = filterRow.createDiv({ cls: "blackburn-date-filter-container" });
		dateContainer.createSpan({ text: "Before:", cls: "blackburn-filter-label" });
		const dateInput = dateContainer.createEl("input");
		dateInput.type = "date";
		dateInput.addClass("blackburn-date-filter");
		dateInput.value = this.filterDate;
		dateInput.addEventListener("change", () => {
			this.filterDate = dateInput.value;
			this.displayLimit = INITIAL_LIMIT;
			this.renderList();
		});

		const optionsRow = searchContentEl.createDiv({ cls: "blackburn-toolbar-row" });
		const modeSelect = optionsRow.createEl("select");
		modeSelect.addClass("blackburn-select");
		this.addModeOption(modeSelect, "line", "Line");
		this.addModeOption(modeSelect, "parent", "Parent");
		this.addModeOption(modeSelect, "day", "Day");
		modeSelect.value = this.plugin.settings.searchMode;
		modeSelect.addEventListener("change", () => {
			void (async () => {
				this.plugin.settings.searchMode = modeSelect.value as SearchMode;
				await this.plugin.saveSettings();
				this.displayLimit = INITIAL_LIMIT;
				this.renderList();
			})();
		});

		const expiredLabel = optionsRow.createEl("label", { cls: "blackburn-checkbox" });
		const expiredInput = expiredLabel.createEl("input");
		expiredInput.type = "checkbox";
		expiredInput.checked = this.includeExpired;
		expiredInput.addEventListener("change", () => {
			this.includeExpired = expiredInput.checked;
			this.displayLimit = INITIAL_LIMIT;
			this.renderList();
		});
		expiredLabel.createSpan({ text: "Expired" });

		const actionsRow = toolbarEl.createDiv({ cls: "blackburn-toolbar-row" });
		const refreshButton = actionsRow.createEl("button", { text: "Refresh" });
		refreshButton.addEventListener("click", () => void this.refresh());

		const newButton = actionsRow.createEl("button", { text: "New" });
		newButton.addClass("mod-cta");
		newButton.addEventListener("click", () => this.openNewModal());
	}

	private addModeOption(selectEl: HTMLSelectElement, value: SearchMode, text: string): void {
		const option = selectEl.createEl("option", { text });
		option.value = value;
	}

	private scheduleSearch(): void {
		if (this.debounceTimer !== null) {
			window.clearTimeout(this.debounceTimer);
		}

		this.setStatus("Searching...");
		this.debounceTimer = window.setTimeout(() => {
			this.displayLimit = INITIAL_LIMIT;
			this.renderList();
		}, SEARCH_DEBOUNCE_MS);
	}

	private flushSearch(): void {
		if (this.debounceTimer !== null) {
			window.clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}

		this.displayLimit = INITIAL_LIMIT;
		this.renderList();
	}

	private renderList(): void {
		if (!this.listEl) {
			return;
		}

		this.listEl.empty();
		const matchedEntries = filterMemoEntries(this.entries, this.query, this.includeExpired, this.filterDate);
		const displayEntries = resolveDisplayEntries(this.entries, matchedEntries, this.plugin.settings.searchMode, this.includeExpired);
		const visibleEntries = displayEntries.slice(0, this.displayLimit);
		const expandedRenderedDates = new Set<string>();

		let lastDate = "";
		for (const entry of visibleEntries) {
			if (entry.date !== lastDate) {
				this.renderDateHeader(entry.date);
				lastDate = entry.date;
			}

			this.renderEntry(entry, matchedEntries.some((matchedEntry) => matchedEntry.id === entry.id));
			if (this.plugin.settings.searchMode === "parent" && this.expandedDates.has(entry.date) && !expandedRenderedDates.has(entry.date)) {
				expandedRenderedDates.add(entry.date);
				this.renderExpandedDay(entry.date);
			}
		}

		if (visibleEntries.length === 0) {
			this.listEl.createDiv({ cls: "blackburn-empty", text: "No memos found." });
		}

		const endText = visibleEntries.length < displayEntries.length
			? "Scroll for more."
			: "No more memos.";
		this.listEl.createDiv({ cls: "blackburn-end", text: endText });
		this.setStatus(`${visibleEntries.length} / ${displayEntries.length}`);
	}

	private renderDateHeader(date: string): void {
		if (!this.listEl) {
			return;
		}

		const headerEl = this.listEl.createDiv({ cls: "blackburn-date-header" });
		const labelEl = headerEl.createEl("label", { cls: "blackburn-date-group-label" });

		const checkbox = labelEl.createEl("input", { cls: "blackburn-date-group-checkbox", type: "checkbox" });
		checkbox.checked = this.expandedDates.has(date);
		labelEl.createSpan({ text: date, cls: "blackburn-date-group-text" });

		checkbox.addEventListener("change", () => {
			if (checkbox.checked) {
				this.expandedDates.add(date);
			} else {
				this.expandedDates.delete(date);
			}
			this.renderList();
		});
	}

	private renderEntry(entry: MemoEntry, isMatched: boolean): void {
		if (!this.listEl) {
			return;
		}

		const itemEl = this.listEl.createDiv({ cls: "blackburn-entry" });
		if (entry.metadata.expiredTime) {
			itemEl.addClass("is-expired");
		}

		if (isMatched) {
			itemEl.addClass("is-matched");
		}

		const headerEl = itemEl.createDiv({ cls: "blackburn-entry-header" });
		headerEl.createSpan({ cls: "blackburn-time", text: entry.time });

		headerEl.createSpan({ cls: "blackburn-updated", text: `updated ${entry.metadata.updatedTime}` });
		if (entry.metadata.expiredTime) {
			headerEl.createSpan({ cls: "blackburn-expired", text: `expired ${entry.metadata.expiredTime}` });
		}

		this.renderActionMenu(headerEl, entry);
		itemEl.createEl("pre", { cls: "blackburn-body", text: entry.body });
	}

	private renderExpandedDay(date: string): void {
		if (!this.listEl) {
			return;
		}

		const entries = this.entries
			.filter((entry) => entry.date === date && (this.includeExpired || !entry.metadata.expiredTime))
			.sort((leftEntry, rightEntry) => leftEntry.time.localeCompare(rightEntry.time));

		const dayEl = this.listEl.createDiv({ cls: "blackburn-day-expanded" });
		dayEl.createDiv({ cls: "blackburn-day-title", text: `${date} entries` });
		for (const entry of entries) {
			const rowEl = dayEl.createDiv({ cls: "blackburn-day-entry" });
			rowEl.createSpan({ cls: "blackburn-time", text: entry.time });
			rowEl.createEl("pre", { cls: "blackburn-body", text: entry.body });
		}
	}

	private renderActionMenu(parentEl: HTMLElement, entry: MemoEntry): void {
		const menuButton = parentEl.createEl("button", { cls: "blackburn-menu-button clickable-icon" });
		setIcon(menuButton, "ellipsis-vertical");

		menuButton.addEventListener("click", (event: MouseEvent) => {
			const menu = new Menu();

			menu.addItem((item) =>
				item
					.setTitle("Revise")
					.setIcon("lucide-edit")
					.onClick(() => this.openRevisionModal(entry)),
			);

			menu.addItem((item) =>
				item
					.setTitle("Invalidate")
					.setIcon("lucide-trash-2")
					.onClick(async () => {
						await this.store.expireEntry(entry);
						new Notice("Memo invalidated.");
						await this.refresh();
					}),
			);

			menu.showAtMouseEvent(event);
		});
	}

	private loadMore(): void {
		const nextLimit = this.displayLimit + LOAD_MORE_SIZE;
		if (nextLimit === this.displayLimit) {
			return;
		}

		this.displayLimit = nextLimit;
		this.renderList();
	}

	private openNewModal(): void {
		new MemoModal(this.app, this.store, {
			tagCandidates: this.tagCandidates,
			onSaved: async () => this.refresh(),
		}).open();
	}

	private openRevisionModal(entry: MemoEntry): void {
		new MemoModal(this.app, this.store, {
			entry,
			tagCandidates: this.tagCandidates,
			onSaved: async () => this.refresh(),
		}).open();
	}

	private setStatus(text: string): void {
		this.statusEl?.setText(text);
	}
}