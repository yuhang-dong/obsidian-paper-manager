import {
	App,
	getFrontMatterInfo,
	normalizePath,
	parseYaml,
	TFile,
	TFolder,
} from 'obsidian';
import type {
	PaperImportResult,
	PaperRecord,
	PaperStatus,
} from './types';
import {
	isLiteratureType,
	isPaperAiStatus,
	PAPER_AI_PROPERTY_SCHEMA,
	PAPER_PROPERTY_SCHEMA_VERSION,
} from './paper-property-schema';
import type {
	PaperAiProperties,
	PaperAiSystemProperties,
	PaperPropertyUpdates,
} from './paper-property-schema';

const INDEX_FILENAME = 'index.md';
const SOURCE_PDF_FILENAME = 'source.pdf';
const ANNOTATED_PDF_FILENAME = 'annotated.pdf';
const ANNOTATIONS_FILENAME = 'annotations.json';

type Frontmatter = Record<string, unknown>;

export class PaperLibraryRepository {
	constructor(
		private readonly app: App,
		private readonly getLibraryFolder: () => string,
	) {}

	async listPapers(): Promise<PaperRecord[]> {
		const libraryFolder = this.libraryFolder;
		const libraryPrefix = `${libraryFolder}/`;
		const indexFiles = this.app.vault.getMarkdownFiles().filter((file) => {
			return (
				file.path.startsWith(libraryPrefix) &&
				file.name === INDEX_FILENAME
			);
		});

		const papers = await Promise.all(
			indexFiles.map(async (file) => {
				try {
					return await this.readPaperRecord(file);
				} catch (error) {
					console.error(`Could not read paper index: ${file.path}`, error);
					return null;
				}
			}),
		);

		return papers
			.filter((paper): paper is PaperRecord => paper !== null)
			.sort((left, right) => {
				return (
					right.createdAt.localeCompare(left.createdAt) ||
					left.title.localeCompare(right.title)
				);
			});
	}

	async importPapers(files: File[]): Promise<PaperImportResult> {
		const result: PaperImportResult = {
			imported: [],
			skippedDuplicates: [],
			errors: [],
		};
		const existingHashes = new Set(
			(await this.listPapers()).map((paper) => paper.fileHash),
		);

		await this.ensureFolder(this.libraryFolder);

		for (const file of files) {
			try {
				const data = await file.arrayBuffer();
				const fileHash = await sha256(data);

				if (existingHashes.has(fileHash)) {
					result.skippedDuplicates.push(file.name);
					continue;
				}

				const paper = await this.importPaper(file, data, fileHash);
				existingHashes.add(fileHash);
				result.imported.push(paper);
			} catch (error) {
				result.errors.push({
					filename: file.name,
					message: errorMessage(error),
				});
			}
		}

		return result;
	}

	async openIndex(paper: PaperRecord): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(paper.indexPath);
		if (!(file instanceof TFile)) {
			throw new Error(`Index note not found: ${paper.indexPath}`);
		}

		await this.app.workspace.getLeaf('tab').openFile(file);
	}

	async updatePaperProperties(
		paper: PaperRecord,
		updates: PaperPropertyUpdates,
	): Promise<PaperRecord> {
		const file = this.app.vault.getAbstractFileByPath(paper.indexPath);
		if (!(file instanceof TFile)) {
			throw new Error(`Index note not found: ${paper.indexPath}`);
		}

		const updatedAt = new Date().toISOString();
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			const properties = frontmatter as Frontmatter;
			for (const field of PAPER_AI_PROPERTY_SCHEMA) {
				if (hasOwn(updates, field.id)) {
					writeFrontmatterValue(
						properties,
						field.frontmatterKey,
						updates[field.id],
					);
				}
			}

			for (const field of AI_SYSTEM_PROPERTY_SCHEMA) {
				if (hasOwn(updates, field.id)) {
					writeFrontmatterValue(
						properties,
						field.frontmatterKey,
						updates[field.id],
					);
				}
			}

			properties.ai_schema_version =
				updates.aiSchemaVersion ?? PAPER_PROPERTY_SCHEMA_VERSION;
			properties.updated_at = updatedAt;
		});

		const updatedPaper = await this.readPaperRecord(file, true);
		if (!updatedPaper) {
			throw new Error(`Could not read updated paper: ${paper.indexPath}`);
		}

		return updatedPaper;
	}

	private get libraryFolder(): string {
		return normalizePath(this.getLibraryFolder());
	}

	private async importPaper(
		file: File,
		data: ArrayBuffer,
		fileHash: string,
	): Promise<PaperRecord> {
		const id = crypto.randomUUID();
		const folderPath = normalizePath(`${this.libraryFolder}/${id}`);
		const indexPath = `${folderPath}/${INDEX_FILENAME}`;
		const sourcePdfPath = `${folderPath}/${SOURCE_PDF_FILENAME}`;
		const pdfPath = `${folderPath}/${ANNOTATED_PDF_FILENAME}`;
		const annotationsPath = `${folderPath}/${ANNOTATIONS_FILENAME}`;
		const createdAt = new Date().toISOString();
		const title = titleFromFilename(file.name);

		await this.ensureFolder(folderPath);
		await this.app.vault.createBinary(sourcePdfPath, data);
		await this.app.vault.createBinary(pdfPath, data.slice(0));
		await this.app.vault.create(
			annotationsPath,
			JSON.stringify(
				{
					schemaVersion: 1,
					paperId: id,
					annotations: [],
				},
				null,
				2,
			),
		);
		await this.app.vault.create(
			indexPath,
			createIndexMarkdown({
				id,
				title,
				originalFilename: file.name,
				fileHash,
				createdAt,
			}),
		);

		return {
			...paperPropertiesFromFrontmatter(
				{
					title,
					authors: [],
				},
				title,
			),
			id,
			status: 'unread',
			originalFilename: file.name,
			fileHash,
			indexPath,
			sourcePdfPath,
			pdfPath,
			annotationsPath,
			createdAt,
		};
	}

	private async readPaperRecord(
		file: TFile,
		fresh = false,
	): Promise<PaperRecord | null> {
		const cachedFrontmatter = fresh
			? null
			: this.app.metadataCache.getFileCache(file)?.frontmatter;
		const frontmatter =
			cachedFrontmatter ?? (await this.readFrontmatter(file));

		if (frontmatter?.paper_manager !== true) {
			return null;
		}

		const parentFolder = file.parent;
		const folderPath = parentFolder?.path;
		const id = stringValue(frontmatter.paper_id);
		if (!parentFolder || !folderPath || !id) {
			return null;
		}

		const title = stringValue(frontmatter.title) || parentFolder.name;
		const originalFilename =
			stringValue(frontmatter.original_filename) || SOURCE_PDF_FILENAME;
		const createdAt =
			stringValue(frontmatter.created_at) ||
			new Date(file.stat.ctime).toISOString();

		const sourcePdfPath = normalizePath(
			`${folderPath}/${SOURCE_PDF_FILENAME}`,
		);
		const annotatedPdfPath = normalizePath(
			`${folderPath}/${ANNOTATED_PDF_FILENAME}`,
		);
		const hasAnnotatedPdf =
			this.app.vault.getAbstractFileByPath(annotatedPdfPath) instanceof TFile;

		return {
			...paperPropertiesFromFrontmatter(frontmatter, title),
			id,
			status: paperStatus(frontmatter.status),
			originalFilename,
			fileHash: stringValue(frontmatter.file_hash),
			indexPath: file.path,
			sourcePdfPath,
			pdfPath: hasAnnotatedPdf ? annotatedPdfPath : sourcePdfPath,
			annotationsPath: normalizePath(
				`${folderPath}/${ANNOTATIONS_FILENAME}`,
			),
			createdAt,
		};
	}

	private async readFrontmatter(file: TFile): Promise<Frontmatter | null> {
		const content = await this.app.vault.cachedRead(file);
		const info = getFrontMatterInfo(content);
		if (!info.exists) {
			return null;
		}

		const parsed = parseYaml(info.frontmatter) as unknown;
		return isRecord(parsed) ? parsed : null;
	}

	private async ensureFolder(path: string): Promise<void> {
		const parts = normalizePath(path).split('/');
		let currentPath = '';

		for (const part of parts) {
			currentPath = currentPath ? `${currentPath}/${part}` : part;
			const existing = this.app.vault.getAbstractFileByPath(currentPath);

			if (existing instanceof TFolder) {
				continue;
			}
			if (existing) {
				throw new Error(`A file already exists at ${currentPath}`);
			}

			await this.app.vault.createFolder(currentPath);
		}
	}
}

function createIndexMarkdown(input: {
	id: string;
	title: string;
	originalFilename: string;
	fileHash: string;
	createdAt: string;
}): string {
	return `---
paper_manager: true
schema_version: 1
paper_id: ${yamlString(input.id)}
title: ${yamlString(input.title)}
authors: []
status: unread
ai_status: not_started
ai_schema_version: ${PAPER_PROPERTY_SCHEMA_VERSION}
ai_model: ""
ai_error: ""
original_filename: ${yamlString(input.originalFilename)}
file_hash: ${yamlString(input.fileHash)}
source_pdf: ${yamlString('[[source.pdf]]')}
pdf: ${yamlString('[[annotated.pdf]]')}
annotations_file: ${yamlString(ANNOTATIONS_FILENAME)}
created_at: ${yamlString(input.createdAt)}
updated_at: ${yamlString(input.createdAt)}
---

# ${markdownHeading(input.title)}

![[annotated.pdf]]

## My notes

`;
}

async function sha256(data: ArrayBuffer): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', data);
	const bytes = new Uint8Array(digest);
	const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
		'',
	);
	return `sha256:${hex}`;
}

function titleFromFilename(filename: string): string {
	return filename
		.replace(/\.pdf$/i, '')
		.replace(/[_-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function markdownHeading(value: string): string {
	return value.replace(/[\r\n]+/g, ' ').trim();
}

function yamlString(value: string): string {
	return JSON.stringify(value);
}

function stringValue(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

function stringArray(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.filter((item): item is string => typeof item === 'string');
	}
	return typeof value === 'string' && value ? [value] : [];
}

function numberValue(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

const AI_SYSTEM_PROPERTY_SCHEMA = [
	{ id: 'aiStatus', frontmatterKey: 'ai_status' },
	{ id: 'aiSchemaVersion', frontmatterKey: 'ai_schema_version' },
	{ id: 'aiModel', frontmatterKey: 'ai_model' },
	{ id: 'aiUpdatedAt', frontmatterKey: 'ai_updated_at' },
	{ id: 'aiError', frontmatterKey: 'ai_error' },
] as const;

function paperPropertiesFromFrontmatter(
	frontmatter: Frontmatter,
	fallbackTitle: string,
): PaperAiProperties & PaperAiSystemProperties {
	return {
		literatureType: isLiteratureType(frontmatter.literature_type)
			? frontmatter.literature_type
			: null,
		journalName: stringValue(frontmatter.journal),
		year: numberValue(frontmatter.year) ?? null,
		title: stringValue(frontmatter.title) || fallbackTitle,
		abstract: stringValue(frontmatter.abstract),
		keywords: stringArray(frontmatter.keywords),
		authors: stringArray(frontmatter.authors),
		researchBackground: stringValue(frontmatter.research_background),
		researchResults: stringValue(frontmatter.research_results),
		researchMethods: stringValue(frontmatter.research_methods),
		paperSummary: stringValue(frontmatter.paper_summary),
		innovations: stringValue(frontmatter.innovations),
		applicationValue: stringValue(frontmatter.application_value),
		limitations: stringValue(frontmatter.limitations),
		futureDirections: stringValue(frontmatter.future_directions),
		aiStatus: isPaperAiStatus(frontmatter.ai_status)
			? frontmatter.ai_status
			: 'not_started',
		aiSchemaVersion:
			numberValue(frontmatter.ai_schema_version) ??
			PAPER_PROPERTY_SCHEMA_VERSION,
		aiModel: stringValue(frontmatter.ai_model),
		aiUpdatedAt: stringValue(frontmatter.ai_updated_at) || null,
		aiError: stringValue(frontmatter.ai_error),
	};
}

function writeFrontmatterValue(
	frontmatter: Frontmatter,
	key: string,
	value: unknown,
): void {
	if (value === null || value === undefined) {
		delete frontmatter[key];
		return;
	}

	frontmatter[key] = value;
}

function hasOwn<T extends object>(
	value: T,
	key: PropertyKey,
): key is keyof T {
	return Object.prototype.hasOwnProperty.call(value, key);
}

function paperStatus(value: unknown): PaperStatus {
	return value === 'reading' || value === 'finished' ? value : 'unread';
}

function isRecord(value: unknown): value is Frontmatter {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
