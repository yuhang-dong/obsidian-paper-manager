import type { ComponentProps, ReactNode } from 'react';
import { CheckCircle2, ChevronDown, Circle, LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Task({ className, ...props }: ComponentProps<'details'>) {
	return (
		<details
			data-slot="ai-task"
			className={cn('group w-full text-sm', className)}
			{...props}
		/>
	);
}

export function TaskTrigger({
	className,
	children,
	...props
}: ComponentProps<'summary'>) {
	return (
		<summary
			data-slot="ai-task-trigger"
			className={cn(
				'flex cursor-pointer list-none items-center gap-2 font-medium text-foreground [&::-webkit-details-marker]:hidden',
				className,
			)}
			{...props}
		>
			{children}
			<ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" />
		</summary>
	);
}

export function TaskContent({ className, ...props }: ComponentProps<'div'>) {
	return (
		<div
			data-slot="ai-task-content"
			className={cn('mt-3 grid gap-2 pl-1', className)}
			{...props}
		/>
	);
}

export function TaskItem({
	className,
	status = 'pending',
	children,
	...props
}: Omit<ComponentProps<'div'>, 'children'> & {
	status?: 'pending' | 'active' | 'complete';
	children: ReactNode;
}) {
	const Icon =
		status === 'complete'
			? CheckCircle2
			: status === 'active'
				? LoaderCircle
				: Circle;

	return (
		<div
			data-slot="ai-task-item"
			className={cn(
				'flex items-center gap-2 text-muted-foreground',
				status === 'active' && 'text-foreground',
				className,
			)}
			{...props}
		>
			<Icon
				className={cn(
					'size-4 shrink-0',
					status === 'active' && 'animate-spin text-primary',
					status === 'complete' && 'text-primary',
				)}
			/>
			<span>{children}</span>
		</div>
	);
}
