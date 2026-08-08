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
	keywords: z
		.array(z.string())
		.describe(
			'One combined list containing verbatim author-supplied keywords followed by additional full-paper keywords generated in Simplified Chinese.',
		),
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
	onProgress?.('reading_pdf');
	const pdfData = await repository.readSourcePdf(paper);
	const pdfDataUrl = await arrayBufferToDataUrl(pdfData, 'application/pdf');

	onProgress?.('reserving_credits');
	const usage = await startPaperManagerUsage({
		key: billingKey,
		requestId: crypto.randomUUID(),
	});

	onProgress?.('analyzing');
	const analysis = await requestPaperAnalysis({
		paper,
		pdfDataUrl,
		usageToken: usage.usageToken,
		abortSignal,
	});

	onProgress?.('saving');
	let updatedPaper = await repository.updatePaperOverview(paper, analysis);
	updatedPaper = await repository.updatePaperProperties(updatedPaper, {
		...analysis,
		analyzedAt: new Date().toISOString(),
	});

	return { paper: updatedPaper, usage };
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
				analysis = {
					...parsed.data,
					keywords: normalizeKeywords(parsed.data.keywords),
				};
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
- Translate abstract faithfully into concise Simplified Chinese without summarizing, omitting claims, or adding interpretation. If the paper has no abstract, leave abstract empty.
- Write researchBackground, researchResults, researchMethods, paperSummary, innovations, applicationValue, limitations, and futureDirections in concise Simplified Chinese.
- These long-form sections are rendered as Obsidian markdown in the note body. Use markdown freely: bullet or numbered lists, bold/italic, blockquotes, wikilinks, and callouts such as > [!tip] or > [!warning]. Prefer lists over walls of text.
- Do not emit level-2 (##) or level-3 (###) headings; the note already provides section headings. If you need sub-structure, use level-5 (#####) headings at most, or use lists.
- Preserve the paper's original title, author names, and journal name instead of translating them.
- keywords must be one combined, deduplicated list. Put every author-supplied keyword first, preserving its original wording and order, then append keywords inferred from the full paper in concise Simplified Chinese.
- Even when author-supplied keywords exist, append 3 to 5 useful inferred keywords that add concepts not already covered. When the paper has no supplied keywords, generate 5 to 8 keywords from the full paper.
- Generated keywords must be grounded in the paper and favor specific topics, methods, materials, populations, or application domains. Avoid generic terms such as "research", "paper", "study", or "method".
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

function normalizeKeywords(keywords: readonly string[]): string[] {
	const normalized: string[] = [];
	const seen = new Set<string>();

	for (const keyword of keywords) {
		const value = keyword.trim().replace(/\s+/g, ' ');
		const comparisonKey = value.toLocaleLowerCase();
		if (!value || seen.has(comparisonKey)) {
			continue;
		}
		seen.add(comparisonKey);
		normalized.push(value);
	}

	return normalized;
}
