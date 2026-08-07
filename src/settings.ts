import {
	App,
	normalizePath,
	PluginSettingTab,
	Setting,
	SettingDefinitionItem,
} from 'obsidian';
import type { ObsidianPropertyType } from './papers/paper-property-schema';
import PaperManagerPlugin from './main';

export interface LibraryCustomColumn {
	property: string;
	type: ObsidianPropertyType;
}

export interface LibraryTableSettings {
	/** Column ids hidden by the user. Absent means visible. */
	visibility: Record<string, boolean>;
	/** User-added columns; the column id is the frontmatter key. */
	customColumns: LibraryCustomColumn[];
}

export const DEFAULT_LIBRARY_TABLE_SETTINGS: LibraryTableSettings = {
	visibility: {},
	customColumns: [],
};

export interface PaperManagerSettings {
	libraryFolder: string;
	aiApiKey: string;
	libraryTable: LibraryTableSettings;
}

export const DEFAULT_SETTINGS: PaperManagerSettings = {
	libraryFolder: 'Papers',
	aiApiKey: '',
	libraryTable: DEFAULT_LIBRARY_TABLE_SETTINGS,
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
				desc: 'Billing key for this plugin (for example, paper_manager_xxx). Stored in the Obsidian plugin settings file and not encrypted.',
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
				'Billing key for this plugin (for example, paper_manager_xxx). Stored in the Obsidian plugin settings file and not encrypted.',
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
