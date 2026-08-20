import {
	type ChangeEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import {
	ChevronDown,
	FileText,
	ListFilter,
	LoaderCircle,
	Search,
	Sparkles,
	Trash2,
	Upload,
} from 'lucide-react';
import { Notice } from 'obsidian';
import {
	createColumnHelper,
	tableFeatures,
	useTable,
} from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import {
	ColumnFilterMenu,
	type ColumnFilterOption,
} from '@/components/column-filter-menu';
import { EditableTagCell } from '@/components/editable-tag-cell';
import { Input } from '@/components/ui/input';
import { StatusMenu } from '@/components/status-menu';
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
import {
	PAPER_STATUS_ORDER,
	humanizeStatus,
} from '@/papers/paper-status';
import FakeProgress from 'fake-progress';

interface PaperLibraryPageProps {
	repository: PaperLibraryRepository;
	getBillingKey: () => string;
	confirmDeletePaper: (paper: PaperRecord) => Promise<boolean>;
}

interface ActivePaperAnalysis {
	paperId: string;
	title: string;
	stage: PaperAnalysisStage;
	progress: number;
}

type ActivePaperAnalyses = Record<string, ActivePaperAnalysis>;

interface StatusMenuState {
	paper: PaperRecord;
	anchor: HTMLButtonElement;
}

interface TableScrollEdges {
	left: boolean;
	right: boolean;
}

type FilterColumn = 'status' | 'keywords' | 'year' | 'authors';

type PaperFilters = Record<FilterColumn, string[]>;

interface FilterMenuState {
	column: FilterColumn;
	anchor: HTMLButtonElement;
}

const FILTER_LABELS: Record<FilterColumn, string> = {
	status: 'Status',
	keywords: 'Keywords',
	year: 'Year',
	authors: 'Authors',
};

const paperTableFeatures = tableFeatures({});

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
	const [, setActiveAnalyses] = useState<ActivePaperAnalyses>({});
	const [deletingPaperId, setDeletingPaperId] = useState<string | null>(null);
	const [statusMenu, setStatusMenu] = useState<StatusMenuState | null>(null);
	const [filterMenu, setFilterMenu] = useState<FilterMenuState | null>(null);
	const [filters, setFilters] = useState<PaperFilters>({
		status: [],
		keywords: [],
		year: [],
		authors: [],
	});
	const [tableScrollEdges, setTableScrollEdges] = useState<TableScrollEdges>({
		left: false,
		right: false,
	});
	const tableContainerRef = useRef<HTMLDivElement>(null);
	const activeAnalysesRef = useRef<ActivePaperAnalyses>({});
	const deletingPaperIdRef = useRef<string | null>(null);
	deletingPaperIdRef.current = deletingPaperId;
	const statusMenuRef = useRef<StatusMenuState | null>(null);
	statusMenuRef.current = statusMenu;

	const updateTableScrollEdges = useCallback(
		(container: HTMLDivElement): void => {
			const maxScrollLeft = Math.max(
				0,
				container.scrollWidth - container.clientWidth,
			);
			const next = {
				left: container.scrollLeft > 1,
				right: maxScrollLeft - container.scrollLeft > 1,
			};
			setTableScrollEdges((current) =>
				current.left === next.left && current.right === next.right
					? current
					: next,
			);
		},
		[],
	);

	const updateActiveAnalyses = useCallback(
		(
			update: (current: ActivePaperAnalyses) => ActivePaperAnalyses,
		): void => {
			const next = update(activeAnalysesRef.current);
			activeAnalysesRef.current = next;
			setActiveAnalyses(next);
		},
		[],
	);

	useEffect(() => {
		let cancelled = false;
		let refreshVersion = 0;
		const refreshPapers = async (): Promise<void> => {
			const version = ++refreshVersion;
			try {
				const loadedPapers = await repository.listPapers();
				if (!cancelled && version === refreshVersion) {
					setPapers(loadedPapers);
				}
			} catch (error) {
				if (!cancelled && version === refreshVersion) {
					new Notice(`Could not load paper library: ${errorMessage(error)}`);
				}
			} finally {
				if (!cancelled && version === refreshVersion) {
					setIsLoading(false);
				}
			}
		};

		const unsubscribe = repository.subscribeToLibraryChanges(() => {
			void refreshPapers();
		});
		void refreshPapers();

		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, [repository]);

	useEffect(() => {
		const container = tableContainerRef.current;
		if (!container) {
			return;
		}

		const update = () => updateTableScrollEdges(container);
		update();
		const observer = new ResizeObserver(update);
		observer.observe(container);
		const tableElement = container.querySelector('table');
		if (tableElement) {
			observer.observe(tableElement);
		}

		return () => observer.disconnect();
	}, [updateTableScrollEdges]);

	const filterOptions = useMemo(
		() => buildFilterOptions(papers),
		[papers],
	);

	const filteredPapers = useMemo(() => {
		const normalizedQuery = query.trim().toLocaleLowerCase();
		return papers.filter(
			(paper) =>
				paperMatchesFilters(paper, filters) &&
				(!normalizedQuery ||
					paper.title.toLocaleLowerCase().includes(normalizedQuery)),
		);
	}, [papers, query, filters]);

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
			return (
				file.type === 'application/pdf' ||
				file.name.toLowerCase().endsWith('.pdf')
			);
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

	const handleAnalyzePaper = useCallback(
		async (paper: PaperRecord): Promise<void> => {
			if (activeAnalysesRef.current[paper.id]) {
				return;
			}

			const billingKey = getBillingKey().trim();
			if (!billingKey) {
				new Notice(
					'Add your paper manager billing key in plugin settings first.',
				);
				return;
			}

			updateActiveAnalyses((current) => ({
				...current,
				[paper.id]: {
					paperId: paper.id,
					title: paper.title,
					stage: 'reading_pdf',
					progress: 0,
				},
			}));

			// 36s time constant: the exponential curve reaches ~63% at 36s,
			// ~95% at ~108s and ~99% at 3 minutes, then holds at 99%.
			const fakeProgress = new FakeProgress({
				timeConstant: 36_000,
				autoStart: true,
			});
			const progressTimer = window.setInterval(() => {
				updateActiveAnalyses((current) => {
					const analysis = current[paper.id];
					if (!analysis) {
						return current;
					}

					return {
						...current,
						[paper.id]: {
							...analysis,
							progress: Math.max(
								analysis.progress,
								Math.min(99, fakeProgress.progress * 100),
							),
						},
					};
				});
			}, 250);

			try {
				const result = await analyzePaper({
					repository,
					paper,
					billingKey,
					onProgress: (stage) => {
						updateActiveAnalyses((current) => {
							const analysis = current[paper.id];
							return analysis
								? {
										...current,
										[paper.id]: { ...analysis, stage },
									}
								: current;
						});
					},
				});
				setPapers((current) => mergePapers(current, [result.paper]));
				fakeProgress.end();
				updateActiveAnalyses((current) => {
					const analysis = current[paper.id];
					return analysis
						? {
								...current,
								[paper.id]: { ...analysis, progress: 100 },
							}
						: current;
				});
				// Hold the 100% state briefly so completion is visible before resetting.
				await new Promise((resolve) => window.setTimeout(resolve, 800));
				new Notice(
					`Analysis saved · ${result.usage.creditsCharged} credit(s) · ${result.usage.remainingCredits} remaining`,
				);
			} catch (error) {
				new Notice(`Could not analyze paper: ${errorMessage(error)}`);
				try {
					setPapers(await repository.listPapers());
				} catch (refreshError) {
					console.error(
						'Could not refresh papers after analysis failure',
						refreshError,
					);
				}
			} finally {
				fakeProgress.stop();
				window.clearInterval(progressTimer);
				updateActiveAnalyses((current) => {
					const { [paper.id]: _completed, ...remaining } = current;
					return remaining;
				});
			}
		},
		[repository, getBillingKey, updateActiveAnalyses],
	);

	const handleDeletePaper = useCallback(
		async (paper: PaperRecord): Promise<void> => {
			if (
				deletingPaperIdRef.current ||
				Object.keys(activeAnalysesRef.current).length > 0
			) {
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
		},
		[repository, confirmDeletePaper],
	);

	const handleToggleStatusMenu = useCallback(
		(paper: PaperRecord, anchor: HTMLButtonElement): void => {
			setFilterMenu(null);
			setStatusMenu((current) =>
				current?.paper.id === paper.id ? null : { paper, anchor },
			);
		},
		[],
	);

	const handleSelectStatus = useCallback(
		async (paper: PaperRecord, status: string): Promise<void> => {
			setStatusMenu(null);
			try {
				const updated = await repository.updatePaperStatus(paper, status);
				setPapers((current) => mergePapers(current, [updated]));
			} catch (error) {
				new Notice(`Could not update status: ${errorMessage(error)}`);
			}
		},
		[repository],
	);

	const handleToggleFilterMenu = useCallback(
		(column: FilterColumn, anchor: HTMLButtonElement): void => {
			setStatusMenu(null);
			setFilterMenu((current) =>
				current?.column === column ? null : { column, anchor },
			);
		},
		[],
	);

	const handleToggleFilterValue = useCallback(
		(column: FilterColumn, value: string): void => {
			setFilters((current) => {
				const selected = new Set(current[column]);
				if (selected.has(value)) {
					selected.delete(value);
				} else {
					selected.add(value);
				}
				return { ...current, [column]: Array.from(selected) };
			});
		},
		[],
	);

	const handleClearFilter = useCallback((column: FilterColumn): void => {
		setFilters((current) => ({ ...current, [column]: [] }));
	}, []);

	const handleUpdateListProperty = useCallback(
		async (
			paper: PaperRecord,
			property: 'authors' | 'keywords',
			values: string[],
		): Promise<void> => {
			try {
				const updates =
					property === 'authors' ? { authors: values } : { keywords: values };
				const updated = await repository.updatePaperProperties(paper, updates);
				setPapers((current) => mergePapers(current, [updated]));
			} catch (error) {
				new Notice(`Could not update ${property}: ${errorMessage(error)}`);
				throw error;
			}
		},
		[repository],
	);

	const columns = useMemo(
		() =>
			paperColumnHelper.columns([
				paperColumnHelper.accessor('title', {
					header: 'Title',
					cell: ({ row }) => (
						<button
							type="button"
							className="paper-manager-title-link"
							title={row.original.originalFilename}
							onClick={() => {
								void repository.openIndex(row.original).catch((error: unknown) => {
									new Notice(`Could not open paper: ${errorMessage(error)}`);
								});
							}}
						>
							{row.original.title}
						</button>
					),
				}),
				paperColumnHelper.accessor('status', {
					header: () => (
						<FilterableColumnHeader
							label="Status"
							activeCount={filters.status.length}
							onClick={(anchor) =>
								handleToggleFilterMenu('status', anchor)
							}
						/>
					),
					cell: ({ row }) => {
						const paper = row.original;
						const isOpen = statusMenuRef.current?.paper.id === paper.id;
						return (
							<button
								type="button"
								className="paper-manager-status-trigger"
								data-status={paper.status}
								data-open={isOpen || undefined}
								title="Change reading status"
								aria-haspopup="menu"
								aria-expanded={isOpen}
								onClick={(event) =>
									handleToggleStatusMenu(paper, event.currentTarget)
								}
							>
								<span className="paper-manager-status-dot" aria-hidden="true" />
								<span>{humanizeStatus(paper.status)}</span>
								<ChevronDown aria-hidden="true" />
							</button>
						);
					},
				}),
				paperColumnHelper.accessor('keywords', {
					header: () => (
						<FilterableColumnHeader
							label="Keywords"
							activeCount={filters.keywords.length}
							onClick={(anchor) =>
								handleToggleFilterMenu('keywords', anchor)
							}
						/>
					),
					cell: ({ row }) => {
						const paper = row.original;
						return (
							<EditableTagCell
								values={paper.keywords}
								label="keywords"
								placeholder="Add keyword"
								onSave={(keywords) =>
									handleUpdateListProperty(paper, 'keywords', keywords)
								}
							/>
						);
					},
				}),
				paperColumnHelper.accessor('year', {
					header: () => (
						<FilterableColumnHeader
							label="Year"
							activeCount={filters.year.length}
							onClick={(anchor) =>
								handleToggleFilterMenu('year', anchor)
							}
						/>
					),
					cell: ({ row }) => (
						<span className="text-muted-foreground">
							{row.original.year ?? '—'}
						</span>
					),
				}),
				paperColumnHelper.accessor('authors', {
					header: () => (
						<FilterableColumnHeader
							label="Authors"
							activeCount={filters.authors.length}
							onClick={(anchor) =>
								handleToggleFilterMenu('authors', anchor)
							}
						/>
					),
					cell: ({ row }) => {
						const paper = row.original;
						return (
							<EditableTagCell
								values={paper.authors}
								label="authors"
								placeholder="Add author"
								onSave={(authors) =>
									handleUpdateListProperty(paper, 'authors', authors)
								}
							/>
						);
					},
				}),
				paperColumnHelper.display({
					id: 'actions',
					header: 'Actions',
					cell: ({ row }) => {
						const paper = row.original;
						const activeAnalyses = activeAnalysesRef.current;
						const analysis = activeAnalyses[paper.id];
						const isActive = analysis !== undefined;
						const isAnalyzed = paper.analyzedAt !== null;
						const isDeleting = deletingPaperIdRef.current === paper.id;
						return (
							<div className="flex items-center gap-1.5">
								<Button
									variant={isAnalyzed ? 'ghost' : 'outline'}
									size="sm"
									disabled={isActive}
									title={
										isAnalyzed
											? 'Analyze again (uses credits)'
											: 'Analyze this PDF (uses credits)'
									}
									onClick={() => void handleAnalyzePaper(paper)}
								>
									{isActive ? (
										<span className="flex flex-col items-center gap-1">
											<span className="flex items-center gap-1.5">
												<LoaderCircle className="animate-spin" />
												<span className="w-10 text-center tabular-nums">
													{Math.round(analysis.progress)}%
												</span>
											</span>
											<span className="h-1 w-16 overflow-hidden rounded-full bg-muted">
												<span
													className="block h-full rounded-full bg-primary transition-[width] duration-500 ease-linear"
													style={{ width: `${analysis.progress}%` }}
												/>
											</span>
										</span>
									) : (
										<>
											<Sparkles />
											{isAnalyzed ? 'Reanalyze' : 'Analyze'}
										</>
									)}
								</Button>
								<Button
									variant="ghost"
									size="icon"
									className="text-muted-foreground hover:text-destructive"
									disabled={
										deletingPaperIdRef.current !== null ||
										Object.keys(activeAnalyses).length > 0
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
							</div>
						);
					},
				}),
			]),
		[
			repository,
			handleAnalyzePaper,
			handleDeletePaper,
			handleUpdateListProperty,
			handleToggleFilterMenu,
			filters,
			statusMenuRef,
			handleToggleStatusMenu,
		],
	);

	const table = useTable({
		features: paperTableFeatures,
		columns,
		data: filteredPapers,
		getRowId: (paper) => paper.id,
	});

	const visibleRows = table.getRowModel().rows;

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
			{statusMenu ? (
				<StatusMenu
					anchor={statusMenu.anchor}
					currentStatus={statusMenu.paper.status}
					onSelect={(status) =>
						void handleSelectStatus(statusMenu.paper, status)
					}
					onClose={() => setStatusMenu(null)}
				/>
			) : null}
			{filterMenu ? (
				<ColumnFilterMenu
					anchor={filterMenu.anchor}
					title={FILTER_LABELS[filterMenu.column]}
					options={filterOptions[filterMenu.column]}
					selectedValues={filters[filterMenu.column]}
					searchable={
						filterMenu.column === 'keywords' ||
						filterMenu.column === 'authors'
					}
					onToggle={(value) =>
						handleToggleFilterValue(filterMenu.column, value)
					}
					onClear={() => handleClearFilter(filterMenu.column)}
					onClose={() => setFilterMenu(null)}
				/>
			) : null}

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
					<Table
						className="paper-manager-library-table"
						containerRef={tableContainerRef}
						onContainerScroll={(event) =>
							updateTableScrollEdges(event.currentTarget)
						}
						data-pinned-left-shadow={tableScrollEdges.left || undefined}
						data-pinned-right-shadow={tableScrollEdges.right || undefined}
					>
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
									<TableRow key={row.id}>
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
					</footer>
				</section>
			</main>
		</div>
	);
}

function FilterableColumnHeader({
	label,
	activeCount,
	onClick,
}: {
	label: string;
	activeCount: number;
	onClick: (anchor: HTMLButtonElement) => void;
}) {
	return (
		<button
			type="button"
			className="paper-manager-filter-header"
			data-active={activeCount > 0 || undefined}
			aria-label={`Filter by ${label}`}
			onClick={(event) => onClick(event.currentTarget)}
		>
			<span>{label}</span>
			{activeCount > 0 ? (
				<span className="paper-manager-filter-header-count">
					{activeCount}
				</span>
			) : null}
			<ListFilter aria-hidden="true" />
		</button>
	);
}

function paperMatchesFilters(
	paper: PaperRecord,
	filters: PaperFilters,
): boolean {
	return (
		(filters.status.length === 0 || filters.status.includes(paper.status)) &&
		(filters.year.length === 0 ||
			(paper.year !== null && filters.year.includes(String(paper.year)))) &&
		(filters.keywords.length === 0 ||
			paper.keywords.some((keyword) => filters.keywords.includes(keyword))) &&
		(filters.authors.length === 0 ||
			paper.authors.some((author) => filters.authors.includes(author)))
	);
}

function buildFilterOptions(
	papers: readonly PaperRecord[],
): Record<FilterColumn, ColumnFilterOption[]> {
	const discoveredStatuses = Array.from(
		new Set(papers.map((paper) => paper.status)),
	);
	const statuses = [
		...PAPER_STATUS_ORDER,
		...discoveredStatuses
			.filter(
				(status) =>
					!PAPER_STATUS_ORDER.includes(
						status as (typeof PAPER_STATUS_ORDER)[number],
					),
			)
			.sort((left, right) => left.localeCompare(right)),
	];

	return {
		status: statuses.map((status) => ({
			value: status,
			label: humanizeStatus(status),
			count: papers.filter((paper) => paper.status === status).length,
		})),
		keywords: buildValueOptions(papers, (paper) => paper.keywords),
		year: Array.from(
			new Set(
				papers.flatMap((paper) =>
					paper.year === null ? [] : [paper.year],
				),
			),
		)
			.sort((left, right) => right - left)
			.map((year) => ({
				value: String(year),
				label: String(year),
				count: papers.filter((paper) => paper.year === year).length,
			})),
		authors: buildValueOptions(papers, (paper) => paper.authors),
	};
}

function buildValueOptions(
	papers: readonly PaperRecord[],
	selectValues: (paper: PaperRecord) => readonly string[],
): ColumnFilterOption[] {
	const counts = new Map<string, number>();
	for (const paper of papers) {
		for (const value of new Set(selectValues(paper))) {
			counts.set(value, (counts.get(value) ?? 0) + 1);
		}
	}

	return Array.from(counts, ([value, count]) => ({ value, label: value, count }))
		.sort((left, right) => left.label.localeCompare(right.label));
}

function columnClassName(columnId: string): string | undefined {
	if (columnId === 'title') {
		return 'paper-manager-pinned-left paper-manager-title-column';
	}
	if (columnId === 'year') {
		return 'paper-manager-year-column';
	}
	if (columnId === 'status') {
		return 'paper-manager-status-column';
	}
	if (columnId === 'keywords') {
		return 'paper-manager-keywords-column';
	}
	if (columnId === 'authors') {
		return 'paper-manager-authors-column';
	}
	if (columnId === 'actions') {
		return 'paper-manager-pinned-right paper-manager-actions-column';
	}

	return undefined;
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
