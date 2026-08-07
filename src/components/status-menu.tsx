import {
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import {
	PAPER_STATUS_ORDER,
	humanizeStatus,
} from '@/papers/paper-status';

interface StatusMenuProps {
	anchor: HTMLElement;
	currentStatus: string;
	onSelect: (status: string) => void;
	onClose: () => void;
}

const MENU_WIDTH = 168;
const MENU_MAX_HEIGHT = 180;
const MENU_MARGIN = 4;

export function StatusMenu({
	anchor,
	currentStatus,
	onSelect,
	onClose,
}: StatusMenuProps) {
	const panelRef = useRef<HTMLDivElement>(null);
	const [position, setPosition] = useState<{
		top: number;
		left: number;
	} | null>(null);

	function updatePosition(): void {
		const rect = anchor.getBoundingClientRect();
		const top = Math.max(
			MENU_MARGIN,
			Math.min(
				rect.bottom + MENU_MARGIN,
				window.innerHeight - MENU_MARGIN - MENU_MAX_HEIGHT,
			),
		);
		const left = Math.max(
			MENU_MARGIN,
			Math.min(
				rect.left,
				window.innerWidth - MENU_WIDTH - MENU_MARGIN,
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
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as Node;
			if (!panelRef.current?.contains(target) && target !== anchor) {
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
	}, [onClose, anchor]);

	if (!position) {
		return null;
	}

	return createPortal(
		<div
			ref={panelRef}
			className="fixed z-50 w-42 overflow-hidden rounded-lg border border-border bg-card py-1 text-foreground shadow-lg"
			style={{ top: position.top, left: position.left }}
		>
			{PAPER_STATUS_ORDER.map((status) => (
				<button
					key={status}
					type="button"
					className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
					onClick={() => onSelect(status)}
				>
					<span className="flex-1">{humanizeStatus(status)}</span>
					{status === currentStatus ? (
						<Check className="size-3.5 text-primary" />
					) : null}
				</button>
			))}
		</div>,
		document.body,
	);
}
