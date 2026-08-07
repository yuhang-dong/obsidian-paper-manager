import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ItemView, type ViewStateResult, WorkspaceLeaf } from 'obsidian';
import { PaperReaderPage } from '@/components/paper-reader-page';

export const PAPER_READER_VIEW_TYPE = 'paper-manager-reader';

interface PaperReaderViewState {
	pdfPath?: string;
}

export class PaperReaderView extends ItemView {
	private reactRoot: Root | null = null;
	private pdfPath = '';

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		this.navigation = true;
	}

	getViewType(): string {
		return PAPER_READER_VIEW_TYPE;
	}

	getDisplayText(): string {
		if (!this.pdfPath) {
			return 'Paper reader';
		}

		return this.pdfPath.split('/').pop() ?? 'Paper reader';
	}

	getIcon(): string {
		return 'highlighter';
	}

	getState(): Record<string, unknown> {
		return { pdfPath: this.pdfPath };
	}

	async setState(state: unknown, _result: ViewStateResult): Promise<void> {
		const readerState = isReaderState(state) ? state : {};
		this.pdfPath = readerState.pdfPath ?? '';
		this.renderReader();
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('paper-manager-reader-view');
		const reactContainer = this.contentEl.createDiv({
			cls: 'paper-manager-reader-root',
		});

		this.reactRoot = createRoot(reactContainer);
		this.renderReader();
	}

	async onClose(): Promise<void> {
		this.reactRoot?.unmount();
		this.reactRoot = null;
		this.contentEl.removeClass('paper-manager-reader-view');
		this.contentEl.empty();
	}

	private renderReader(): void {
		if (!this.reactRoot) {
			return;
		}

		if (!this.pdfPath) {
			this.reactRoot.render(
				<div className="flex h-full items-center justify-center text-muted-foreground">
					No PDF selected.
				</div>,
			);
			return;
		}

		this.reactRoot.render(
			<StrictMode>
				<PaperReaderPage app={this.app} pdfPath={this.pdfPath} />
			</StrictMode>,
		);
	}
}

function isReaderState(state: unknown): state is PaperReaderViewState {
	return typeof state === 'object' && state !== null;
}
