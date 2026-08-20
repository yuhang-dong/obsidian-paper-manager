import { createPdfiumWorkerEngine } from '@embedpdf/engines';
import type {
	PdfDocumentObject,
	PdfEngine,
} from '@embedpdf/models';
import pdfiumWasmUrl from '@embedpdf/pdfium/pdfium.wasm';

let enginePromise: Promise<PdfEngine<Blob>> | null = null;

export async function countPdfPages(data: ArrayBuffer): Promise<number> {
	const engine = await getPageCountEngine();
	const document = await engine
		.openDocumentBuffer({
			id: crypto.randomUUID(),
			content: data,
		})
		.toPromise();

	try {
		return document.pageCount;
	} finally {
		await engine.closeDocument(document).toPromise();
	}
}

/**
 * Extracts the embedded text layer one page at a time and preserves explicit
 * page boundaries for downstream AI prompts.
 */
export async function extractPdfText(data: ArrayBuffer): Promise<string> {
	const engine = await getPageCountEngine();
	const document = await engine
		.openDocumentBuffer({
			id: crypto.randomUUID(),
			content: data,
		})
		.toPromise();

	try {
		return await extractOpenPdfText(engine, document);
	} finally {
		await engine.closeDocument(document).toPromise();
	}
}

/** Extracts text from a document that is already open in an EmbedPDF viewer. */
export async function extractOpenPdfText(
	engine: PdfEngine,
	document: PdfDocumentObject,
): Promise<string> {
	const pages: string[] = [];
	let hasExtractedText = false;

	for (let pageIndex = 0; pageIndex < document.pageCount; pageIndex += 1) {
		let pageText: string;
		try {
			pageText = await engine
				.extractText(document, [pageIndex])
				.toPromise();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(
				`Could not extract text from PDF page ${pageIndex + 1}: ${message}`,
			);
		}
		if (pageText.trim()) {
			hasExtractedText = true;
		}
		pages.push(`--- Page ${pageIndex + 1} ---\n${pageText}`);
	}

	if (!hasExtractedText) {
		throw new Error(
			'Could not extract text from this PDF. Image-only or scanned PDFs are not currently supported for AI features.',
		);
	}

	return pages.join('\n\n');
}

export async function destroyPdfPageCountEngine(): Promise<void> {
	const pendingEngine = enginePromise;
	enginePromise = null;
	if (!pendingEngine) {
		return;
	}

	const engine = await pendingEngine;
	await engine.destroy?.().toPromise();
}

function getPageCountEngine(): Promise<PdfEngine<Blob>> {
	enginePromise ??= Promise.resolve(
		createPdfiumWorkerEngine(pdfiumWasmUrl, {
			fontFallback: null,
		}),
	);
	return enginePromise;
}
