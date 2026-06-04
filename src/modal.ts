import { App, Modal, Notice, Setting } from "obsidian";
import { MemoEntry } from "./types";
import { formatDateTime, formatDateTimeInput, parseDateTimeInput, MemoStore } from "./store";
import { PopoverSelectString } from "./dialogs";

export interface MemoModalOptions {
	entry?: MemoEntry;
	initialTags?: string[];
	tagCandidates: string[];
	onSaved: () => Promise<void>;
}

export class MemoModal extends Modal {
	private selectedTags: string[] = [];

	constructor(
		app: App,
		private readonly store: MemoStore,
		private readonly options: MemoModalOptions,
	) {
		super(app);
		this.selectedTags = [
			...(this.options.entry?.tags ?? this.options.initialTags ?? [])
		];
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		const wrapper = contentEl.createDiv();
		wrapper.addClass("blackburn-modal");

		const isRevision = Boolean(this.options.entry);
		wrapper.createEl("h2", { text: isRevision ? "Revise memo" : "New memo" });

		const datetimeInput = wrapper.createEl("input");
		datetimeInput.type = "datetime-local";
		datetimeInput.addClass("blackburn-input");
		datetimeInput.value = formatDateTimeInput(this.options.entry?.metadata.expressionTime ?? formatDateTime(new Date()));

		const bodyLabel = wrapper.createEl("label", { text: "Body" });
		bodyLabel.addClass("blackburn-label");
		const bodyInput = wrapper.createEl("textarea");
		bodyInput.addClass("blackburn-textarea");
		bodyInput.value = this.options.entry?.editableBody ?? "";

		// Set focus to the body input field automatically.
		window.setTimeout(() => bodyInput.focus(), 0);

		const tagLabel = wrapper.createEl("label", { text: "Tags" });
		tagLabel.addClass("blackburn-label");
		const tagContainer = wrapper.createDiv({ cls: "blackburn-tag-container" });

		const renderTags = () => {
			tagContainer.empty();

			for (let i = 0; i < this.selectedTags.length; i++) {
				const tag = this.selectedTags[i];
				if (!tag) continue;
				const badge = tagContainer.createEl("a", { cls: "tag" });
				badge.createSpan({ text: tag });
				const removeBtn = badge.createSpan({ cls: "blackburn-tag-badge-remove", text: "×" });
				removeBtn.addEventListener("click", (e) => {
					e.preventDefault();
					e.stopPropagation();
					this.selectedTags.splice(i, 1);
					renderTags();
				});
			}

			const addBtn = tagContainer.createEl("button", {
				cls: "blackburn-add-tag-button",
				text: "+ Add tag",
			});
			addBtn.type = "button";
			addBtn.addEventListener("click", () => {
				const popover = new PopoverSelectString(
					this.app,
					"Select or type a tag to add",
					"",
					() => this.options.tagCandidates.filter((candidate) => {
						const parts = candidate.split(/[ \u3000,]+/);
						return !parts.every((part) => this.selectedTags.includes(part));
					}),
					(result) => {
						if (result) {
							const parsed = result
								.split(/[ \u3000,]+/)
								.map((t) => t.trim())
								.filter((t) => t.length > 0)
								.map((t) => (t.startsWith("#") ? t : `#${t}`));

							let updated = false;
							for (const tag of parsed) {
								if (!this.selectedTags.includes(tag)) {
									this.selectedTags.push(tag);
									updated = true;
								}
							}
							if (updated) {
								renderTags();
							}
						}
					}
				);
				popover.open();
			});
		};

		renderTags();

		const calloutDiv = wrapper.createDiv({ cls: "blackburn-callout" });
		const calloutLabel = calloutDiv.createEl("label", { cls: "blackburn-checkbox" });
		const calloutCheckbox = calloutLabel.createEl("input", { type: "checkbox" });
		calloutCheckbox.checked = this.options.entry?.isCallout ?? false;
		calloutLabel.createSpan({ text: "Add as callout" });

		const handleSaveAndClose = async () => {
			const body = bodyInput.value.trim();
			if (body.length === 0) {
				new Notice("Memo body is empty.");
				return;
			}

			const targetDateTime = parseDateTimeInput(datetimeInput.value);
			const tags = [...this.selectedTags];
			if (this.options.entry) {
				await this.store.reviseEntry(this.options.entry, { body, tags, targetDateTime, asCallout: calloutCheckbox.checked });
			} else {
				await this.store.createEntry({ body, tags, targetDateTime, asCallout: calloutCheckbox.checked });
			}

			await this.options.onSaved();
			new Notice("Memo saved.");
			this.close();
		};

		const handleSaveAndContinue = async () => {
			const body = bodyInput.value.trim();
			if (body.length === 0) {
				new Notice("Memo body is empty.");
				return;
			}

			const targetDateTime = parseDateTimeInput(datetimeInput.value);
			const tags = [...this.selectedTags];
			if (this.options.entry) {
				await this.store.reviseEntry(this.options.entry, { body, tags, targetDateTime, asCallout: calloutCheckbox.checked });
				await this.options.onSaved();
				this.close();
				return;
			}

			await this.store.createEntry({ body, tags, targetDateTime, asCallout: calloutCheckbox.checked });
			bodyInput.value = "";
			await this.options.onSaved();
			new Notice("Memo saved.");
		};

		bodyInput.addEventListener("keydown", (event: KeyboardEvent) => {
			if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
				event.preventDefault();
				if (event.shiftKey) {
					void handleSaveAndContinue();
				} else {
					void handleSaveAndClose();
				}
			}
		});

		const buttons = new Setting(wrapper).addButton((button) => button
			.setButtonText("Close")
			.onClick(() => this.close())
			.setClass("blackburn-lefty-button")
		)
			.addButton((button) => button
				.setButtonText("Save")
				.onClick(() => handleSaveAndContinue()))
			.addButton((button) => button
				.setButtonText("Save and close")
				.setCta()
				.onClick(() => handleSaveAndClose()))
		buttons.infoEl.setCssProps({ "display": "none" });
		// buttons.settingEl.setCssProps({ "flex-wrap": "wrap" });
		buttons.controlEl.setCssProps({ "flex-wrap": "wrap" });

	}

	onClose(): void {
		this.contentEl.empty();
	}
}