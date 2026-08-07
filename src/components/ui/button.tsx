import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
	'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors outline-none disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring/60 [&_svg]:pointer-events-none [&_svg]:size-4',
	{
		variants: {
			variant: {
				default:
					'bg-primary text-primary-foreground shadow-xs hover:brightness-110',
				outline:
					'border border-border bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground',
				secondary:
					'bg-secondary text-secondary-foreground hover:brightness-95',
				ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
				destructive:
					'bg-destructive text-destructive-foreground hover:brightness-110',
			},
			size: {
				default: 'h-9 px-4 py-2',
				sm: 'h-8 gap-1.5 px-3 text-xs',
				icon: 'size-9',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
);

export function Button({
	className,
	variant,
	size,
	type = 'button',
	...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants>) {
	return (
		<button
			data-slot="button"
			type={type}
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}
