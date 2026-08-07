import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ItemView, WorkspaceLeaf } from 'obsidian';
import { PaperLibraryPage } from '@/components/paper-library-page';

export const PAPER_LIBRARY_VIEW_TYPE = 'paper-manager-library';

export class PaperLibraryView extends ItemView {
	private reactRoot: Root | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
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
				<PaperLibraryPage />
			</StrictMode>,
		);
	}

	async onClose(): Promise<void> {
		this.reactRoot?.unmount();
		this.reactRoot = null;
		this.contentEl.empty();
	}
}
