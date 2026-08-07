export const PAPER_STATUS_ORDER = ['unread', 'reading', 'finished'] as const;

export type PaperStatus = (typeof PAPER_STATUS_ORDER)[number];

export function humanizeStatus(value: string): string {
	return value
		.replace(/_/g, ' ')
		.replace(/\bai\b/gi, 'AI')
		.replace(/^\w/, (character) => character.toUpperCase());
}
