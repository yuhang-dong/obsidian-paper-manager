import {
	FileView,
	ItemView,
	Notice,
	Plugin,
	TFile,
	WorkspaceLeaf,
} from 'obsidian';
import {
	PaperLibraryView,
	PAPER_LIBRARY_VIEW_TYPE,
} from './library-view';
import {
	PaperReaderView,
	PAPER_READER_VIEW_TYPE,
} from './paper-reader-view';
import {
	DEFAULT_SETTINGS,
	PaperManagerSettings,
	PaperManagerSettingTab,
} from './settings';
import { PaperReaderStorage } from './papers/paper-reader-storage';
import { addInlinePdfEditButtons } from './inline-pdf-edit';
import { createLivePreviewPdfEditExtension } from './live-preview-pdf-edit';

export default class PaperManagerPlugin extends Plugin {
	settings!: PaperManagerSettings;
	private readonly enhancedPdfViews = new WeakSet<ItemView>();
	private readonly pdfViewActions = new Set<HTMLElement>();

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(
			PAPER_LIBRARY_VIEW_TYPE,
			(leaf) => new PaperLibraryView(leaf, this),
		);
		this.registerView(
			PAPER_READER_VIEW_TYPE,
			(leaf) => new PaperReaderView(leaf),
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
		this.registerMarkdownPostProcessor((element, context) => {
			addInlinePdfEditButtons(
				this.app,
				element,
				context,
				(file) => {
					void this.openPaperReader(file).catch((error: unknown) => {
						new Notice(`无法打开 Paper Manager：${errorMessage(error)}`);
					});
				},
			);
		});
		this.registerEditorExtension(
			createLivePreviewPdfEditExtension(this.app, (file) => {
				void this.openPaperReader(file).catch((error: unknown) => {
					new Notice(`无法打开 Paper Manager：${errorMessage(error)}`);
				});
			}),
		);

		this.app.workspace.onLayoutReady(() => {
			this.attachActionsToPdfViews();
		});
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', (leaf) => {
				if (leaf) {
					this.attachPaperReaderAction(leaf);
				}
			}),
		);
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.attachActionsToPdfViews();
			}),
		);
		this.register(() => {
			for (const action of this.pdfViewActions) {
				action.remove();
			}
			this.pdfViewActions.clear();
		});
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

	async openPaperReader(file: TFile): Promise<void> {
		const storage = new PaperReaderStorage(this.app, file.path);
		const sourceFile = this.app.vault.getAbstractFileByPath(
			storage.sourcePdfPath,
		);
		const editorFile =
			storage.isManagedPaper() && sourceFile instanceof TFile ? sourceFile : file;
		const leaf = this.app.workspace.getLeaf('tab');
		await leaf.setViewState({
			type: PAPER_READER_VIEW_TYPE,
			active: true,
			state: {
				pdfPath: editorFile.path,
			},
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

	private attachActionsToPdfViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType('pdf')) {
			this.attachPaperReaderAction(leaf);
		}
	}

	private attachPaperReaderAction(leaf: WorkspaceLeaf): void {
		const view = leaf.view;
		if (
			view.getViewType() !== 'pdf' ||
			!(view instanceof ItemView) ||
			this.enhancedPdfViews.has(view)
		) {
			return;
		}

		this.enhancedPdfViews.add(view);
		const action = view.addAction(
			'highlighter',
			'Edit in Paper Manager',
			() => {
				const file = (view as FileView).file;
				if (file) {
					void this.openPaperReader(file).catch((error: unknown) => {
						new Notice(`无法打开 Paper Manager：${errorMessage(error)}`);
					});
				}
			},
		);
		action.addClass('paper-manager-edit-pdf-action');
		this.pdfViewActions.add(action);
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
