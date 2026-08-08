import type {
	ComponentProps,
	Ref,
	UIEventHandler,
} from 'react';
import { cn } from '@/lib/utils';

interface TableProps extends ComponentProps<'table'> {
	containerRef?: Ref<HTMLDivElement>;
	onContainerScroll?: UIEventHandler<HTMLDivElement>;
}

export function Table({
	className,
	containerRef,
	onContainerScroll,
	...props
}: TableProps) {
	return (
		<div
			ref={containerRef}
			data-slot="table-container"
			className="relative w-full overflow-x-auto"
			onScroll={onContainerScroll}
		>
			<table
				data-slot="table"
				className={cn('w-full caption-bottom text-sm', className)}
				{...props}
			/>
		</div>
	);
}

export function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
	return (
		<thead
			data-slot="table-header"
			className={cn('[&_tr]:border-b', className)}
			{...props}
		/>
	);
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
	return (
		<tbody
			data-slot="table-body"
			className={cn('[&_tr:last-child]:border-0', className)}
			{...props}
		/>
	);
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
	return (
		<tr
			data-slot="table-row"
			className={cn(
				'border-b transition-colors hover:bg-muted/40 data-[state=selected]:bg-muted',
				className,
			)}
			{...props}
		/>
	);
}

export function TableHead({ className, ...props }: ComponentProps<'th'>) {
	return (
		<th
			data-slot="table-head"
			className={cn(
				'h-10 px-3 text-left align-middle text-xs font-medium text-muted-foreground whitespace-nowrap',
				className,
			)}
			{...props}
		/>
	);
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
	return (
		<td
			data-slot="table-cell"
			className={cn('p-3 align-middle', className)}
			{...props}
		/>
	);
}
