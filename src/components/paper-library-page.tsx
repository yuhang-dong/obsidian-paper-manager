import {
	type ChangeEvent,
	type CSSProperties,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import {
	Check,
	Columns3,
	FileText,
	LoaderCircle,
	Search,
	SlidersHorizontal,
	Sparkles,
	Trash2,
	Upload,
	X,
} from 'lucide-react';
import { Notice } from 'obsidian';
import {
	type Column,
	columnSizingFeature,
	columnVisibilityFeature,
	createColumnHelper,
	rowSelectionFeature,
	tableFeatures,
	useTable,
} from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ColumnsPanel } from '@/components/columns-panel';
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
	LITERATURE_TYPE_OPTIONS,
	type ObsidianPropertyType,
} from '@/papers/paper-property-schema';
import type { LibraryTableSettings } from '@/settings';
import {
	SPECIAL_COLUMN_IDS,
	buildLibraryColumns,
	cloneLibraryTableSettings,
	formatPropertyValue,
	stringifyPropertyValue,
	type LibraryColumnMeta,
} from '@/library/column-config';
import FakeProgress from 'fake-progress';

interface PaperLibraryPageProps {
	repository: PaperLibraryRepository;
	getBillingKey: () => string;
	confirmDeletePaper: (paper: PaperRecord) => Promise<boolean>;
	initialTableSettings: LibraryTableSettings;
	saveTableSettings: (settings: LibraryTableSettings) => Promise<void>;
}

interface ActivePaperAnalysis {
	paperId: string;
	title: string;
	stage: PaperAnalysisStage;
	progress: number;
}

const paperTableFeatures = tableFeatures({
	rowSelectionFeature,
	columnVisibilityFeature,
	columnSizingFeature,
});

const paperColumnHelper = createColumnHelper<
	typeof paperTableFeatures,
	PaperRecord
>();

type PaperColumn = Column<typeof paperTableFeatures, PaperRecord, unknown>;

export function PaperLibraryPage({
	repository,
	getBillingKey,
	confirmDeletePaper,
	initialTableSettings,
	saveTableSettings,
}: PaperLibraryPageProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [papers, setPapers] = useState<PaperRecord[]>([]);
	const [query, setQuery] = useState('');
	const [isLoading, setIsLoading] = useState(true);
	const [isImporting, setIsImporting] = useState(false);
	const [activeAnalysis, setActiveAnalysis] =
		useState<ActivePaperAnalysis | null>(null);
	const [deletingPaperId, setDeletingPaperId] = useState<string | null>(null);
	const [tableSettings, setTableSettings] = useState<LibraryTableSettings>(() =>
		cloneLibraryTableSettings(initialTableSettings),
	);
	const [columnsOpen, setColumnsOpen] = useState(false);
	const columnsToolbarRef = useRef<HTMLDivElement>(null);
	const activeAnalysisRef = useRef<ActivePaperAnalysis | null>(null);
	activeAnalysisRef.current = activeAnalysis;
	const deletingPaperIdRef = useRef<string | null>(null);
	deletingPaperIdRef.current = deletingPaperId;

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

		return papers.filter((paper) =>
			paperSearchText(paper).includes(normalizedQuery),
		);
	}, [papers, query]);

	const libraryColumns = useMemo(
		() => buildLibraryColumns(papers, tableSettings),
		[papers, tableSettings],
	);

	const allColumnIds = useMemo(
		() => libraryColumns.map((column) => column.id),
		[libraryColumns],
	);

	const handleToggleVisibility = useCallback((id: string): void => {
		if (id === SPECIAL_COLUMN_IDS.select) {
			return;
		}
		const defaultVisible =
			libraryColumns.find((column) => column.id === id)?.defaultVisible ??
			true;
		setTableSettings((current) => {
			const visibility = { ...current.visibility };
			visibility[id] = !(current.visibility[id] ?? defaultVisible);
			return { ...current, visibility };
		});
	}, [libraryColumns]);

	const handleAddCustom = useCallback(
		(property: string, type: ObsidianPropertyType): void => {
			setTableSettings((current) => {
				if (
					allColumnIds.includes(property) ||
					current.customColumns.some((column) => column.property === property)
				) {
					return current;
				}
				return {
					...current,
					customColumns: [...current.customColumns, { property, type }],
				};
			});
		},
		[allColumnIds],
	);

	const handleRemoveCustom = useCallback((id: string): void => {
		setTableSettings((current) => {
			const visibility = { ...current.visibility };
			delete visibility[id];
			return {
				...current,
				visibility,
				customColumns: current.customColumns.filter(
					(column) => column.property !== id,
				),
			};
		});
	}, []);

	const handleShowAll = useCallback((): void => {
		setTableSettings((current) => ({
			...current,
			visibility: Object.fromEntries(
				allColumnIds.map((id) => [id, true]),
			),
		}));
	}, [allColumnIds]);

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
			if (activeAnalysisRef.current) {
				return;
			}

			const billingKey = getBillingKey().trim();
			if (!billingKey) {
				new Notice(
					'Add your paper manager billing key in plugin settings first.',
				);
				return;
			}

			setActiveAnalysis({
				paperId: paper.id,
				title: paper.title,
				stage: 'reading_pdf',
				progress: 0,
			});

			// 36s time constant: the exponential curve reaches ~63% at 36s,
			// ~95% at ~108s and ~99% at 3 minutes, then holds at 99%.
			const fakeProgress = new FakeProgress({
				timeConstant: 36_000,
				autoStart: true,
			});
			const progressTimer = window.setInterval(() => {
				setActiveAnalysis((current) => {
					if (current?.paperId !== paper.id) {
						return current;
					}

					return {
						...current,
						progress: Math.max(
							current.progress,
							Math.min(99, fakeProgress.progress * 100),
						),
					};
				});
			}, 250);

			try {
				const result = await analyzePaper({
					repository,
					paper,
					billingKey,
					onProgress: (stage) => {
						setActiveAnalysis((current) =>
							current?.paperId === paper.id
								? { ...current, stage }
								: current,
						);
					},
				});
				setPapers((current) => mergePapers(current, [result.paper]));
				fakeProgress.end();
				setActiveAnalysis((current) =>
					current?.paperId === paper.id
						? { ...current, progress: 100 }
						: current,
				);
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
				setActiveAnalysis(null);
			}
		},
		[repository, getBillingKey],
	);

	const handleDeletePaper = useCallback(
		async (paper: PaperRecord): Promise<void> => {
			if (deletingPaperIdRef.current || activeAnalysisRef.current) {
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

	const columns = useMemo(
		() =>
			paperColumnHelper.columns(
				libraryColumns.map((column) => {
					if (column.id === SPECIAL_COLUMN_IDS.select) {
						return paperColumnHelper.display({
							id: column.id,
							size: column.size,
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
						});
					}

					if (column.id === SPECIAL_COLUMN_IDS.actions) {
						return paperColumnHelper.display({
							id: column.id,
							size: column.size,
						header: () => <ColumnHeaderLabel label={column.label} />,
						cell: ({ row }) => {
							const paper = row.original;
							const analysis = activeAnalysisRef.current;
							const isActive =
								analysis?.paperId === paper.id;
							const isAnotherActive =
								analysis !== null && !isActive;
							const isComplete = paper.aiStatus === 'completed';
							const isDeleting =
								deletingPaperIdRef.current === paper.id;

								return (
									<div className="flex items-center gap-1.5">
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
															style={{
																width: `${analysis.progress}%`,
															}}
														/>
													</span>
												</span>
											) : (
												<>
													<Sparkles />
													{isComplete
														? 'Reanalyze'
														: paper.aiStatus === 'failed'
															? 'Retry'
															: 'Analyze'}
												</>
											)}
										</Button>
										<Button
											variant="ghost"
											size="icon"
											className="shrink-0 text-muted-foreground hover:text-destructive"
											disabled={
												deletingPaperIdRef.current !== null ||
												analysis !== null
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
						});
					}

					return paperColumnHelper.accessor(
						(paper) => paper.properties[column.id],
						{
							id: column.id,
							size: column.size,
							header: () => <ColumnHeaderLabel label={column.label} />,
							cell: ({ row }) =>
								renderPropertyCell(column, row.original, repository),
						},
					);
				}),
			),
		[
			libraryColumns,
			repository,
			handleAnalyzePaper,
			handleDeletePaper,
		],
	);

	const table = useTable(
		{
			features: paperTableFeatures,
			columns,
			data: filteredPapers,
			getRowId: (paper) => paper.id,
			initialState: {
				columnVisibility: resolveColumnVisibility(
					tableSettings.visibility,
					libraryColumns,
				),
			},
		},
		(state) => ({
			columnVisibility: state.columnVisibility,
			rowSelection: state.rowSelection,
		}),
	);

	// Push user layout changes (settings) into the table state.
	useEffect(() => {
		if (isLoading) {
			return;
		}

		const nextVisibility = resolveColumnVisibility(
			tableSettings.visibility,
			libraryColumns,
		);
		if (!visibilityEqual(table.state.columnVisibility, nextVisibility)) {
			table.setColumnVisibility(nextVisibility);
		}
	}, [isLoading, tableSettings.visibility, table.state.columnVisibility, table]);

	// Persist layout settings.
	useEffect(() => {
		void saveTableSettings(tableSettings);
	}, [tableSettings, saveTableSettings]);

	const visibleRows = table.getRowModel().rows;
	const selectedCount = Object.keys(table.state.rowSelection).length;

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
							<div ref={columnsToolbarRef} className="relative">
								<Button
									variant="outline"
									onClick={() => setColumnsOpen((open) => !open)}
								>
									<Columns3 />
									Columns
								</Button>
								{columnsOpen ? (
									<ColumnsPanel
										anchorRef={columnsToolbarRef}
										columns={libraryColumns}
										existingIds={allColumnIds}
										visibility={tableSettings.visibility}
										onClose={() => setColumnsOpen(false)}
										onToggleVisibility={handleToggleVisibility}
										onAddCustom={handleAddCustom}
										onRemoveCustom={handleRemoveCustom}
										onShowAll={handleShowAll}
									/>
								) : null}
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
					<Table className="table-fixed">
						<TableHeader>
							{table.getHeaderGroups().map((headerGroup) => (
								<TableRow
									key={headerGroup.id}
									className="group hover:bg-transparent"
								>
									{headerGroup.headers.map((header) => (
										<TableHead
											key={header.id}
											className="bg-card"
											style={cellStyle(header.column)}
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
										data-state={
											row.getIsSelected() ? 'selected' : undefined
										}
										className="group"
									>
										{row.getVisibleCells().map((cell) => (
											<TableCell
												key={cell.id}
												style={cellStyle(cell.column)}
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

function ColumnHeaderLabel({
	label,
}: {
	label: string;
}) {
	return <span className="block truncate">{label}</span>;
}

function renderPropertyCell(
	column: LibraryColumnMeta,
	paper: PaperRecord,
	repository: PaperLibraryRepository,
): ReactNode {
	if (column.id === 'title') {
		return (
			<button
				type="button"
				className="block max-w-full cursor-pointer truncate text-left font-medium text-foreground hover:text-[var(--text-accent)] hover:underline"
				title={paper.originalFilename}
				onClick={() => {
					void repository
						.openIndex(paper)
						.catch((error: unknown) => {
							new Notice(
								`Could not open paper: ${errorMessage(error)}`,
							);
						});
				}}
			>
				{paper.title}
			</button>
		);
	}

	if (column.id === 'status') {
		return <Badge variant="secondary">{humanizeStatus(paper.status)}</Badge>;
	}

	if (column.id === 'ai_status') {
		const variant =
			paper.aiStatus === 'completed'
				? 'default'
				: paper.aiStatus === 'failed'
					? 'outline'
					: 'secondary';
		return <Badge variant={variant}>{humanizeStatus(paper.aiStatus)}</Badge>;
	}

	if (column.id === 'literature_type' && paper.literatureType) {
		const option = LITERATURE_TYPE_OPTIONS.find(
			(candidate) => candidate.value === paper.literatureType,
		);
		return (
			<span className="block truncate">
				{option?.label ?? paper.literatureType}
			</span>
		);
	}

	return (
		<PropertyValueCell
			value={paper.properties[column.id]}
			type={column.type}
		/>
	);
}

function PropertyValueCell({
	value,
	type,
}: {
	value: unknown;
	type: ObsidianPropertyType;
}) {
	if (
		value === null ||
		value === undefined ||
		value === '' ||
		(Array.isArray(value) && value.length === 0)
	) {
		return <span className="block text-muted-foreground">—</span>;
	}

	if (type === 'checkbox') {
		return value ? (
			<Check className="size-4 text-primary" />
		) : (
			<X className="size-4 text-muted-foreground" />
		);
	}

	if (type === 'number') {
		return (
			<span className="block truncate text-right font-mono tabular-nums">
				{formatPropertyValue(value, type)}
			</span>
		);
	}

	if (type === 'list') {
		return (
			<span className="block truncate text-muted-foreground">
				{formatPropertyValue(value, type)}
			</span>
		);
	}

	return <span className="block truncate">{formatPropertyValue(value, type)}</span>;
}

function cellStyle(column: PaperColumn): CSSProperties {
	return { width: column.getSize() };
}

function humanizeStatus(value: string): string {
	return value
		.replace(/_/g, ' ')
		.replace(/\bai\b/gi, 'AI')
		.replace(/^\w/, (character) => character.toUpperCase());
}

function paperSearchText(paper: PaperRecord): string {
	const values: string[] = [
		paper.title,
		paper.originalFilename,
		...paper.authors,
	];

	for (const value of Object.values(paper.properties)) {
		if (Array.isArray(value)) {
			for (const item of value) {
				if (item !== null && item !== undefined) {
					values.push(stringifyPropertyValue(item));
				}
			}
		} else if (value !== null && value !== undefined) {
			values.push(stringifyPropertyValue(value));
		}
	}

	return values.join(' ').toLocaleLowerCase();
}

function visibilityEqual(
	left: Readonly<Record<string, boolean>>,
	right: Readonly<Record<string, boolean>>,
): boolean {
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length) {
		return false;
	}
	return leftKeys.every((key) => left[key] === right[key]);
}

function resolveColumnVisibility(
	overrides: Readonly<Record<string, boolean>>,
	columns: readonly LibraryColumnMeta[],
): Record<string, boolean> {
	const next: Record<string, boolean> = {};
	for (const column of columns) {
		if (column.id === SPECIAL_COLUMN_IDS.select) {
			continue;
		}
		const explicit = overrides[column.id];
		if (explicit === true) {
			continue;
		}
		if (explicit === false || !column.defaultVisible) {
			next[column.id] = false;
		}
	}
	return next;
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
