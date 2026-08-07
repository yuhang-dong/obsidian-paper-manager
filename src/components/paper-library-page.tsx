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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import type { PaperLibraryRepository } from '@/papers/paper-library-repository';
import type { PaperImportResult, PaperRecord } from '@/papers/types';

interface PaperLibraryPageProps {
	repository: PaperLibraryRepository;
}

const paperTableFeatures = tableFeatures({ rowSelectionFeature });
const paperColumnHelper = createColumnHelper<
	typeof paperTableFeatures,
	PaperRecord
>();

export function PaperLibraryPage({ repository }: PaperLibraryPageProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [papers, setPapers] = useState<PaperRecord[]>([]);
	const [query, setQuery] = useState('');
	const [isLoading, setIsLoading] = useState(true);
	const [isImporting, setIsImporting] = useState(false);

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
			]),
		[repository],
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
