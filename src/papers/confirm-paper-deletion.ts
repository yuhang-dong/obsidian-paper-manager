import { App, Modal } from 'obsidian';
import type { PaperRecord } from './types';

export function confirmPaperDeletion(
	app: App,
	paper: PaperRecord,
): Promise<boolean> {
	return new Promise((resolve) => {
		new ConfirmPaperDeletionModal(app, paper, resolve).open();
	});
}

class ConfirmPaperDeletionModal extends Modal {
	private settled = false;

	constructor(
		app: App,
		private readonly paper: PaperRecord,
		private readonly resolveResult: (confirmed: boolean) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle('Delete paper?');
		this.contentEl.createEl('p', {
			text: `“${this.paper.title}” and all of its metadata, annotations, and derived files will be deleted.`,
		});
		this.contentEl.createEl('p', {
			text: 'The complete paper folder will be removed using your configured Obsidian deletion behavior.',
			cls: 'mod-muted',
		});

		const actions = this.contentEl.createDiv({ cls: 'modal-button-container' });
		const cancelButton = actions.createEl('button', { text: 'Cancel' });
		cancelButton.addEventListener('click', () => this.finish(false));

		const deleteButton = actions.createEl('button', {
			text: 'Delete paper',
			cls: 'mod-warning',
		});
		deleteButton.addEventListener('click', () => this.finish(true));
		cancelButton.focus();
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.settled) {
			this.settled = true;
			this.resolveResult(false);
		}
	}

	private finish(confirmed: boolean): void {
		if (this.settled) {
			return;
		}
		this.settled = true;
		this.resolveResult(confirmed);
		this.close();
	}
}
