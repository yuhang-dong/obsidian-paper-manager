import {
	App,
	normalizePath,
	PluginSettingTab,
	Setting,
	SettingDefinitionItem,
} from 'obsidian';
import PaperManagerPlugin from './main';

export interface PaperManagerSettings {
	libraryFolder: string;
}

export const DEFAULT_SETTINGS: PaperManagerSettings = {
	libraryFolder: 'Papers',
};

export class PaperManagerSettingTab extends PluginSettingTab {
	plugin: PaperManagerPlugin;

	constructor(app: App, plugin: PaperManagerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: 'Paper library folder',
				desc: 'Vault-relative folder where imported PDF files will be stored.',
				control: {
					type: 'folder',
					key: 'libraryFolder',
					defaultValue: DEFAULT_SETTINGS.libraryFolder,
					placeholder: DEFAULT_SETTINGS.libraryFolder,
				},
			},
		];
	}

	getControlValue(key: string): unknown {
		if (key === 'libraryFolder') {
			return this.plugin.settings.libraryFolder;
		}

		return undefined;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key !== 'libraryFolder' || typeof value !== 'string') {
			return;
		}

		this.plugin.settings.libraryFolder = this.normalizeLibraryFolder(value);
		await this.plugin.saveSettings();
	}

	// Fallback for Obsidian versions older than 1.13.0.
	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Paper library folder')
			.setDesc('Vault-relative folder where imported PDF files will be stored.')
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.libraryFolder)
					.setValue(this.plugin.settings.libraryFolder)
					.onChange(async (value) => {
						this.plugin.settings.libraryFolder =
							this.normalizeLibraryFolder(value);
						await this.plugin.saveSettings();
					}),
			);
	}

	private normalizeLibraryFolder(value: string): string {
		const trimmedValue = value.trim();
		return trimmedValue
			? normalizePath(trimmedValue)
			: DEFAULT_SETTINGS.libraryFolder;
	}
}
