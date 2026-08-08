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

const MENU_WIDTH = 180;
const MENU_HEIGHT = 116;
const MENU_GAP = 6;
const VIEWPORT_MARGIN = 8;

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
		const fitsBelow =
			rect.bottom + MENU_GAP + MENU_HEIGHT <=
			window.innerHeight - VIEWPORT_MARGIN;
		const preferredTop = fitsBelow
			? rect.bottom + MENU_GAP
			: rect.top - MENU_GAP - MENU_HEIGHT;
		const top = Math.max(
			VIEWPORT_MARGIN,
			Math.min(
				preferredTop,
				window.innerHeight - VIEWPORT_MARGIN - MENU_HEIGHT,
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
	}, [onClose, anchor]);

	if (!position) {
		return null;
	}

	return createPortal(
		<div
			ref={panelRef}
			className="paper-manager-status-menu"
			style={{ top: position.top, left: position.left }}
			role="menu"
			aria-label="Reading status"
		>
			{PAPER_STATUS_ORDER.map((status) => {
				const isSelected = status === currentStatus;
				return (
					<button
						key={status}
						type="button"
						className="paper-manager-status-option"
						data-status={status}
						data-selected={isSelected || undefined}
						role="menuitemradio"
						aria-checked={isSelected}
						onClick={() => onSelect(status)}
					>
						<span className="paper-manager-status-dot" aria-hidden="true" />
						<span className="paper-manager-status-label">
							{humanizeStatus(status)}
						</span>
						{isSelected ? (
							<Check className="paper-manager-status-check" aria-hidden="true" />
						) : null}
					</button>
				);
			})}
		</div>,
		document.body,
	);
}
