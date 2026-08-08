import {
	type FocusEvent,
	type KeyboardEvent,
	useEffect,
	useRef,
	useState,
} from 'react';
import { X } from 'lucide-react';

interface EditableTagCellProps {
	values: readonly string[];
	label: string;
	placeholder: string;
	onSave: (values: string[]) => Promise<void>;
}

export function EditableTagCell({
	values,
	label,
	placeholder,
	onSave,
}: EditableTagCellProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const finishingRef = useRef(false);
	const [isEditing, setIsEditing] = useState(false);
	const [tags, setTags] = useState<string[]>(() => [...values]);
	const [draft, setDraft] = useState('');

	useEffect(() => {
		setTags([...values]);
	}, [values]);

	useEffect(() => {
		if (isEditing) {
			inputRef.current?.focus();
		}
	}, [isEditing]);

	function startEditing(): void {
		finishingRef.current = false;
		setTags([...values]);
		setDraft('');
		setIsEditing(true);
	}

	function addDraft(currentTags: readonly string[] = tags): string[] {
		const value = draft.trim();
		if (!value || includesTag(currentTags, value)) {
			setDraft('');
			return [...currentTags];
		}

		const next = [...currentTags, value];
		setTags(next);
		setDraft('');
		return next;
	}

	async function finishEditing(save: boolean): Promise<void> {
		if (finishingRef.current) {
			return;
		}
		finishingRef.current = true;

		const nextTags = save ? addDraft() : [...values];
		setIsEditing(false);
		setDraft('');

		if (save && !sameTags(values, nextTags)) {
			try {
				await onSave(nextTags);
			} catch {
				setTags([...values]);
			}
		} else if (!save) {
			setTags([...values]);
		}
	}

	function handleBlur(event: FocusEvent<HTMLDivElement>): void {
		const nextFocus = event.relatedTarget;
		if (nextFocus instanceof Node && event.currentTarget.contains(nextFocus)) {
			return;
		}
		void finishEditing(true);
	}

	function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
		if (event.key === 'Enter') {
			if (event.nativeEvent.isComposing) {
				return;
			}
			event.preventDefault();
			addDraft();
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			void finishEditing(false);
		}
	}

	if (!isEditing) {
		const text = tags.join(', ');
		return (
			<button
				type="button"
				className="paper-manager-tag-cell-trigger"
				title={text || `Edit ${label}`}
				onClick={startEditing}
			>
				{text || '—'}
			</button>
		);
	}

	return (
		<div
			className="paper-manager-tag-editor"
			onBlur={handleBlur}
			aria-label={`Edit ${label}`}
		>
			{tags.map((tag, index) => (
				<span key={`${tag}-${index}`} className="paper-manager-tag-chip">
					<span>{tag}</span>
					<button
						type="button"
						aria-label={`Remove ${tag}`}
						onClick={() =>
							setTags((current) =>
								current.filter((candidate) => candidate !== tag),
							)
						}
					>
						<X aria-hidden="true" />
					</button>
				</span>
			))}
			<input
				ref={inputRef}
				type="text"
				value={draft}
				placeholder={tags.length === 0 ? placeholder : ''}
				aria-label={`Add ${label} tag`}
				onChange={(event) => setDraft(event.target.value)}
				onKeyDown={handleKeyDown}
			/>
		</div>
	);
}

function includesTag(tags: readonly string[], candidate: string): boolean {
	const normalizedCandidate = candidate.toLocaleLowerCase();
	return tags.some(
		(tag) => tag.trim().toLocaleLowerCase() === normalizedCandidate,
	);
}

function sameTags(left: readonly string[], right: readonly string[]): boolean {
	return (
		left.length === right.length &&
		left.every((value, index) => value === right[index])
	);
}
