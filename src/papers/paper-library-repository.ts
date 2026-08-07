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

const INDEX_FILENAME = 'index.md';
const PDF_FILENAME = 'source.pdf';
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
		const pdfPath = `${folderPath}/${PDF_FILENAME}`;
		const annotationsPath = `${folderPath}/${ANNOTATIONS_FILENAME}`;
		const createdAt = new Date().toISOString();
		const title = titleFromFilename(file.name);

		await this.ensureFolder(folderPath);
		await this.app.vault.createBinary(pdfPath, data);
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
			id,
			title,
			authors: [],
			status: 'unread',
			originalFilename: file.name,
			fileHash,
			indexPath,
			pdfPath,
			annotationsPath,
			createdAt,
		};
	}

	private async readPaperRecord(file: TFile): Promise<PaperRecord | null> {
		const cachedFrontmatter =
			this.app.metadataCache.getFileCache(file)?.frontmatter;
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
			stringValue(frontmatter.original_filename) || PDF_FILENAME;
		const createdAt =
			stringValue(frontmatter.created_at) ||
			new Date(file.stat.ctime).toISOString();

		return {
			id,
			title,
			authors: stringArray(frontmatter.authors),
			year: numberValue(frontmatter.year),
			status: paperStatus(frontmatter.status),
			originalFilename,
			fileHash: stringValue(frontmatter.file_hash),
			indexPath: file.path,
			pdfPath: normalizePath(`${folderPath}/${PDF_FILENAME}`),
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
original_filename: ${yamlString(input.originalFilename)}
file_hash: ${yamlString(input.fileHash)}
pdf: ${yamlString('[[source.pdf]]')}
annotations_file: ${yamlString(ANNOTATIONS_FILENAME)}
created_at: ${yamlString(input.createdAt)}
updated_at: ${yamlString(input.createdAt)}
---

# ${markdownHeading(input.title)}

![[source.pdf]]

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

function paperStatus(value: unknown): PaperStatus {
	return value === 'reading' || value === 'finished' ? value : 'unread';
}

function isRecord(value: unknown): value is Frontmatter {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
