import {
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { AlertCircle, LoaderCircle } from 'lucide-react';
import {
	PDFViewer,
	type PDFViewerRef,
	type ThemeConfig,
} from '@embedpdf/react-pdf-viewer';
import type { PluginRegistry } from '@embedpdf/core';
import {
	AnnotationPlugin,
	type AnnotationEvent,
	type TrackedAnnotation,
} from '@embedpdf/plugin-annotation';
import {
	PdfAnnotationReplyType,
	PdfAnnotationSubtype,
	type PdfDocumentObject,
	type PdfEngine,
	type PdfPageTextRuns,
	type Rect,
} from '@embedpdf/models';
import { DocumentManagerPlugin } from '@embedpdf/plugin-document-manager';
import { ExportPlugin } from '@embedpdf/plugin-export';
import pdfiumWasmUrl from '@embedpdf/pdfium/pdfium.wasm';
import { App, getLanguage, Notice, TFile } from 'obsidian';
import { PaperReaderStorage } from '@/papers/paper-reader-storage';
import {
	answerPaperQuestion,
	arrayBufferToDataUrl,
	buildQaTurnsFromThread,
	getUnansweredQuestion,
	QA_BOT_NAME,
} from '@/ai/paper-qa';

const HIDDEN_VIEWER_CATEGORIES = [
	'document-menu',
	'document-open',
	'document-export',
	'document-print',
	'document-fullscreen',
	'document-protect',
	'document-capture',
	'page-settings',
	'mode-insert',
	'redaction',
	'form',
	'insert-attachment',
	'insert-image',
	'insert-rubber-stamp',
	'insert-signature',
];

interface PaperReaderPageProps {
	app: App;
	pdfPath: string;
	getBillingKey: () => string;
}

interface PdfSourceState {
	url: string | null;
	error: string | null;
}

interface PendingQuestion {
	documentId: string;
	pageIndex: number;
	annotationId: string;
	question: string;
}

export function PaperReaderPage({
	app,
	pdfPath,
	getBillingKey,
}: PaperReaderPageProps) {
	const viewerRef = useRef<PDFViewerRef>(null);
	const storage = useMemo(
		() => new PaperReaderStorage(app, pdfPath),
		[app, pdfPath],
	);
	const [source, setSource] = useState<PdfSourceState>({
		url: null,
		error: null,
	});
	const [registry, setRegistry] = useState<PluginRegistry | null>(null);
	const isManagedPaper = storage.isManagedPaper();
	const qaQueueRef = useRef<PendingQuestion[]>([]);
	const qaActiveIdsRef = useRef<Set<string>>(new Set());
	const qaRunningRef = useRef(false);
	const pdfDataUrlRef = useRef<string | null>(null);
	const pageTextRunsCacheRef = useRef<
		Map<string, PdfPageTextRuns>
	>(new Map());

	useEffect(() => {
		let cancelled = false;
		let objectUrl: string | null = null;

		void loadPdf(app, storage.sourcePdfPath)
			.then((url) => {
				objectUrl = url;
				if (cancelled) {
					URL.revokeObjectURL(url);
					return;
				}
				setSource({ url, error: null });
			})
			.catch((error: unknown) => {
				if (!cancelled) {
					setSource({ url: null, error: errorMessage(error) });
				}
			});

		return () => {
			cancelled = true;
			if (objectUrl) {
				URL.revokeObjectURL(objectUrl);
			}
		};
	}, [app, storage]);

	useEffect(() => {
		const observer = new MutationObserver(() => {
			viewerRef.current?.container?.setTheme(getObsidianTheme());
		});
		observer.observe(document.body, {
			attributes: true,
			attributeFilter: ['class'],
		});

		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (!registry || !isManagedPaper) {
			return;
		}

		const documentApi = registry
			.getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id)
			?.provides();
		const annotationApi = registry
			.getPlugin<AnnotationPlugin>(AnnotationPlugin.id)
			?.provides();
		if (!documentApi || !annotationApi) {
			return;
		}

		let disposed = false;
		let loadedDocumentId: string | null = null;
		let saveRunning = false;
		let saveRequested = false;
		const initialImportIds = new Set<string>();

		const flushAutoSave = async () => {
			if (saveRunning) {
				return;
			}

			saveRunning = true;
			try {
				do {
					saveRequested = false;
					try {
						await savePaper(registry, storage);
					} catch (error) {
						if (!disposed) {
							new Notice(`自动保存失败：${errorMessage(error)}`);
						}
					}
				} while (saveRequested && !disposed);
			} finally {
				saveRunning = false;
			}
		};

		const getPdfDataUrl = async (): Promise<string> => {
			if (pdfDataUrlRef.current) {
				return pdfDataUrlRef.current;
			}
			const file = app.vault.getAbstractFileByPath(storage.sourcePdfPath);
			if (!(file instanceof TFile)) {
				throw new Error('PDF 文件不存在');
			}
			const data = await app.vault.readBinary(file);
			const dataUrl = await arrayBufferToDataUrl(data, 'application/pdf');
			pdfDataUrlRef.current = dataUrl;
			return dataUrl;
		};

		const processQaQueue = async (): Promise<void> => {
			if (qaRunningRef.current) {
				return;
			}
			qaRunningRef.current = true;
			try {
				while (qaQueueRef.current.length > 0) {
					const pending = qaQueueRef.current.shift();
					if (!pending) {
						break;
					}
					try {
						const billingKey = getBillingKey().trim();
						if (!billingKey) {
							new Notice(
								'请先在插件设置中添加 billing key 后再提问。',
							);
							continue;
						}

						const scope = annotationApi.forDocument(pending.documentId);
						const tracked = scope
							.getAnnotations()
							.find((item) => item.object.id === pending.annotationId);
						if (!tracked) {
							continue;
						}

						const contents =
							typeof tracked.object.contents === 'string'
								? tracked.object.contents
								: '';
						const question =
							getUnansweredQuestion(contents) ?? pending.question;

						// Resolve the thread root so replies always hang under
						// the original comment instead of nesting.
						let rootId = pending.annotationId;
						for (let depth = 0; depth < 10; depth++) {
							const parent = scope
								.getAnnotations()
								.find((item) => item.object.id === rootId);
							const parentReplyTo = parent
								? (parent.object as { inReplyToId?: string })
										.inReplyToId
								: undefined;
							if (!parentReplyTo) {
								break;
							}
							rootId = parentReplyTo;
						}

						const rootAnnotation = scope
							.getAnnotations()
							.find((item) => item.object.id === rootId);
						const replies = scope
							.getAnnotations()
							.filter(
								(item) =>
									(item.object as { inReplyToId?: string })
										.inReplyToId === rootId,
							)
							.map((item) => ({
								contents:
									typeof item.object.contents === 'string'
										? item.object.contents
										: '',
								author: item.object.author,
								created: item.object.created,
							}));

						const allTurns = buildQaTurnsFromThread(
							typeof rootAnnotation?.object.contents === 'string'
								? rootAnnotation.object.contents
								: '',
							replies,
						);
						const open = allTurns[allTurns.length - 1];
						const thread =
							open && !open.answer
								? allTurns.slice(0, -1)
								: allTurns;
						const newQuestion = (
							open && !open.answer ? open.question : question
						).trim();
						if (!newQuestion) {
							continue;
						}

						const engine = registry.getEngine();
						const document = documentApi.getDocument(
							pending.documentId,
						);
						const selectedText = document
							? await extractAnnotationText(
									engine,
									document,
									pending.pageIndex,
									rootAnnotation?.object.rect ??
										tracked.object.rect,
									pageTextRunsCacheRef.current,
								)
							: '';
						const context = selectedText
							? `用户选中了论文第 ${pending.pageIndex + 1} 页中的这段文字：\n${selectedText}`
							: undefined;

						const pdfDataUrl = await getPdfDataUrl();
						new Notice(
							`PP 正在回答：${newQuestion.slice(0, 60)}…`,
						);
						const result = await answerPaperQuestion({
							billingKey,
							pdfDataUrl,
							pdfFilename:
								pdfPath.split('/').pop() ?? 'paper.pdf',
							thread,
							newQuestion,
							context,
						});

						const baseRect =
							rootAnnotation?.object.rect ?? tracked.object.rect;
						const cascadeOffset = replies.length * 16;
						const replyId = crypto.randomUUID();
						scope.createAnnotation(pending.pageIndex, {
							id: replyId,
							type: PdfAnnotationSubtype.TEXT,
							pageIndex: pending.pageIndex,
							rect: {
								origin: {
									x: baseRect.origin.x + cascadeOffset,
									y: baseRect.origin.y + cascadeOffset,
								},
								size: baseRect.size,
							},
							contents: result.answer,
							author: QA_BOT_NAME,
							inReplyToId: rootId,
							replyType: PdfAnnotationReplyType.Reply,
							created: new Date(),
							modified: new Date(),
						});
						new Notice(
							`PP 已回答 · ${result.usage.creditsCharged} credit(s) · ${result.usage.remainingCredits} remaining`,
						);
					} catch (error) {
						new Notice(`PP 回答失败：${errorMessage(error)}`);
					} finally {
						qaActiveIdsRef.current.delete(pending.annotationId);
					}
				}
			} finally {
				qaRunningRef.current = false;
			}
		};

		const enqueueQuestion = (pending: PendingQuestion): void => {
			if (
				qaActiveIdsRef.current.has(pending.annotationId) ||
				qaQueueRef.current.some(
					(item) => item.annotationId === pending.annotationId,
				)
			) {
				return;
			}
			qaActiveIdsRef.current.add(pending.annotationId);
			qaQueueRef.current.push(pending);
			void processQaQueue();
		};

		const unsubscribeAnnotationEvents = annotationApi.onAnnotationEvent(
			(event: AnnotationEvent) => {
				if (
					event.type === 'create' &&
					event.committed &&
					initialImportIds.delete(event.annotation.id)
				) {
					return;
				}

				if (
					(event.type === 'create' || event.type === 'update') &&
					event.committed
				) {
					const contents =
						typeof event.annotation.contents === 'string'
							? event.annotation.contents
							: event.type === 'update' &&
								typeof event.patch.contents === 'string'
								? event.patch.contents
								: '';
					const question = getUnansweredQuestion(contents);
					if (question && !disposed) {
						const scope =
							annotationApi.forDocument(event.documentId);
						const hasPpReply = scope
							.getAnnotations()
							.some(
								(item) =>
									item.object.type ===
										PdfAnnotationSubtype.TEXT &&
									item.object.author === QA_BOT_NAME &&
									(item.object as { inReplyToId?: string })
										.inReplyToId === event.annotation.id,
							);
						if (hasPpReply) {
							return;
						}
						enqueueQuestion({
							documentId: event.documentId,
							pageIndex: event.pageIndex,
							annotationId: event.annotation.id,
							question,
						});
					}
				}

				if (
					event.type !== 'loaded' &&
					event.committed &&
					!disposed
				) {
					saveRequested = true;
					void flushAutoSave();
				}
			},
		);

		const importSavedAnnotations = async (documentId: string) => {
			if (loadedDocumentId === documentId) {
				return;
			}
			loadedDocumentId = documentId;

			try {
				const savedAnnotations = await storage.loadAnnotations();
				if (disposed || savedAnnotations.length === 0) {
					return;
				}

				const scope = annotationApi.forDocument(documentId);
				const existingIds = new Set(
					scope
						.getAnnotations()
						.map((item: TrackedAnnotation) => item.object.id),
				);
				const missingAnnotations = savedAnnotations.filter((item) => {
					return !existingIds.has(item.annotation.id);
				});
				for (const item of missingAnnotations) {
					initialImportIds.add(item.annotation.id);
				}
				scope.importAnnotations(missingAnnotations);
			} catch (error) {
				if (!disposed) {
					new Notice(`加载标注失败：${errorMessage(error)}`);
				}
			}
		};

		const activeDocumentId = documentApi.getActiveDocumentId();
		const activeDocumentState = activeDocumentId
			? documentApi.getDocumentState(activeDocumentId)
			: null;

		if (activeDocumentId && activeDocumentState?.status === 'loaded') {
			void importSavedAnnotations(activeDocumentId);
		}

		const unsubscribe = documentApi.onDocumentOpened(
			(documentState: { id: string }) => {
				void importSavedAnnotations(documentState.id);
			},
		);

		return () => {
			disposed = true;
			unsubscribeAnnotationEvents();
			unsubscribe();
		};
	}, [isManagedPaper, registry, storage]);

	if (source.error) {
		return (
			<div className="flex h-full items-center justify-center bg-background p-8 text-foreground">
				<div className="flex max-w-lg flex-col items-center gap-3 text-center">
					<AlertCircle className="size-7 text-destructive" />
					<div>
						<p className="font-medium">无法加载 PDF</p>
						<p className="mt-1 text-sm text-muted-foreground">{source.error}</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="h-full min-h-0 bg-background text-foreground">
			{source.url ? (
				<PDFViewer
					ref={viewerRef}
					key={source.url}
					config={{
						src: source.url,
						wasmUrl: pdfiumWasmUrl,
						worker: true,
						fontFallback: null,
						fonts: {
							ui: null,
							signature: null,
						},
						i18n: {
							defaultLocale: getEmbedPdfLocale(getLanguage()),
						},
						ui: {
							disabledCategories: HIDDEN_VIEWER_CATEGORIES,
						},
						annotations: {
							autoCommit: true,
							annotationAuthor: 'Paper Manager',
							selectAfterCreate: true,
						},
						tabBar: 'never',
						theme: getObsidianTheme(),
					}}
					style={{ width: '100%', height: '100%' }}
					onReady={setRegistry}
				/>
			) : (
				<div className="flex h-full items-center justify-center text-muted-foreground">
					<div className="flex items-center gap-2 text-sm">
						<LoaderCircle className="size-5 animate-spin" />
						正在加载 PDF…
					</div>
				</div>
			)}
		</div>
	);
}

async function savePaper(
	registry: PluginRegistry,
	storage: PaperReaderStorage,
): Promise<void> {
	const documentApi = registry
		.getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id)
		?.provides();
	const annotationApi = registry
		.getPlugin<AnnotationPlugin>(AnnotationPlugin.id)
		?.provides();
	const exportApi = registry
		.getPlugin<ExportPlugin>(ExportPlugin.id)
		?.provides();
	const documentId = documentApi?.getActiveDocumentId();

	if (!documentId || !annotationApi || !exportApi) {
		throw new Error('EmbedPDF 尚未准备好');
	}

	const annotationScope = annotationApi.forDocument(documentId);
	const annotations = await annotationScope.exportAnnotations().toPromise();
	await storage.saveAnnotations(annotations);
	await annotationScope.commit().toPromise();
	const annotatedPdf = await exportApi
		.forDocument(documentId)
		.saveAsCopy()
		.toPromise();
	await storage.saveAnnotatedPdf(annotatedPdf);
}

async function loadPdf(app: App, pdfPath: string): Promise<string> {
	const file = app.vault.getAbstractFileByPath(pdfPath);
	if (!(file instanceof TFile)) {
		throw new Error(`PDF not found: ${pdfPath}`);
	}

	const data = await app.vault.readBinary(file);
	const blob = new Blob([data], { type: 'application/pdf' });
	return URL.createObjectURL(blob);
}

function getObsidianTheme(): ThemeConfig {
	const styles = getComputedStyle(document.body);
	const color = (variable: string, fallback: string) => {
		return styles.getPropertyValue(variable).trim() || fallback;
	};
	const preference = document.body.classList.contains('theme-dark')
		? 'dark'
		: 'light';
	const overrides = {
		background: {
			app: color('--background-primary', '#ffffff'),
			surface: color('--background-secondary', '#f5f5f5'),
			surfaceAlt: color('--background-secondary-alt', '#eeeeee'),
			elevated: color('--background-primary-alt', '#ffffff'),
			overlay: color('--background-modifier-cover', 'rgba(0, 0, 0, 0.45)'),
			input: color('--background-modifier-form-field', '#ffffff'),
		},
		foreground: {
			primary: color('--text-normal', '#1f2937'),
			secondary: color('--text-muted', '#6b7280'),
			muted: color('--text-faint', '#9ca3af'),
			disabled: color('--text-faint', '#9ca3af'),
			onAccent: color('--text-on-accent', '#ffffff'),
		},
		border: {
			default: color('--background-modifier-border', '#d1d5db'),
			subtle: color('--background-modifier-border-hover', '#e5e7eb'),
			strong: color('--background-modifier-border-focus', '#9ca3af'),
		},
		accent: {
			primary: color('--interactive-accent', '#7c3aed'),
			primaryHover: color('--interactive-accent-hover', '#6d28d9'),
			primaryActive: color('--interactive-accent-hover', '#5b21b6'),
			primaryLight: color('--background-modifier-hover', '#ede9fe'),
			primaryForeground: color('--text-on-accent', '#ffffff'),
		},
		interactive: {
			hover: color('--background-modifier-hover', '#f3f4f6'),
			active: color('--background-modifier-active-hover', '#e5e7eb'),
			selected: color('--background-modifier-active-hover', '#e5e7eb'),
			focus: color('--interactive-accent', '#7c3aed'),
			focusRing: color('--background-modifier-border-focus', '#a78bfa'),
		},
	};

	return preference === 'dark'
		? { preference, dark: overrides }
		: { preference, light: overrides };
}

function getEmbedPdfLocale(obsidianLanguage: string): string {
	const normalized = obsidianLanguage.replace('_', '-').toLowerCase();
	const localeMap: Record<string, string> = {
		en: 'en',
		'en-us': 'en',
		'en-gb': 'en',
		de: 'de',
		nl: 'nl',
		fr: 'fr',
		es: 'es',
		sv: 'sv',
		ja: 'ja',
		zh: 'zh-CN',
		'zh-cn': 'zh-CN',
		'zh-tw': 'zh-TW',
		pt: 'pt-BR',
		'pt-br': 'pt-BR',
	};

	return localeMap[normalized] ?? localeMap[normalized.split('-')[0] ?? ''] ?? 'en';
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function extractAnnotationText(
	engine: PdfEngine,
	document: PdfDocumentObject,
	pageIndex: number,
	rect: Rect,
	cache: Map<string, PdfPageTextRuns>,
): Promise<string> {
	const page = document.pages[pageIndex];
	if (!page) {
		return '';
	}

	const cacheKey = `${document.id}:${pageIndex}`;
	let textRuns = cache.get(cacheKey);
	if (!textRuns) {
		textRuns = await engine.getPageTextRuns(document, page).toPromise();
		cache.set(cacheKey, textRuns);
	}

	return textRuns.runs
		.filter((run) => rectsIntersect(run.rect, rect))
		.map((run) => run.text)
		.join('')
		.replace(/\s+/g, ' ')
		.trim();
}

function rectsIntersect(left: Rect, right: Rect): boolean {
	return (
		left.origin.x < right.origin.x + right.size.width &&
		left.origin.x + left.size.width > right.origin.x &&
		left.origin.y < right.origin.y + right.size.height &&
		left.origin.y + left.size.height > right.origin.y
	);
}
