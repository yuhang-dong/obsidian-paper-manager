export type PaperStatus = 'unread' | 'reading' | 'finished';

export interface PaperRecord {
	id: string;
	title: string;
	authors: string[];
	year?: number;
	status: PaperStatus;
	originalFilename: string;
	fileHash: string;
	indexPath: string;
	pdfPath: string;
	annotationsPath: string;
	createdAt: string;
}

export interface PaperImportError {
	filename: string;
	message: string;
}

export interface PaperImportResult {
	imported: PaperRecord[];
	skippedDuplicates: string[];
	errors: PaperImportError[];
}
