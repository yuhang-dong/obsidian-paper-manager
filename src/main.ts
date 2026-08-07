import { Plugin, WorkspaceLeaf } from 'obsidian';
import {
	PaperLibraryView,
	PAPER_LIBRARY_VIEW_TYPE,
} from './library-view';
import {
	DEFAULT_SETTINGS,
	PaperManagerSettings,
	PaperManagerSettingTab,
} from './settings';

export default class PaperManagerPlugin extends Plugin {
	settings!: PaperManagerSettings;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(
			PAPER_LIBRARY_VIEW_TYPE,
			(leaf) => new PaperLibraryView(leaf),
		);

		this.addRibbonIcon('library', 'Open paper library', () => {
			void this.activateLibraryView();
		});

		this.addCommand({
			id: 'open-paper-library',
			name: 'Open paper library',
			callback: () => {
				void this.activateLibraryView();
			},
		});

		this.addSettingTab(new PaperManagerSettingTab(this.app, this));
	}

	async activateLibraryView(): Promise<void> {
		const existingLeaf = this.app.workspace
			.getLeavesOfType(PAPER_LIBRARY_VIEW_TYPE)
			.first();

		if (existingLeaf) {
			await this.app.workspace.revealLeaf(existingLeaf);
			return;
		}

		const leaf: WorkspaceLeaf = this.app.workspace.getLeaf('tab');
		await leaf.setViewState({
			type: PAPER_LIBRARY_VIEW_TYPE,
			active: true,
		});
		await this.app.workspace.revealLeaf(leaf);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<PaperManagerSettings>,
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
