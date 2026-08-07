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

export function PaperLibraryPage({ repository }: PaperLibraryPageProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [papers, setPapers] = useState<PaperRecord[]>([]);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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

	const allVisibleSelected =
		filteredPapers.length > 0 &&
		filteredPapers.every((paper) => selectedIds.has(paper.id));

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

	function togglePaper(id: string): void {
		setSelectedIds((current) => {
			const next = new Set(current);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}

	function toggleAllVisible(): void {
		setSelectedIds((current) => {
			const next = new Set(current);
			for (const paper of filteredPapers) {
				if (allVisibleSelected) {
					next.delete(paper.id);
				} else {
					next.add(paper.id);
				}
			}
			return next;
		});
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

			<header className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-6 py-5">
				<div className="space-y-1">
					<div className="flex items-center gap-2">
						<h1 className="text-xl font-semibold tracking-tight">Paper library</h1>
						<Badge variant="secondary">MVP</Badge>
					</div>
					<p className="text-sm text-muted-foreground">
						Import, organize, read, and synthesize academic papers.
					</p>
				</div>
				<Button onClick={chooseFiles} disabled={isImporting}>
					{isImporting ? (
						<LoaderCircle className="animate-spin" />
					) : (
						<Upload />
					)}
					{isImporting ? 'Importing…' : 'Import papers'}
				</Button>
			</header>

			<main className="flex flex-1 flex-col gap-4 p-6">
				<div className="flex flex-wrap items-center gap-2">
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

				<section className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xs">
					<Table>
						<TableHeader>
							<TableRow className="hover:bg-transparent">
								<TableHead className="w-10">
									<input
										type="checkbox"
										aria-label="Select all papers"
										className="size-4 accent-[var(--interactive-accent)]"
										checked={allVisibleSelected}
										disabled={filteredPapers.length === 0}
										onChange={toggleAllVisible}
									/>
								</TableHead>
								<TableHead>Title</TableHead>
								<TableHead>Authors</TableHead>
								<TableHead className="w-24">Year</TableHead>
								<TableHead className="w-28">Status</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{isLoading ? (
								<LoadingRow />
							) : filteredPapers.length === 0 ? (
								<EmptyRow hasPapers={papers.length > 0} />
							) : (
								filteredPapers.map((paper) => (
									<PaperRow
										key={paper.id}
										paper={paper}
										selected={selectedIds.has(paper.id)}
										onToggle={() => togglePaper(paper.id)}
										onOpen={() => {
											void repository.openIndex(paper).catch((error: unknown) => {
												new Notice(`Could not open paper: ${errorMessage(error)}`);
											});
										}}
									/>
								))
							)}
						</TableBody>
					</Table>
					<footer className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
						{filteredPapers.length === papers.length
							? `${papers.length} ${papers.length === 1 ? 'paper' : 'papers'}`
							: `${filteredPapers.length} of ${papers.length} papers`}
						{selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ''}
					</footer>
				</section>
			</main>
		</div>
	);
}

function PaperRow({
	paper,
	selected,
	onToggle,
	onOpen,
}: {
	paper: PaperRecord;
	selected: boolean;
	onToggle: () => void;
	onOpen: () => void;
}) {
	return (
		<TableRow>
			<TableCell>
				<input
					type="checkbox"
					aria-label={`Select ${paper.title}`}
					className="size-4 accent-[var(--interactive-accent)]"
					checked={selected}
					onChange={onToggle}
				/>
			</TableCell>
			<TableCell>
				<button
					type="button"
					className="max-w-xl cursor-pointer truncate text-left font-medium text-foreground hover:text-[var(--text-accent)] hover:underline"
					title={paper.originalFilename}
					onClick={onOpen}
				>
					{paper.title}
				</button>
			</TableCell>
			<TableCell className="text-muted-foreground">
				{paper.authors.length > 0 ? paper.authors.join(', ') : '—'}
			</TableCell>
			<TableCell className="text-muted-foreground">{paper.year ?? '—'}</TableCell>
			<TableCell>
				<Badge variant="secondary">{paper.status}</Badge>
			</TableCell>
		</TableRow>
	);
}

function LoadingRow() {
	return (
		<TableRow className="hover:bg-transparent">
			<TableCell colSpan={5} className="h-72 text-center text-muted-foreground">
				<LoaderCircle className="mx-auto size-6 animate-spin" />
			</TableCell>
		</TableRow>
	);
}

function EmptyRow({ hasPapers }: { hasPapers: boolean }) {
	return (
		<TableRow className="hover:bg-transparent">
			<TableCell colSpan={5} className="h-72 text-center">
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
