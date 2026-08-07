import {
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type RefObject,
	type SyntheticEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff, Lock, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
	OBSIDIAN_PROPERTY_TYPES,
	SPECIAL_COLUMN_IDS,
	type LibraryColumnMeta,
} from '@/library/column-config';
import type { ObsidianPropertyType } from '@/papers/paper-property-schema';

interface ColumnsPanelProps {
	anchorRef: RefObject<HTMLDivElement | null>;
	columns: LibraryColumnMeta[];
	existingIds: readonly string[];
	visibility: Readonly<Record<string, boolean>>;
	onClose: () => void;
	onToggleVisibility: (id: string) => void;
	onAddCustom: (property: string, type: ObsidianPropertyType) => void;
	onRemoveCustom: (id: string) => void;
	onShowAll: () => void;
}

const PANEL_WIDTH = 288;
const PANEL_MAX_HEIGHT = 384;
const PANEL_MARGIN = 8;

export function ColumnsPanel({
	anchorRef,
	columns,
	existingIds,
	visibility,
	onClose,
	onToggleVisibility,
	onAddCustom,
	onRemoveCustom,
	onShowAll,
}: ColumnsPanelProps) {
	const panelRef = useRef<HTMLDivElement>(null);
	const [position, setPosition] = useState<{
		top: number;
		left: number;
	} | null>(null);
	const [property, setProperty] = useState('');
	const [type, setType] = useState<ObsidianPropertyType>('text');
	const [error, setError] = useState('');

	function updatePosition(): void {
		const anchor = anchorRef.current;
		if (!anchor) {
			return;
		}

		const rect = anchor.getBoundingClientRect();
		const top = Math.max(
			PANEL_MARGIN,
			Math.min(
				rect.bottom + PANEL_MARGIN,
				window.innerHeight - PANEL_MARGIN - PANEL_MAX_HEIGHT,
			),
		);
		const left = Math.max(
			PANEL_MARGIN,
			Math.min(
				rect.right - PANEL_WIDTH,
				window.innerWidth - PANEL_WIDTH - PANEL_MARGIN,
			),
		);
		setPosition({ top, left });
	}

	useLayoutEffect(() => {
		updatePosition();
	}, [anchorRef]);

	useEffect(() => {
		updatePosition();
		window.addEventListener('resize', updatePosition);
		window.addEventListener('scroll', updatePosition, true);
		return () => {
			window.removeEventListener('resize', updatePosition);
			window.removeEventListener('scroll', updatePosition, true);
		};
	}, [anchorRef]);

	useEffect(() => {
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as Node;
			const insidePanel = panelRef.current?.contains(target) ?? false;
			const insideAnchor = anchorRef.current?.contains(target) ?? false;
			if (
				!insidePanel &&
				!insideAnchor
			) {
				onClose();
			}
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onClose();
			}
		};

		document.addEventListener('pointerdown', onPointerDown);
		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown);
			document.removeEventListener('keydown', onKeyDown);
		};
	}, [onClose, anchorRef]);

	function handleSubmit(event: SyntheticEvent): void {
		event.preventDefault();
		const trimmed = property.trim();
		if (!trimmed) {
			setError('Enter a property name.');
			return;
		}
		if (existingIds.includes(trimmed)) {
			setError(`Column "${trimmed}" already exists.`);
			return;
		}

		onAddCustom(trimmed, type);
		setProperty('');
		setType('text');
		setError('');
	}

	if (!position) {
		return null;
	}

	return createPortal(
		<div
			ref={panelRef}
			className="fixed z-50 w-72 overflow-hidden rounded-lg border border-border bg-card text-foreground shadow-lg"
			style={{ top: position.top, left: position.left }}
		>
			<div className="flex items-center justify-between border-b border-border px-3 py-2">
				<span className="text-sm font-medium">Columns</span>
				<button
					type="button"
					className="text-xs text-muted-foreground hover:text-foreground"
					onClick={onShowAll}
				>
					Show all
				</button>
			</div>

			<ul className="max-h-96 overflow-y-auto px-3 py-1">
				{columns.map((column) => {
					const isVisible =
						visibility[column.id] ?? column.defaultVisible;
					const isCustom = column.kind === 'custom';
					const isAlwaysVisible = column.id === SPECIAL_COLUMN_IDS.select;

					return (
						<li
							key={column.id}
							className="flex items-center gap-1.5 border-b border-border py-1.5 last:border-0"
						>
							{isAlwaysVisible ? (
								<span
									title="Always visible"
									aria-label="Always visible"
									className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-primary"
								>
									<Eye className="size-4" />
								</span>
							) : isVisible ? (
								<button
									type="button"
									title="Hide column"
									aria-label={`Hide ${column.label || column.id}`}
									className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
									onClick={() => onToggleVisibility(column.id)}
								>
									<Eye className="size-4" />
								</button>
							) : (
								<button
									type="button"
									title="Show column"
									aria-label={`Show ${column.label || column.id}`}
									className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
									onClick={() => onToggleVisibility(column.id)}
								>
									<EyeOff className="size-4" />
								</button>
							)}
							<span className="flex min-w-0 flex-1 items-center gap-1">
								<span className="truncate text-sm">
									{column.label || column.id}
								</span>
								{column.lockedType ? (
									<Lock
										className="size-3 shrink-0 text-muted-foreground"
										aria-label="Type locked"
									/>
								) : null}
							</span>
							{isCustom ? (
								<button
									type="button"
									title="Remove column"
									aria-label={`Remove ${column.label || column.id}`}
									className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
									onClick={() => onRemoveCustom(column.id)}
								>
									<Trash2 className="size-4" />
								</button>
							) : null}
						</li>
					);
				})}
			</ul>

			<form
				className="flex items-center gap-1.5 border-t border-border px-3 py-2"
				onSubmit={handleSubmit}
			>
				<Input
					value={property}
					placeholder="Property name"
					className="h-8"
					onChange={(event) => setProperty(event.target.value)}
				/>
				<select
					aria-label="New column type"
					className="h-8 shrink-0 rounded-md border border-input bg-transparent px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
					value={type}
					onChange={(event) =>
						setType(event.target.value as ObsidianPropertyType)
					}
				>
					{OBSIDIAN_PROPERTY_TYPES.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
				<Button type="submit" size="sm" className="shrink-0">
					<Plus />
					Add
				</Button>
			</form>
			{error ? (
				<p className="border-t border-border px-3 py-1.5 text-xs text-destructive">
					{error}
				</p>
			) : null}
		</div>,
		document.body,
	);
}
