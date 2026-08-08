import type {
	PaperAnalysisMetadata,
	PaperAiProperties,
} from './paper-property-schema';

export type { PaperStatus } from './paper-status';

export interface PaperRecord
	extends PaperAiProperties,
		PaperAnalysisMetadata {
	id: string;
	/** Reading status; may be a user-written value from the frontmatter. */
	status: string;
	originalFilename: string;
	fileHash: string;
	indexPath: string;
	sourcePdfPath: string;
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
