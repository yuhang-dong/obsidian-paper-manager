import type { Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import {
	App,
	editorInfoField,
	editorLivePreviewField,
	setIcon,
	TFile,
} from 'obsidian';

const LIVE_PREVIEW_PDF_SELECTOR = '.pdf-embed[src], .pdf-embed[data-href]';
const EDIT_BUTTON_CLASS = 'paper-manager-inline-pdf-edit';

export function createLivePreviewPdfEditExtension(
	app: App,
	onEdit: (file: TFile) => void,
): Extension {
	return ViewPlugin.define((view) => {
		return new LivePreviewPdfEditPlugin(view, app, onEdit);
	});
}

class LivePreviewPdfEditPlugin {
	private readonly buttons = new Set<HTMLButtonElement>();
	private readonly observer: MutationObserver;

	constructor(
		private readonly view: EditorView,
		private readonly app: App,
		private readonly onEdit: (file: TFile) => void,
	) {
		this.observer = new MutationObserver(() => this.enhancePdfEmbeds());
		this.observer.observe(view.dom, {
			childList: true,
			subtree: true,
		});
		this.enhancePdfEmbeds();
	}

	update(update: ViewUpdate): void {
		const livePreviewChanged =
			update.startState.field(editorLivePreviewField) !==
			update.state.field(editorLivePreviewField);
		if (update.docChanged || update.viewportChanged || livePreviewChanged) {
			this.enhancePdfEmbeds();
		}
	}

	destroy(): void {
		this.observer.disconnect();
		this.removeButtons();
	}

	private enhancePdfEmbeds(): void {
		this.removeDetachedButtons();
		if (!this.view.state.field(editorLivePreviewField)) {
			this.removeButtons();
			return;
		}

		const sourceFile = this.view.state.field(editorInfoField).file;
		if (!(sourceFile instanceof TFile)) {
			return;
		}

		const embeds = Array.from(
			this.view.dom.querySelectorAll<HTMLElement>(LIVE_PREVIEW_PDF_SELECTOR),
		);
		for (const embed of embeds) {
			if (embed.querySelector(`.${EDIT_BUTTON_CLASS}`)) {
				continue;
			}

			const file = this.resolvePdfFile(embed, sourceFile.path);
			if (!file) {
				continue;
			}

			const button = embed.createEl('button', {
				cls: ['clickable-icon', EDIT_BUTTON_CLASS],
			});
			button.type = 'button';
			button.setAttribute('aria-label', '编辑标注');
			button.setAttribute('data-tooltip-position', 'left');
			setIcon(button, 'highlighter');
			button.addEventListener('mousedown', (event: MouseEvent) => {
				event.preventDefault();
				event.stopPropagation();
			});
			button.addEventListener('click', (event: MouseEvent) => {
				event.preventDefault();
				event.stopPropagation();
				this.onEdit(file);
			});

			embed.addClass('paper-manager-inline-pdf');
			this.buttons.add(button);
		}
	}

	private resolvePdfFile(embed: HTMLElement, sourcePath: string): TFile | null {
		const rawLink = embed.getAttribute('src') ?? embed.getAttribute('data-href');
		const linkPath = rawLink?.split('#', 1)[0]?.trim();
		if (!linkPath) {
			return null;
		}

		const file = this.app.metadataCache.getFirstLinkpathDest(
			linkPath,
			sourcePath,
		);
		return file instanceof TFile && file.extension.toLowerCase() === 'pdf'
			? file
			: null;
	}

	private removeDetachedButtons(): void {
		for (const button of this.buttons) {
			if (!button.isConnected) {
				this.buttons.delete(button);
			}
		}
	}

	private removeButtons(): void {
		for (const button of this.buttons) {
			button.parentElement?.removeClass('paper-manager-inline-pdf');
			button.remove();
		}
		this.buttons.clear();
	}
}
