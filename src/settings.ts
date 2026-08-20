import {
	App,
	normalizePath,
	PluginSettingTab,
	Setting,
	SettingDefinitionItem,
} from 'obsidian';
import { validatePaperManagerKey } from './ai/billing-client';
import PaperManagerPlugin from './main';

export interface PaperManagerSettings {
	libraryFolder: string;
	aiApiKey: string;
}

export const DEFAULT_SETTINGS: PaperManagerSettings = {
	libraryFolder: 'Papers',
	aiApiKey: '',
};

const BILLING_KEY_DESCRIPTION =
	'Required for Analyze, Reanalyze, and @pp. Email dong_yu_hang@126.com for a free trial key.';

export class PaperManagerSettingTab extends PluginSettingTab {
	plugin: PaperManagerPlugin;
	private creditBalanceEl: HTMLElement | null = null;
	private creditRequestVersion = 0;

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
				desc: BILLING_KEY_DESCRIPTION,
				render: (setting) => {
					this.addBillingKeyControl(setting);
				},
			},
			{
				name: 'Available credits',
				desc: 'Credits remaining for the configured billing key.',
				render: (setting) => {
					this.addCreditBalanceControl(setting);
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
		if (key === 'aiApiKey') {
			void this.refreshCreditBalance();
		}
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

		const billingKeySetting = new Setting(containerEl)
			.setName('Billing key')
			.setDesc(BILLING_KEY_DESCRIPTION);
		this.addBillingKeyControl(billingKeySetting);

		const creditBalanceSetting = new Setting(containerEl)
			.setName('Available credits')
			.setDesc('Credits remaining for the configured billing key.');
		this.addCreditBalanceControl(creditBalanceSetting);
	}

	private addBillingKeyControl(setting: Setting): void {
		setting.addText((text) => {
			text.inputEl.type = 'password';
			text.inputEl.onblur = () => {
				void this.refreshCreditBalance();
			};
			text
				.setPlaceholder('Enter billing key')
				.setValue(this.plugin.settings.aiApiKey)
				.onChange(async (value) => {
					this.plugin.settings.aiApiKey = value.trim();
					await this.plugin.saveSettings();
				});
		});
	}

	private addCreditBalanceControl(setting: Setting): void {
		this.creditBalanceEl = setting.controlEl.createSpan({
			text: this.plugin.settings.aiApiKey ? 'Checking…' : 'Not configured',
		});
		this.creditBalanceEl.setAttribute('aria-live', 'polite');
		setting.addButton((button) => {
			button
				.setButtonText('Refresh')
				.setTooltip('Refresh available credits')
				.onClick(async () => {
					button.setDisabled(true);
					try {
						await this.refreshCreditBalance();
					} finally {
						button.setDisabled(false);
					}
				});
		});
		void this.refreshCreditBalance();
	}

	private async refreshCreditBalance(): Promise<void> {
		const requestVersion = ++this.creditRequestVersion;
		const key = this.plugin.settings.aiApiKey.trim();
		const balanceEl = this.creditBalanceEl;
		if (!balanceEl) {
			return;
		}
		balanceEl.removeAttribute('title');

		if (!key) {
			balanceEl.setText('Not configured');
			return;
		}

		balanceEl.setText('Checking…');
		try {
			const status = await validatePaperManagerKey(key);
			if (requestVersion !== this.creditRequestVersion || !balanceEl.isConnected) {
				return;
			}
			const formattedCredits = new Intl.NumberFormat().format(
				status.remainingCredits,
			);
			balanceEl.setText(
				`${formattedCredits} credit${status.remainingCredits === 1 ? '' : 's'}`,
			);
		} catch (error) {
			if (requestVersion !== this.creditRequestVersion || !balanceEl.isConnected) {
				return;
			}
			const message = error instanceof Error ? error.message : String(error);
			balanceEl.setText(`Unable to load: ${message}`);
			balanceEl.setAttribute('title', message);
		}
	}

	private normalizeLibraryFolder(value: string): string {
		const trimmedValue = value.trim();
		return trimmedValue
			? normalizePath(trimmedValue)
			: DEFAULT_SETTINGS.libraryFolder;
	}
}
