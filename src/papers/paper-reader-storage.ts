import type { AnnotationTransferItem } from '@embedpdf/plugin-annotation';
import {
	App,
	getFrontMatterInfo,
	normalizePath,
	parseYaml,
	TFile,
} from 'obsidian';

const INDEX_FILENAME = 'index.md';
const SOURCE_PDF_FILENAME = 'source.pdf';
const ANNOTATED_PDF_FILENAME = 'annotated.pdf';
const ANNOTATIONS_FILENAME = 'annotations.json';

export async function getManagedPaperSourcePdf(
	app: App,
	file: TFile,
): Promise<TFile | null> {
	if (
		file.name !== SOURCE_PDF_FILENAME &&
		file.name !== ANNOTATED_PDF_FILENAME
	) {
		return null;
	}

	const storage = new PaperReaderStorage(app, file.path);
	const indexFile = app.vault.getAbstractFileByPath(storage.indexPath);
	const sourceFile = app.vault.getAbstractFileByPath(storage.sourcePdfPath);
	if (!(indexFile instanceof TFile) || !(sourceFile instanceof TFile)) {
		return null;
	}

	const cachedFrontmatter = app.metadataCache.getFileCache(indexFile)?.frontmatter;
	if (cachedFrontmatter) {
		return cachedFrontmatter.paper_manager === true ? sourceFile : null;
	}

	try {
		const content = await app.vault.cachedRead(indexFile);
		const info = getFrontMatterInfo(content);
		if (!info.exists) {
			return null;
		}

		const frontmatter = parseYaml(info.frontmatter) as unknown;
		return isRecord(frontmatter) && frontmatter.paper_manager === true
			? sourceFile
			: null;
	} catch {
		return null;
	}
}

interface AnnotationFile {
	schemaVersion: number;
	paperId: string;
	updatedAt?: string;
	annotations: AnnotationTransferItem[];
}

export class PaperReaderStorage {
	readonly folderPath: string;
	readonly sourcePdfPath: string;
	readonly annotatedPdfPath: string;
	readonly annotationsPath: string;
	readonly indexPath: string;

	constructor(
		private readonly app: App,
		pdfPath: string,
	) {
		const separatorIndex = normalizePath(pdfPath).lastIndexOf('/');
		this.folderPath =
			separatorIndex >= 0 ? pdfPath.slice(0, separatorIndex) : '';
		this.sourcePdfPath = normalizePath(
			`${this.folderPath}/${SOURCE_PDF_FILENAME}`,
		);
		this.annotatedPdfPath = normalizePath(
			`${this.folderPath}/${ANNOTATED_PDF_FILENAME}`,
		);
		this.annotationsPath = normalizePath(
			`${this.folderPath}/${ANNOTATIONS_FILENAME}`,
		);
		this.indexPath = normalizePath(`${this.folderPath}/${INDEX_FILENAME}`);
	}

	isManagedPaper(): boolean {
		return (
			this.app.vault.getAbstractFileByPath(this.indexPath) instanceof TFile &&
			this.app.vault.getAbstractFileByPath(this.sourcePdfPath) instanceof TFile
		);
	}

	async loadAnnotations(): Promise<AnnotationTransferItem[]> {
		const file = this.app.vault.getAbstractFileByPath(this.annotationsPath);
		if (!(file instanceof TFile)) {
			return [];
		}

		const content = await this.app.vault.read(file);
		const parsed = JSON.parse(content, dateReviver) as unknown;
		if (!isAnnotationFile(parsed)) {
			throw new Error(`Invalid annotation file: ${this.annotationsPath}`);
		}

		return parsed.annotations;
	}

	async saveAnnotations(annotations: AnnotationTransferItem[]): Promise<void> {
		const current = await this.readAnnotationFile();
		const payload: AnnotationFile = {
			schemaVersion: 1,
			paperId: current?.paperId || this.folderName,
			updatedAt: new Date().toISOString(),
			annotations,
		};
		const content = JSON.stringify(payload, null, 2);
		const file = this.app.vault.getAbstractFileByPath(this.annotationsPath);

		if (file instanceof TFile) {
			await this.app.vault.modify(file, content);
		} else {
			await this.app.vault.create(this.annotationsPath, content);
		}
	}

	async saveAnnotatedPdf(data: ArrayBuffer): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(this.annotatedPdfPath);
		if (file instanceof TFile) {
			await this.app.vault.modifyBinary(file, data);
		} else {
			await this.app.vault.createBinary(this.annotatedPdfPath, data);
		}

		await this.updateIndexNote();
	}

	getIndexFile(): TFile | null {
		const file = this.app.vault.getAbstractFileByPath(this.indexPath);
		return file instanceof TFile ? file : null;
	}

	private get folderName(): string {
		return this.folderPath.split('/').pop() ?? '';
	}

	private async readAnnotationFile(): Promise<AnnotationFile | null> {
		const file = this.app.vault.getAbstractFileByPath(this.annotationsPath);
		if (!(file instanceof TFile)) {
			return null;
		}

		const parsed = JSON.parse(
			await this.app.vault.read(file),
			dateReviver,
		) as unknown;
		return isAnnotationFile(parsed) ? parsed : null;
	}

	private async updateIndexNote(): Promise<void> {
		const indexFile = this.getIndexFile();
		if (!indexFile) {
			return;
		}

		await this.app.fileManager.processFrontMatter(indexFile, (frontmatter) => {
			const metadata = frontmatter as Record<string, unknown>;
			metadata.source_pdf = '[[source.pdf]]';
			metadata.pdf = '[[annotated.pdf]]';
			metadata.updated_at = new Date().toISOString();
		});
		await this.app.vault.process(indexFile, (content) => {
			return content.replace('![[source.pdf]]', '![[annotated.pdf]]');
		});
	}
}

function isAnnotationFile(value: unknown): value is AnnotationFile {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const candidate = value as Partial<AnnotationFile>;
	return Array.isArray(candidate.annotations);
}

function dateReviver(key: string, value: unknown): unknown {
	if (
		(key === 'created' || key === 'modified') &&
		typeof value === 'string'
	) {
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? value : date;
	}

	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
