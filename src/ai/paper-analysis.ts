import {
	DefaultChatTransport,
	type UIMessage,
	type UIMessageChunk,
} from 'ai';
import { z } from 'zod';
import {
	createUsageTokenHeaders,
	startPaperManagerUsage,
	type PaperManagerUsage,
} from './billing-client';
import {
	AI_CHAT_API_ENDPOINT,
	PAPER_MANAGER_CHAT_MODEL,
} from './config';
import { obsidianFetch } from './obsidian-fetch';
import type { PaperLibraryRepository } from '@/papers/paper-library-repository';
import {
	PAPER_PROPERTY_SCHEMA_VERSION,
	type LiteratureType,
	type PaperAiProperties,
} from '@/papers/paper-property-schema';
import type { PaperRecord } from '@/papers/types';

const SAVE_ANALYSIS_TOOL_NAME = 'savePaperAnalysis';

const literatureTypeSchema = z.enum([
	'research-article',
	'review',
	'systematic-review',
	'meta-analysis',
	'conference-paper',
	'case-study',
	'thesis',
	'other',
] satisfies [LiteratureType, ...LiteratureType[]]);

export const paperAnalysisSchema = z.object({
	literatureType: literatureTypeSchema.nullable(),
	journalName: z.string(),
	year: z
		.number()
		.int()
		.min(1000)
		.max(new Date().getFullYear() + 1)
		.nullable(),
	title: z.string().min(1),
	abstract: z.string(),
	keywords: z.array(z.string()),
	authors: z.array(z.string()),
	researchBackground: z.string(),
	researchResults: z.string(),
	researchMethods: z.string(),
	paperSummary: z.string(),
	innovations: z.string(),
	applicationValue: z.string(),
	limitations: z.string(),
	futureDirections: z.string(),
}) satisfies z.ZodType<PaperAiProperties>;

const saveAnalysisToolDefinition = {
	name: SAVE_ANALYSIS_TOOL_NAME,
	description:
		'Return the complete, structured academic-paper analysis for storage in the paper library.',
	inputSchema: z.toJSONSchema(paperAnalysisSchema),
	outputSchema: z.toJSONSchema(
		z.object({
			kind: z.literal('json'),
			data: z.object({ saved: z.boolean() }),
		}),
	),
	strict: true,
};

export type PaperAnalysisStage =
	| 'reading_pdf'
	| 'reserving_credits'
	| 'analyzing'
	| 'saving';

export interface AnalyzePaperResult {
	paper: PaperRecord;
	usage: PaperManagerUsage;
}

export interface AnalyzePaperOptions {
	repository: PaperLibraryRepository;
	paper: PaperRecord;
	billingKey: string;
	onProgress?: (stage: PaperAnalysisStage) => void;
	abortSignal?: AbortSignal;
}

export async function analyzePaper({
	repository,
	paper,
	billingKey,
	onProgress,
	abortSignal,
}: AnalyzePaperOptions): Promise<AnalyzePaperResult> {
	let currentPaper = paper;

	try {
		onProgress?.('reading_pdf');
		const pdfData = await repository.readSourcePdf(currentPaper);
		const pdfDataUrl = await arrayBufferToDataUrl(pdfData, 'application/pdf');

		currentPaper = await repository.updatePaperProperties(currentPaper, {
			aiStatus: 'queued',
			aiModel: PAPER_MANAGER_CHAT_MODEL,
			aiError: '',
		});

		onProgress?.('reserving_credits');
		const usage = await startPaperManagerUsage({
			key: billingKey,
			requestId: crypto.randomUUID(),
		});

		currentPaper = await repository.updatePaperProperties(currentPaper, {
			aiStatus: 'processing',
		});
		onProgress?.('analyzing');
		const analysis = await requestPaperAnalysis({
			paper: currentPaper,
			pdfDataUrl,
			usageToken: usage.usageToken,
			abortSignal,
		});

		onProgress?.('saving');
		currentPaper = await repository.updatePaperProperties(currentPaper, {
			...analysis,
			aiStatus: 'completed',
			aiSchemaVersion: PAPER_PROPERTY_SCHEMA_VERSION,
			aiModel: PAPER_MANAGER_CHAT_MODEL,
			aiUpdatedAt: new Date().toISOString(),
			aiError: '',
		});
		currentPaper = await repository.updatePaperOverview(
			currentPaper,
			analysis,
		);

		return { paper: currentPaper, usage };
	} catch (error) {
		try {
			await repository.updatePaperProperties(currentPaper, {
				aiStatus: 'failed',
				aiModel: PAPER_MANAGER_CHAT_MODEL,
				aiUpdatedAt: new Date().toISOString(),
				aiError: errorMessage(error).slice(0, 500),
			});
		} catch (statusError) {
			console.error('Could not persist paper analysis failure', statusError);
		}

		throw error;
	}
}

async function requestPaperAnalysis({
	paper,
	pdfDataUrl,
	usageToken,
	abortSignal,
}: {
	paper: PaperRecord;
	pdfDataUrl: string;
	usageToken: string;
	abortSignal?: AbortSignal;
}): Promise<PaperAiProperties> {
	const transport = new DefaultChatTransport<UIMessage>({
		api: AI_CHAT_API_ENDPOINT,
		headers: createUsageTokenHeaders(usageToken),
		fetch: obsidianFetch,
		body: {
			model: PAPER_MANAGER_CHAT_MODEL,
			reasoning: 'medium',
			system: PAPER_ANALYSIS_SYSTEM_PROMPT,
			tools: [saveAnalysisToolDefinition],
			toolChoice: {
				type: 'tool',
				toolName: SAVE_ANALYSIS_TOOL_NAME,
			},
		},
	});
	const stream = await transport.sendMessages({
		abortSignal,
		chatId: crypto.randomUUID(),
		messageId: undefined,
		messages: [
			{
				id: crypto.randomUUID(),
				role: 'user',
				parts: [
					{
						type: 'text',
						text: [
							'Analyze the attached academic paper and call savePaperAnalysis exactly once.',
							`Imported filename: ${paper.originalFilename}`,
							`Current library title (fallback only): ${paper.title}`,
						].join('\n'),
					},
					{
						type: 'file',
						mediaType: 'application/pdf',
						filename: paper.originalFilename,
						url: pdfDataUrl,
					},
				],
			},
		],
		trigger: 'submit-message',
	});
	const reader = stream.getReader();
	let analysis: PaperAiProperties | undefined;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}

			const chunk = value as UIMessageChunk;
			if (chunk.type === 'error') {
				throw new Error(chunk.errorText || 'Paper analysis request failed');
			}
			if (chunk.type === 'abort') {
				throw new Error('Paper analysis was cancelled');
			}
			if (chunk.type === 'tool-input-error') {
				throw new Error(chunk.errorText || 'Paper analysis returned an invalid tool call');
			}
			if (
				chunk.type === 'tool-input-available' &&
				chunk.toolName === SAVE_ANALYSIS_TOOL_NAME
			) {
				const parsed = paperAnalysisSchema.safeParse(chunk.input);
				if (!parsed.success) {
					throw new Error('The AI returned paper data that does not match the schema');
				}
				analysis = parsed.data;
			}
			if (chunk.type === 'finish' && chunk.finishReason === 'error') {
				throw new Error('The paper analysis model failed');
			}
		}
	} finally {
		reader.releaseLock();
	}

	if (!analysis) {
		throw new Error('The AI did not return a structured paper analysis');
	}

	return analysis;
}

const PAPER_ANALYSIS_SYSTEM_PROMPT = `You are a rigorous academic paper analyst.

Analyze only the attached PDF. Never invent bibliographic facts, study details, results, numerical values, limitations, or claims. Use an empty string, empty list, or null when the paper does not provide enough evidence.

Output rules:
- Call savePaperAnalysis exactly once and do not answer with prose outside the tool call.
- Return every schema field.
- Write researchBackground, researchResults, researchMethods, paperSummary, innovations, applicationValue, limitations, and futureDirections in concise Simplified Chinese.
- These long-form sections are rendered as Obsidian markdown in the note body. Use markdown freely: bullet or numbered lists, bold/italic, blockquotes, wikilinks, and callouts such as > [!tip] or > [!warning]. Prefer lists over walls of text.
- Do not emit level-2 (##) or level-3 (###) headings; the note already provides section headings. If you need sub-structure, use level-5 (#####) headings at most, or use lists.
- Preserve the paper's original title, author names, journal name, and author-supplied keywords instead of translating them.
- Preserve the original abstract when one is present. If no abstract is present, leave abstract empty.
- Keep authors in publication order and remove affiliations and footnote markers.
- literatureType must use the closest allowed enum value. Use null only when the type cannot be determined.
- Distinguish claims made by the authors from your own cautious evaluation, especially for innovations, application value, and limitations.
- Prefer specific findings and methods over generic language.`;

function arrayBufferToDataUrl(
	data: ArrayBuffer,
	mediaType: string,
): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(reader.error ?? new Error('Could not read PDF'));
		reader.onload = () => {
			if (typeof reader.result !== 'string') {
				reject(new Error('Could not encode PDF'));
				return;
			}
			resolve(reader.result);
		};
		reader.readAsDataURL(new Blob([data], { type: mediaType }));
	});
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
