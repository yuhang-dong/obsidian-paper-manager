import { ItemView, WorkspaceLeaf } from 'obsidian';

export const PAPER_LIBRARY_VIEW_TYPE = 'paper-manager-library';

export class PaperLibraryView extends ItemView {
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
		const container = this.contentEl;
		container.empty();
		container.addClass('paper-manager-library');

		const header = container.createDiv({ cls: 'paper-manager-library__header' });
		const titleGroup = header.createDiv();
		titleGroup.createEl('h2', { text: 'Paper library' });
		titleGroup.createEl('p', {
			text: 'Import, organize, read, and synthesize academic papers.',
			cls: 'paper-manager-library__subtitle',
		});

		const importButton = header.createEl('button', {
			text: 'Import papers',
			cls: 'mod-cta',
		});
		importButton.type = 'button';
		importButton.disabled = true;
		importButton.setAttribute('aria-label', 'PDF import will be added next');

		const tableWrapper = container.createDiv({
			cls: 'paper-manager-library__table-wrapper',
		});
		const table = tableWrapper.createEl('table', {
			cls: 'paper-manager-library__table',
		});
		const headerRow = table.createTHead().insertRow();
		for (const heading of ['', 'Title', 'Authors', 'Year', 'Status']) {
			headerRow.createEl('th', { text: heading });
		}

		const emptyRow = table.createTBody().insertRow();
		const emptyCell = emptyRow.createEl('td', {
			text: 'No papers yet. The library scaffold is ready for the PDF import pipeline.',
			cls: 'paper-manager-library__empty',
		});
		emptyCell.colSpan = 5;
	}
}
