import {
	type ChangeEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import {
	Columns3,
	FileText,
	LoaderCircle,
	Search,
	SlidersHorizontal,
	Sparkles,
	Trash2,
	Upload,
} from 'lucide-react';
import { Notice } from 'obsidian';
import {
	createColumnHelper,
	rowSelectionFeature,
	tableFeatures,
	useTable,
} from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
	Task,
	TaskContent,
	TaskItem,
	TaskTrigger,
} from '@/components/ai-elements/task';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import type { PaperLibraryRepository } from '@/papers/paper-library-repository';
import type { PaperImportResult, PaperRecord } from '@/papers/types';
import {
	analyzePaper,
	type PaperAnalysisStage,
} from '@/ai/paper-analysis';

interface PaperLibraryPageProps {
	repository: PaperLibraryRepository;
	getBillingKey: () => string;
	confirmDeletePaper: (paper: PaperRecord) => Promise<boolean>;
}

interface ActivePaperAnalysis {
	paperId: string;
	title: string;
	stage: PaperAnalysisStage;
}

const paperTableFeatures = tableFeatures({ rowSelectionFeature });
const paperColumnHelper = createColumnHelper<
	typeof paperTableFeatures,
	PaperRecord
>();

export function PaperLibraryPage({
	repository,
	getBillingKey,
	confirmDeletePaper,
}: PaperLibraryPageProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [papers, setPapers] = useState<PaperRecord[]>([]);
	const [query, setQuery] = useState('');
	const [isLoading, setIsLoading] = useState(true);
	const [isImporting, setIsImporting] = useState(false);
	const [activeAnalysis, setActiveAnalysis] =
		useState<ActivePaperAnalysis | null>(null);
	const [deletingPaperId, setDeletingPaperId] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		void repository
			.listPapers()
			.then((loadedPapers) => {
				if (!cancelled) {
					setPapers(loadedPapers);
				}
			})
			.catch((error: unknown) => {
				if (!cancelled) {
					new Notice(`Could not load paper library: ${errorMessage(error)}`);
				}
			})
			.finally(() => {
				if (!cancelled) {
					setIsLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [repository]);

	const filteredPapers = useMemo(() => {
		const normalizedQuery = query.trim().toLocaleLowerCase();
		if (!normalizedQuery) {
			return papers;
		}

		return papers.filter((paper) => {
			return [paper.title, paper.originalFilename, ...paper.authors]
				.join(' ')
				.toLocaleLowerCase()
				.includes(normalizedQuery);
		});
	}, [papers, query]);

	const columns = useMemo(
		() =>
			paperColumnHelper.columns([
				paperColumnHelper.display({
					id: 'select',
					header: ({ table }) => (
						<input
							type="checkbox"
							aria-label="Select all papers"
							className="size-4 accent-[var(--interactive-accent)]"
							checked={table.getIsAllRowsSelected()}
							disabled={table.getRowModel().rows.length === 0}
							onChange={table.getToggleAllRowsSelectedHandler()}
						/>
					),
					cell: ({ row }) => (
						<input
							type="checkbox"
							aria-label={`Select ${row.original.title}`}
							className="size-4 accent-[var(--interactive-accent)]"
							checked={row.getIsSelected()}
							onChange={row.getToggleSelectedHandler()}
						/>
					),
				}),
				paperColumnHelper.accessor('title', {
					header: 'Title',
					cell: ({ row }) => (
						<button
							type="button"
							className="max-w-xl cursor-pointer truncate text-left font-medium text-foreground hover:text-[var(--text-accent)] hover:underline"
							title={row.original.originalFilename}
							onClick={() => {
								void repository
									.openIndex(row.original)
									.catch((error: unknown) => {
										new Notice(
											`Could not open paper: ${errorMessage(error)}`,
										);
									});
							}}
						>
							{row.original.title}
						</button>
					),
				}),
				paperColumnHelper.accessor('authors', {
					header: 'Authors',
					cell: ({ row }) => (
						<span className="text-muted-foreground">
							{row.original.authors.length > 0
								? row.original.authors.join(', ')
								: '—'}
						</span>
					),
				}),
				paperColumnHelper.accessor('year', {
					header: 'Year',
					cell: ({ row }) => (
						<span className="text-muted-foreground">
							{row.original.year ?? '—'}
						</span>
					),
				}),
				paperColumnHelper.accessor('status', {
					header: 'Status',
					cell: ({ row }) => (
						<Badge variant="secondary">{row.original.status}</Badge>
					),
				}),
				paperColumnHelper.display({
					id: 'aiAnalysis',
					header: 'AI analysis',
					cell: ({ row }) => {
						const paper = row.original;
						const isActive = activeAnalysis?.paperId === paper.id;
						const isAnotherActive =
							activeAnalysis !== null && !isActive;
						const isComplete = paper.aiStatus === 'completed';

						return (
							<Button
								variant={isComplete ? 'ghost' : 'outline'}
								size="sm"
								disabled={isAnotherActive || isActive}
								title={
									paper.aiStatus === 'failed' && paper.aiError
										? paper.aiError
										: isComplete
											? 'Analyze again (uses credits)'
											: 'Analyze this PDF (uses credits)'
								}
								onClick={() => void handleAnalyzePaper(paper)}
							>
								{isActive ? (
									<LoaderCircle className="animate-spin" />
								) : (
									<Sparkles />
								)}
								{isActive
									? analysisStageLabel(activeAnalysis.stage)
									: isComplete
										? 'Reanalyze'
										: paper.aiStatus === 'failed'
											? 'Retry'
											: 'Analyze'}
							</Button>
						);
					},
				}),
				paperColumnHelper.display({
					id: 'actions',
					header: 'Actions',
					cell: ({ row }) => {
						const paper = row.original;
						const isDeleting = deletingPaperId === paper.id;

						return (
							<Button
								variant="ghost"
								size="icon"
								className="text-muted-foreground hover:text-destructive"
								disabled={
									deletingPaperId !== null || activeAnalysis !== null
								}
								title="Delete paper"
								aria-label={`Delete ${paper.title}`}
								onClick={() => void handleDeletePaper(paper)}
							>
								{isDeleting ? (
									<LoaderCircle className="animate-spin" />
								) : (
									<Trash2 />
								)}
							</Button>
						);
					},
				}),
			]),
		[activeAnalysis, confirmDeletePaper, deletingPaperId, repository],
	);

	const table = useTable(
		{
			features: paperTableFeatures,
			columns,
			data: filteredPapers,
			getRowId: (paper) => paper.id,
		},
		(state) => ({ rowSelection: state.rowSelection }),
	);
	const visibleRows = table.getRowModel().rows;
	const selectedCount = Object.keys(table.state.rowSelection).length;

	function chooseFiles(): void {
		if (fileInputRef.current) {
			fileInputRef.current.value = '';
			fileInputRef.current.click();
		}
	}

	async function handleFileSelection(
		event: ChangeEvent<HTMLInputElement>,
	): Promise<void> {
		const files = Array.from(event.currentTarget.files ?? []).filter((file) => {
			return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
		});

		if (files.length === 0) {
			return;
		}

		setIsImporting(true);
		try {
			const result = await repository.importPapers(files);
			setPapers((current) => mergePapers(current, result.imported));
			showImportResult(result);
		} catch (error) {
			new Notice(`Could not import papers: ${errorMessage(error)}`);
		} finally {
			setIsImporting(false);
		}
	}

	async function handleAnalyzePaper(paper: PaperRecord): Promise<void> {
		if (activeAnalysis) {
			return;
		}

		const billingKey = getBillingKey().trim();
		if (!billingKey) {
			new Notice('Add your paper manager billing key in plugin settings first.');
			return;
		}

		setActiveAnalysis({
			paperId: paper.id,
			title: paper.title,
			stage: 'reading_pdf',
		});

		try {
			const result = await analyzePaper({
				repository,
				paper,
				billingKey,
				onProgress: (stage) => {
					setActiveAnalysis((current) =>
						current?.paperId === paper.id ? { ...current, stage } : current,
					);
				},
			});
			setPapers((current) => mergePapers(current, [result.paper]));
			new Notice(
				`Analysis saved · ${result.usage.creditsCharged} credit(s) · ${result.usage.remainingCredits} remaining`,
			);
		} catch (error) {
			new Notice(`Could not analyze paper: ${errorMessage(error)}`);
			try {
				setPapers(await repository.listPapers());
			} catch (refreshError) {
				console.error('Could not refresh papers after analysis failure', refreshError);
			}
		} finally {
			setActiveAnalysis(null);
		}
	}

	async function handleDeletePaper(paper: PaperRecord): Promise<void> {
		if (deletingPaperId || activeAnalysis) {
			return;
		}

		const confirmed = await confirmDeletePaper(paper);
		if (!confirmed) {
			return;
		}

		setDeletingPaperId(paper.id);
		try {
			await repository.deletePaper(paper);
			setPapers((current) =>
				current.filter((candidate) => candidate.id !== paper.id),
			);
			new Notice('Paper deleted');
		} catch (error) {
			new Notice(`Could not delete paper: ${errorMessage(error)}`);
		} finally {
			setDeletingPaperId(null);
		}
	}

	return (
		<div className="flex min-h-full flex-col bg-background text-foreground">
			<input
				ref={fileInputRef}
				type="file"
				accept=".pdf,application/pdf"
				multiple
				className="hidden"
				onChange={(event) => void handleFileSelection(event)}
			/>

			<main className="flex flex-1 p-6">
				<section className="flex-1 overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xs">
					<div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
						<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
							<div className="relative min-w-56 flex-1 sm:max-w-sm">
								<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									aria-label="Search papers"
									placeholder="Search papers"
									className="pl-9"
									value={query}
									onChange={(event) => setQuery(event.target.value)}
								/>
							</div>
							<Button variant="outline" disabled>
								<SlidersHorizontal />
								Filter
							</Button>
							<Button variant="outline" disabled>
								<Columns3 />
								Columns
							</Button>
						</div>
						<Button
							className="mod-cta"
							onClick={chooseFiles}
							disabled={isImporting}
						>
							{isImporting ? (
								<LoaderCircle className="animate-spin" />
							) : (
								<Upload />
							)}
							{isImporting ? 'Importing…' : 'Import papers'}
						</Button>
					</div>
					{activeAnalysis ? (
						<PaperAnalysisProgress analysis={activeAnalysis} />
					) : null}
					<Table>
						<TableHeader>
							{table.getHeaderGroups().map((headerGroup) => (
								<TableRow key={headerGroup.id} className="hover:bg-transparent">
									{headerGroup.headers.map((header) => (
										<TableHead
											key={header.id}
											className={columnClassName(header.column.id)}
										>
											{header.isPlaceholder ? null : (
												<table.FlexRender header={header} />
											)}
										</TableHead>
									))}
								</TableRow>
							))}
						</TableHeader>
						<TableBody>
							{isLoading ? (
								<LoadingRow columnCount={columns.length} />
							) : visibleRows.length === 0 ? (
								<EmptyRow
									columnCount={columns.length}
									hasPapers={papers.length > 0}
								/>
							) : (
								visibleRows.map((row) => (
									<TableRow
										key={row.id}
										data-state={row.getIsSelected() ? 'selected' : undefined}
									>
										{row.getAllCells().map((cell) => (
											<TableCell
												key={cell.id}
												className={columnClassName(cell.column.id)}
											>
												<table.FlexRender cell={cell} />
											</TableCell>
										))}
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
					<footer className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
						{filteredPapers.length === papers.length
							? `${papers.length} ${papers.length === 1 ? 'paper' : 'papers'}`
							: `${filteredPapers.length} of ${papers.length} papers`}
						{selectedCount > 0 ? ` · ${selectedCount} selected` : ''}
					</footer>
				</section>
			</main>
		</div>
	);
}

function columnClassName(columnId: string): string | undefined {
	if (columnId === 'select') {
		return 'w-10';
	}
	if (columnId === 'year') {
		return 'w-24';
	}
	if (columnId === 'status') {
		return 'w-28';
	}
	if (columnId === 'aiAnalysis') {
		return 'w-36';
	}
	if (columnId === 'actions') {
		return 'w-20';
	}

	return undefined;
}

const PAPER_ANALYSIS_STAGES: ReadonlyArray<{
	id: PaperAnalysisStage;
	label: string;
}> = [
	{ id: 'reading_pdf', label: 'Read source PDF' },
	{ id: 'reserving_credits', label: 'Reserve usage credits' },
	{ id: 'analyzing', label: 'Extract and analyze paper' },
	{ id: 'saving', label: 'Save Markdown properties' },
];

function PaperAnalysisProgress({
	analysis,
}: {
	analysis: ActivePaperAnalysis;
}) {
	const activeIndex = PAPER_ANALYSIS_STAGES.findIndex(
		(stage) => stage.id === analysis.stage,
	);

	return (
		<div className="border-b border-border bg-muted/40 px-4 py-3">
			<Task open>
				<TaskTrigger>
					<Sparkles className="size-4 text-primary" />
					<span className="truncate">Analyzing {analysis.title}</span>
				</TaskTrigger>
				<TaskContent>
					{PAPER_ANALYSIS_STAGES.map((stage, index) => (
						<TaskItem
							key={stage.id}
							status={
								index < activeIndex
									? 'complete'
									: index === activeIndex
										? 'active'
										: 'pending'
							}
						>
							{stage.label}
						</TaskItem>
					))}
				</TaskContent>
			</Task>
		</div>
	);
}

function analysisStageLabel(stage: PaperAnalysisStage): string {
	if (stage === 'reading_pdf') {
		return 'Reading…';
	}
	if (stage === 'reserving_credits') {
		return 'Starting…';
	}
	if (stage === 'saving') {
		return 'Saving…';
	}
	return 'Analyzing…';
}

function LoadingRow({ columnCount }: { columnCount: number }) {
	return (
		<TableRow className="hover:bg-transparent">
			<TableCell
				colSpan={columnCount}
				className="h-72 text-center text-muted-foreground"
			>
				<LoaderCircle className="mx-auto size-6 animate-spin" />
			</TableCell>
		</TableRow>
	);
}

function EmptyRow({
	columnCount,
	hasPapers,
}: {
	columnCount: number;
	hasPapers: boolean;
}) {
	return (
		<TableRow className="hover:bg-transparent">
			<TableCell colSpan={columnCount} className="h-72 text-center">
				<div className="mx-auto flex max-w-sm flex-col items-center gap-3 text-muted-foreground">
					<div className="rounded-full bg-muted p-3">
						<FileText className="size-6" />
					</div>
					<div className="space-y-1">
						<p className="font-medium text-foreground">
							{hasPapers ? 'No matching papers' : 'No papers yet'}
						</p>
						<p className="text-sm">
							{hasPapers
								? 'Try a different search.'
								: 'Import one or more PDF files to build your library.'}
						</p>
					</div>
				</div>
			</TableCell>
		</TableRow>
	);
}

function mergePapers(
	current: PaperRecord[],
	imported: PaperRecord[],
): PaperRecord[] {
	const papersById = new Map(current.map((paper) => [paper.id, paper]));
	for (const paper of imported) {
		papersById.set(paper.id, paper);
	}

	return Array.from(papersById.values()).sort((left, right) => {
		return (
			right.createdAt.localeCompare(left.createdAt) ||
			left.title.localeCompare(right.title)
		);
	});
}

function showImportResult(result: PaperImportResult): void {
	const parts: string[] = [];
	if (result.imported.length > 0) {
		parts.push(`Imported ${result.imported.length}`);
	}
	if (result.skippedDuplicates.length > 0) {
		parts.push(`skipped ${result.skippedDuplicates.length} duplicate(s)`);
	}
	if (result.errors.length > 0) {
		parts.push(`failed ${result.errors.length}`);
	}

	new Notice(parts.join(' · ') || 'No PDF files were imported');

	if (result.errors.length > 0) {
		console.error('Paper import errors', result.errors);
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
