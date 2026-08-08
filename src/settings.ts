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
	aiApiKey: string;
}

export const DEFAULT_SETTINGS: PaperManagerSettings = {
	libraryFolder: 'Papers',
	aiApiKey: '',
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
			{
				name: 'Billing key',
				desc: 'Billing key for this plugin (for example, paper_manager_xxx). Analyze and @pp send the source PDF and your prompt to editable.artifact-kit.com for AI processing. The key is stored in the Obsidian plugin settings file and is not encrypted.',
				render: (setting) => {
					setting.addText((text) => {
						text.inputEl.type = 'password';
						text
							.setPlaceholder('Billing key')
							.setValue(this.plugin.settings.aiApiKey)
							.onChange(async (value) => {
								this.plugin.settings.aiApiKey = value.trim();
								await this.plugin.saveSettings();
							});
					});
				},
			},
		];
	}

	getControlValue(key: string): unknown {
		if (key === 'libraryFolder') {
			return this.plugin.settings.libraryFolder;
		}
		if (key === 'aiApiKey') {
			return this.plugin.settings.aiApiKey;
		}

		return undefined;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (typeof value !== 'string') {
			return;
		}

		if (key === 'libraryFolder') {
			this.plugin.settings.libraryFolder = this.normalizeLibraryFolder(value);
		} else if (key === 'aiApiKey') {
			this.plugin.settings.aiApiKey = value.trim();
		} else {
			return;
		}
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

		new Setting(containerEl)
			.setName('Billing key')
			.setDesc(
				'Billing key for this plugin (for example, paper_manager_xxx). Analyze and @pp send the source PDF and your prompt to editable.artifact-kit.com for AI processing. The key is stored in the Obsidian plugin settings file and is not encrypted.',
			)
			.addText((text) => {
				text.inputEl.type = 'password';
				text
					.setPlaceholder('Billing key')
					.setValue(this.plugin.settings.aiApiKey)
					.onChange(async (value) => {
						this.plugin.settings.aiApiKey = value.trim();
						await this.plugin.saveSettings();
					});
			});
	}

	private normalizeLibraryFolder(value: string): string {
		const trimmedValue = value.trim();
		return trimmedValue
			? normalizePath(trimmedValue)
			: DEFAULT_SETTINGS.libraryFolder;
	}
}
