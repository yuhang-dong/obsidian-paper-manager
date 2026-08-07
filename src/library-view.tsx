import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ItemView, WorkspaceLeaf } from 'obsidian';
import { PaperLibraryPage } from '@/components/paper-library-page';
import { PaperLibraryRepository } from '@/papers/paper-library-repository';
import { confirmPaperDeletion } from '@/papers/confirm-paper-deletion';
import type PaperManagerPlugin from '@/main';

export const PAPER_LIBRARY_VIEW_TYPE = 'paper-manager-library';

export class PaperLibraryView extends ItemView {
	private reactRoot: Root | null = null;
	private readonly repository: PaperLibraryRepository;
	private readonly getBillingKey: () => string;
	private readonly plugin: PaperManagerPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: PaperManagerPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.repository = new PaperLibraryRepository(
			this.app,
			() => plugin.settings.libraryFolder,
		);
		this.getBillingKey = () => plugin.settings.aiApiKey;
	}

	getViewType(): string {
		return PAPER_LIBRARY_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Paper library';
	}

	getIcon(): string {
		return 'library';
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		const reactContainer = this.contentEl.createDiv({
			cls: 'paper-manager-root',
		});

		this.reactRoot = createRoot(reactContainer);
		this.reactRoot.render(
			<StrictMode>
				<PaperLibraryPage
					repository={this.repository}
					getBillingKey={this.getBillingKey}
					confirmDeletePaper={(paper) =>
						confirmPaperDeletion(this.app, paper)
					}
					initialTableSettings={this.plugin.settings.libraryTable}
					saveTableSettings={(settings) => {
						this.plugin.settings.libraryTable = settings;
						return this.plugin.saveSettings();
					}}
				/>
			</StrictMode>,
		);
	}

	async onClose(): Promise<void> {
		this.reactRoot?.unmount();
		this.reactRoot = null;
		this.contentEl.empty();
	}
}
