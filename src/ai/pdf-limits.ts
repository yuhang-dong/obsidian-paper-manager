export const MAX_AI_PDF_PAGE_COUNT = 30;

export function assertAiPdfPageLimit(pageCount: number): void {
	if (!Number.isInteger(pageCount) || pageCount < 1) {
		throw new Error('Could not determine the PDF page count');
	}
	if (pageCount > MAX_AI_PDF_PAGE_COUNT) {
		throw new Error(
			`This PDF has ${pageCount} pages. AI features currently support PDFs with up to ${MAX_AI_PDF_PAGE_COUNT} pages.`,
		);
	}
}
