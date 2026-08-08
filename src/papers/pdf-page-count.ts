import { createPdfiumWorkerEngine } from '@embedpdf/engines';
import type { PdfEngine } from '@embedpdf/models';
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
