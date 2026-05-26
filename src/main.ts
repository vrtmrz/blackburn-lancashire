import {Notice, Plugin, WorkspaceLeaf} from "obsidian";
import {MemoModal} from "./modal";
import {DEFAULT_SETTINGS, MemoSettingTab} from "./settings";
import {MemoStore} from "./store";
import {MemoPluginSettings} from "./types";
import {MEMO_VIEW_TYPE, MemoView} from "./view";

export default class BlackburnLancashirePlugin extends Plugin {
	settings: MemoPluginSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(MEMO_VIEW_TYPE, (leaf: WorkspaceLeaf) => new MemoView(leaf, this));

		this.addRibbonIcon("notebook-pen", "Open memos", () => {
			void this.activateMemoView();
		});

		this.addCommand({
			id: "open-memo-list",
			name: "Open memo list",
			callback: () => {
				void this.activateMemoView();
			},
		});

		this.addCommand({
			id: "new-memo",
			name: "New memo",
			callback: () => {
				void this.openNewMemoModal();
			},
		});

		this.addSettingTab(new MemoSettingTab(this.app, this));
	}

	onunload(): void {}

	createStore(): MemoStore {
		return new MemoStore(this.app, this.settings);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<MemoPluginSettings>);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private async activateMemoView(): Promise<void> {
		const existingLeaves = this.app.workspace.getLeavesOfType(MEMO_VIEW_TYPE);
		const existingLeaf = existingLeaves[0];
		if (existingLeaf) {
			await this.app.workspace.revealLeaf(existingLeaf);
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) {
			new Notice("Could not open memo list.");
			return;
		}

		await leaf.setViewState({type: MEMO_VIEW_TYPE, active: true});
		await this.app.workspace.revealLeaf(leaf);
	}

	private async openNewMemoModal(): Promise<void> {
		const store = this.createStore();
		const tagCandidates = await store.collectTags();
		new MemoModal(this.app, store, {
			tagCandidates,
			onSaved: async () => {
				for (const leaf of this.app.workspace.getLeavesOfType(MEMO_VIEW_TYPE)) {
					if (leaf.view instanceof MemoView) {
						await leaf.view.refresh();
					}
				}
			},
		}).open();
	}
}
