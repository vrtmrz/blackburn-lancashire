import { App, Modal, Notice, Setting } from "obsidian";
import { MemoEntry } from "./types";
import { formatDateTime, formatDateTimeInput, parseDateTimeInput, MemoStore } from "./store";

export interface MemoModalOptions {
	entry?: MemoEntry;
	initialTags?: string[];
	tagCandidates: string[];
	onSaved: () => Promise<void>;
}

export class MemoModal extends Modal {
	constructor(
		app: App,
		private readonly store: MemoStore,
		private readonly options: MemoModalOptions,
	) {
		super(app);
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
		const tagInput = wrapper.createEl("input");
		tagInput.type = "text";
		tagInput.addClass("blackburn-input");
		tagInput.placeholder = "#memo #idea";
		tagInput.value = this.options.entry?.tags.join(" ") ?? this.options.initialTags?.join(" ") ?? "";
		const datalistId = "blackburn-tag-candidates";
		tagInput.setAttr("list", datalistId);
		const datalist = wrapper.createEl("datalist");
		datalist.id = datalistId;
		for (const tagCandidate of this.options.tagCandidates) {
			datalist.createEl("option", { value: tagCandidate });
		}

		const handleSaveAndClose = async () => {
			const body = bodyInput.value.trim();
			if (body.length === 0) {
				new Notice("Memo body is empty.");
				return;
			}

			const targetDateTime = parseDateTimeInput(datetimeInput.value);
			const tags = parseTags(tagInput.value);
			if (this.options.entry) {
				await this.store.reviseEntry(this.options.entry, { body, tags, targetDateTime });
			} else {
				await this.store.createEntry({ body, tags, targetDateTime });
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
			const tags = parseTags(tagInput.value);
			if (this.options.entry) {
				await this.store.reviseEntry(this.options.entry, { body, tags, targetDateTime });
				await this.options.onSaved();
				this.close();
				return;
			}

			await this.store.createEntry({ body, tags, targetDateTime });
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

function parseTags(value: string): string[] {
	return value
		.split(/[ \u3000,]+/)
		.map((tag) => tag.trim())
		.filter((tag) => tag.length > 0);
}