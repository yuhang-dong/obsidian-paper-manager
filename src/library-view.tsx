import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ItemView, WorkspaceLeaf } from 'obsidian';
import { PaperLibraryPage } from '@/components/paper-library-page';
import { PaperLibraryRepository } from '@/papers/paper-library-repository';
import type PaperManagerPlugin from '@/main';

export const PAPER_LIBRARY_VIEW_TYPE = 'paper-manager-library';

export class PaperLibraryView extends ItemView {
	private reactRoot: Root | null = null;
	private readonly repository: PaperLibraryRepository;

	constructor(leaf: WorkspaceLeaf, plugin: PaperManagerPlugin) {
		super(leaf);
		this.repository = new PaperLibraryRepository(
			this.app,
			() => plugin.settings.libraryFolder,
		);
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
				<PaperLibraryPage repository={this.repository} />
			</StrictMode>,
		);
	}

	async onClose(): Promise<void> {
		this.reactRoot?.unmount();
		this.reactRoot = null;
		this.contentEl.empty();
	}
}
