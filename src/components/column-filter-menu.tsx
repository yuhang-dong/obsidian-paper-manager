import {
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { Check, Search } from 'lucide-react';
import { createPortal } from 'react-dom';

export interface ColumnFilterOption {
	value: string;
	label: string;
	count: number;
}

interface ColumnFilterMenuProps {
	anchor: HTMLElement;
	title: string;
	options: readonly ColumnFilterOption[];
	selectedValues: readonly string[];
	searchable: boolean;
	onToggle: (value: string) => void;
	onClear: () => void;
	onClose: () => void;
}

const MENU_WIDTH = 260;
const MENU_MAX_HEIGHT = 340;
const MENU_GAP = 6;
const VIEWPORT_MARGIN = 8;

export function ColumnFilterMenu({
	anchor,
	title,
	options,
	selectedValues,
	searchable,
	onToggle,
	onClear,
	onClose,
}: ColumnFilterMenuProps) {
	const panelRef = useRef<HTMLDivElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState('');
	const [position, setPosition] = useState<{
		top: number;
		left: number;
	} | null>(null);
	const selected = useMemo(() => new Set(selectedValues), [selectedValues]);
	const filteredOptions = useMemo(() => {
		const normalizedQuery = query.trim().toLocaleLowerCase();
		if (!normalizedQuery) {
			return options;
		}
		return options.filter((option) =>
			option.label.toLocaleLowerCase().includes(normalizedQuery),
		);
	}, [options, query]);

	function updatePosition(): void {
		const rect = anchor.getBoundingClientRect();
		const fitsBelow =
			rect.bottom + MENU_GAP + MENU_MAX_HEIGHT <=
			window.innerHeight - VIEWPORT_MARGIN;
		const preferredTop = fitsBelow
			? rect.bottom + MENU_GAP
			: rect.top - MENU_GAP - MENU_MAX_HEIGHT;
		const top = Math.max(
			VIEWPORT_MARGIN,
			Math.min(
				preferredTop,
				window.innerHeight - VIEWPORT_MARGIN - MENU_MAX_HEIGHT,
			),
		);
		const left = Math.max(
			VIEWPORT_MARGIN,
			Math.min(
				rect.left,
				window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN,
			),
		);
		setPosition({ top, left });
	}

	useLayoutEffect(() => {
		updatePosition();
	}, [anchor]);

	useEffect(() => {
		updatePosition();
		window.addEventListener('resize', updatePosition);
		window.addEventListener('scroll', updatePosition, true);
		return () => {
			window.removeEventListener('resize', updatePosition);
			window.removeEventListener('scroll', updatePosition, true);
		};
	}, [anchor]);

	useEffect(() => {
		if (searchable && position) {
			searchRef.current?.focus();
		}
	}, [searchable, position]);

	useEffect(() => {
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as Node;
			if (!panelRef.current?.contains(target) && !anchor.contains(target)) {
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
	}, [anchor, onClose]);

	if (!position) {
		return null;
	}

	return createPortal(
		<div
			ref={panelRef}
			className="paper-manager-column-filter-menu"
			style={{ top: position.top, left: position.left }}
			role="dialog"
			aria-label={`Filter by ${title}`}
		>
			<div className="paper-manager-column-filter-heading">
				<span>{title}</span>
				<button
					type="button"
					disabled={selectedValues.length === 0}
					onClick={onClear}
				>
					Clear
				</button>
			</div>
			{searchable ? (
				<label className="paper-manager-column-filter-search">
					<Search aria-hidden="true" />
					<input
						ref={searchRef}
						type="text"
						value={query}
						placeholder={`Search ${title.toLocaleLowerCase()}`}
						aria-label={`Search ${title}`}
						onChange={(event) => setQuery(event.target.value)}
					/>
				</label>
			) : null}
			<div className="paper-manager-column-filter-options">
				{filteredOptions.length > 0 ? (
					filteredOptions.map((option) => {
						const isSelected = selected.has(option.value);
						return (
							<button
								key={option.value}
								type="button"
								className="paper-manager-column-filter-option"
								data-selected={isSelected || undefined}
								aria-pressed={isSelected}
								onClick={() => onToggle(option.value)}
							>
								<span className="paper-manager-column-filter-check">
									{isSelected ? <Check aria-hidden="true" /> : null}
								</span>
								<span className="paper-manager-column-filter-label">
									{option.label}
								</span>
								<span className="paper-manager-column-filter-count">
									{option.count}
								</span>
							</button>
						);
					})
				) : (
					<p className="paper-manager-column-filter-empty">No matches</p>
				)}
			</div>
		</div>,
		document.body,
	);
}
