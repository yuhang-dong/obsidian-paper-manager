import {
	App,
	MarkdownPostProcessorContext,
	MarkdownRenderChild,
	setIcon,
	TFile,
} from 'obsidian';

const INLINE_PDF_SELECTOR = '.internal-embed[src], .internal-embed[data-href]';
const EDIT_BUTTON_CLASS = 'paper-manager-inline-pdf-edit';

export function addInlinePdfEditButtons(
	app: App,
	containerEl: HTMLElement,
	context: MarkdownPostProcessorContext,
	onEdit: (file: TFile) => void,
): void {
	context.addChild(
		new InlinePdfEditChild(app, containerEl, context.sourcePath, onEdit),
	);
}

class InlinePdfEditChild extends MarkdownRenderChild {
	private readonly buttons = new Set<HTMLButtonElement>();
	private observer: MutationObserver | null = null;

	constructor(
		private readonly app: App,
		containerEl: HTMLElement,
		private readonly sourcePath: string,
		private readonly onEdit: (file: TFile) => void,
	) {
		super(containerEl);
	}

	onload(): void {
		this.enhancePdfEmbeds();

		this.observer = new MutationObserver(() => {
			this.enhancePdfEmbeds();
		});
		this.observer.observe(this.containerEl, {
			childList: true,
			subtree: true,
		});
	}

	onunload(): void {
		this.observer?.disconnect();
		this.observer = null;

		for (const button of this.buttons) {
			button.parentElement?.removeClass('paper-manager-inline-pdf');
			button.remove();
		}
		this.buttons.clear();
	}

	private enhancePdfEmbeds(): void {
		const embeds = this.getCandidateEmbeds();
		for (const embed of embeds) {
			if (embed.querySelector(`.${EDIT_BUTTON_CLASS}`)) {
				continue;
			}

			const file = this.resolvePdfFile(embed);
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
			button.addEventListener('click', (event) => {
				event.preventDefault();
				event.stopPropagation();
				this.onEdit(file);
			});

			embed.addClass('paper-manager-inline-pdf');
			this.buttons.add(button);
		}
	}

	private getCandidateEmbeds(): HTMLElement[] {
		const embeds = Array.from(
			this.containerEl.querySelectorAll<HTMLElement>(INLINE_PDF_SELECTOR),
		);
		if (this.containerEl.matches(INLINE_PDF_SELECTOR)) {
			embeds.unshift(this.containerEl);
		}
		return embeds;
	}

	private resolvePdfFile(embed: HTMLElement): TFile | null {
		const rawLink = embed.getAttribute('src') ?? embed.getAttribute('data-href');
		if (!rawLink) {
			return null;
		}

		const linkPath = rawLink.split('#', 1)[0]?.trim();
		if (!linkPath) {
			return null;
		}

		const file = this.app.metadataCache.getFirstLinkpathDest(
			linkPath,
			this.sourcePath,
		);
		return file instanceof TFile && file.extension.toLowerCase() === 'pdf'
			? file
			: null;
	}
}
