import type {
	PaperAiProperties,
	PaperAiSystemProperties,
} from './paper-property-schema';

export type PaperStatus = 'unread' | 'reading' | 'finished';

export interface PaperRecord
	extends PaperAiProperties,
		PaperAiSystemProperties {
	id: string;
	status: PaperStatus;
	originalFilename: string;
	fileHash: string;
	indexPath: string;
	sourcePdfPath: string;
	pdfPath: string;
	annotationsPath: string;
	createdAt: string;
	/** Raw frontmatter properties (plugin-internal keys excluded). */
	properties: Record<string, unknown>;
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
