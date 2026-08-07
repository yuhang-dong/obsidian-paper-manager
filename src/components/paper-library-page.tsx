import {
	Columns3,
	FileText,
	Search,
	SlidersHorizontal,
	Upload,
} from 'lucide-react';
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

export function PaperLibraryPage() {
	return (
		<div className="flex min-h-full flex-col bg-background text-foreground">
			<header className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-6 py-5">
				<div className="space-y-1">
					<div className="flex items-center gap-2">
						<h1 className="text-xl font-semibold tracking-tight">Paper library</h1>
						<Badge variant="secondary">MVP scaffold</Badge>
					</div>
					<p className="text-sm text-muted-foreground">
						Import, organize, read, and synthesize academic papers.
					</p>
				</div>
				<Button disabled title="PDF import will be implemented next">
					<Upload />
					Import papers
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
							disabled
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
										disabled
									/>
								</TableHead>
								<TableHead>Title</TableHead>
								<TableHead>Authors</TableHead>
								<TableHead className="w-24">Year</TableHead>
								<TableHead className="w-28">Status</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							<TableRow className="hover:bg-transparent">
								<TableCell colSpan={5} className="h-72 text-center">
									<div className="mx-auto flex max-w-sm flex-col items-center gap-3 text-muted-foreground">
										<div className="rounded-full bg-muted p-3">
											<FileText className="size-6" />
										</div>
										<div className="space-y-1">
											<p className="font-medium text-foreground">No papers yet</p>
											<p className="text-sm">
												The React view is ready for the PDF import pipeline.
											</p>
										</div>
									</div>
								</TableCell>
							</TableRow>
						</TableBody>
					</Table>
					<footer className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
						0 papers
					</footer>
				</section>
			</main>
		</div>
	);
}
