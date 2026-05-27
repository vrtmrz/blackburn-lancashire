import {App, PluginSettingTab, Setting} from "obsidian";
import type BlackburnLancashirePlugin from "./main";
import {MemoPluginSettings} from "./types";

export const DEFAULT_SETTINGS: MemoPluginSettings = {
	saveFolder: "daily",
	identificationTag: "daily-log",
	searchMode: "line",
	searchCollapsed: false,
	useGeolocation: false,
};

export class MemoSettingTab extends PluginSettingTab {
	plugin: BlackburnLancashirePlugin;

	constructor(app: App, plugin: BlackburnLancashirePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Save folder")
			.setDesc("Folder used for daily memo files.")
			.addText(text => text
				// This is a placeholder, and indicates the tag. hence, it should not be sentence case.
				// eslint-disable-next-line obsidianmd/ui/sentence-case
				.setPlaceholder("daily")
				.setValue(this.plugin.settings.saveFolder)
				.onChange(async (value) => {
					this.plugin.settings.saveFolder = value.trim() || DEFAULT_SETTINGS.saveFolder;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Identification tag")
			.setDesc("Frontmatter tag used to recognise memo files.")
			.addText(text => text
				// This is a placeholder, and indicates the tag. hence, it should not be sentence case.
				// eslint-disable-next-line obsidianmd/ui/sentence-case
				.setPlaceholder("daily-log")
				.setValue(this.plugin.settings.identificationTag)
				.onChange(async (value) => {
					this.plugin.settings.identificationTag = value.trim().replace(/^#/, "") || DEFAULT_SETTINGS.identificationTag;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Enable geolocation")
			.setDesc("Capture latitude and longitude when saving a memo.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.useGeolocation).onChange(async (value) => {
					this.plugin.settings.useGeolocation = value;
					await this.plugin.saveSettings();
				}),
			);
	}
}
