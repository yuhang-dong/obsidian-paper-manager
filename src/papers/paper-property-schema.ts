export const PAPER_PROPERTY_SCHEMA_VERSION = 1 as const;

export const LITERATURE_TYPE_OPTIONS = [
	{ value: 'research-article', label: 'Research article' },
	{ value: 'review', label: 'Review' },
	{ value: 'systematic-review', label: 'Systematic review' },
	{ value: 'meta-analysis', label: 'Meta-analysis' },
	{ value: 'conference-paper', label: 'Conference paper' },
	{ value: 'case-study', label: 'Case study' },
	{ value: 'thesis', label: 'Thesis' },
	{ value: 'other', label: 'Other' },
] as const;

export type LiteratureType =
	(typeof LITERATURE_TYPE_OPTIONS)[number]['value'];

export type PaperAiStatus =
	| 'not_started'
	| 'queued'
	| 'processing'
	| 'completed'
	| 'failed';

export interface PaperAiProperties {
	literatureType: LiteratureType | null;
	journalName: string;
	year: number | null;
	title: string;
	abstract: string;
	keywords: string[];
	authors: string[];
	researchBackground: string;
	researchResults: string;
	researchMethods: string;
	paperSummary: string;
	innovations: string;
	applicationValue: string;
	limitations: string;
	futureDirections: string;
}

export interface PaperAiSystemProperties {
	aiStatus: PaperAiStatus;
	aiSchemaVersion: number;
	aiModel: string;
	aiUpdatedAt: string | null;
	aiError: string;
}

export type PaperPropertyUpdates = Partial<
	PaperAiProperties & PaperAiSystemProperties
>;

export type PaperAiPropertyId = keyof PaperAiProperties;

export type ObsidianPropertyType =
	| 'text'
	| 'list'
	| 'number'
	| 'checkbox'
	| 'date'
	| 'datetime';

export type PaperPropertyEditor =
	| 'text'
	| 'textarea'
	| 'list'
	| 'number'
	| 'checkbox'
	| 'select'
	| 'date'
	| 'datetime';

export interface PaperPropertySchema {
	id: PaperAiPropertyId;
	frontmatterKey: string;
	label: string;
	description: string;
	group: 'bibliographic' | 'research' | 'evaluation';
	propertyType: ObsidianPropertyType;
	editor: PaperPropertyEditor;
	aiGenerated: true;
	defaultVisible: boolean;
	options?: ReadonlyArray<{
		value: string;
		label: string;
	}>;
}

export const PAPER_AI_PROPERTY_SCHEMA = [
	{
		id: 'literatureType',
		frontmatterKey: 'literature_type',
		label: 'Literature type',
		description: 'The publication or study type.',
		group: 'bibliographic',
		propertyType: 'text',
		editor: 'select',
		aiGenerated: true,
		defaultVisible: true,
		options: LITERATURE_TYPE_OPTIONS,
	},
	{
		id: 'journalName',
		frontmatterKey: 'journal',
		label: 'Journal',
		description: 'The journal or publication venue.',
		group: 'bibliographic',
		propertyType: 'text',
		editor: 'text',
		aiGenerated: true,
		defaultVisible: true,
	},
	{
		id: 'year',
		frontmatterKey: 'year',
		label: 'Year',
		description: 'The publication year.',
		group: 'bibliographic',
		propertyType: 'number',
		editor: 'number',
		aiGenerated: true,
		defaultVisible: true,
	},
	{
		id: 'title',
		frontmatterKey: 'title',
		label: 'Title',
		description: 'The full title of the paper.',
		group: 'bibliographic',
		propertyType: 'text',
		editor: 'text',
		aiGenerated: true,
		defaultVisible: true,
	},
	{
		id: 'abstract',
		frontmatterKey: 'abstract',
		label: 'Abstract',
		description: 'The abstract provided by the paper.',
		group: 'bibliographic',
		propertyType: 'text',
		editor: 'textarea',
		aiGenerated: true,
		defaultVisible: false,
	},
	{
		id: 'keywords',
		frontmatterKey: 'keywords',
		label: 'Keywords',
		description: 'Keywords supplied by the paper or extracted by AI.',
		group: 'bibliographic',
		propertyType: 'list',
		editor: 'list',
		aiGenerated: true,
		defaultVisible: false,
	},
	{
		id: 'authors',
		frontmatterKey: 'authors',
		label: 'Authors',
		description: 'The ordered list of paper authors.',
		group: 'bibliographic',
		propertyType: 'list',
		editor: 'list',
		aiGenerated: true,
		defaultVisible: true,
	},
	{
		id: 'researchBackground',
		frontmatterKey: 'research_background',
		label: 'Research background',
		description: 'The context and problem motivating the research.',
		group: 'research',
		propertyType: 'text',
		editor: 'textarea',
		aiGenerated: true,
		defaultVisible: false,
	},
	{
		id: 'researchResults',
		frontmatterKey: 'research_results',
		label: 'Research results',
		description: 'The main findings and reported results.',
		group: 'research',
		propertyType: 'text',
		editor: 'textarea',
		aiGenerated: true,
		defaultVisible: false,
	},
	{
		id: 'researchMethods',
		frontmatterKey: 'research_methods',
		label: 'Research methods',
		description: 'The study design, data, materials, and methods.',
		group: 'research',
		propertyType: 'text',
		editor: 'textarea',
		aiGenerated: true,
		defaultVisible: false,
	},
	{
		id: 'paperSummary',
		frontmatterKey: 'paper_summary',
		label: 'Paper summary',
		description: 'A concise synthesis of the complete paper.',
		group: 'research',
		propertyType: 'text',
		editor: 'textarea',
		aiGenerated: true,
		defaultVisible: false,
	},
	{
		id: 'innovations',
		frontmatterKey: 'innovations',
		label: 'Innovations',
		description: 'The novel ideas, methods, or contributions.',
		group: 'evaluation',
		propertyType: 'text',
		editor: 'textarea',
		aiGenerated: true,
		defaultVisible: false,
	},
	{
		id: 'applicationValue',
		frontmatterKey: 'application_value',
		label: 'Application value',
		description: 'Potential practical or theoretical applications.',
		group: 'evaluation',
		propertyType: 'text',
		editor: 'textarea',
		aiGenerated: true,
		defaultVisible: false,
	},
	{
		id: 'limitations',
		frontmatterKey: 'limitations',
		label: 'Limitations',
		description: 'Limitations reported by the authors or identified by AI.',
		group: 'evaluation',
		propertyType: 'text',
		editor: 'textarea',
		aiGenerated: true,
		defaultVisible: false,
	},
	{
		id: 'futureDirections',
		frontmatterKey: 'future_directions',
		label: 'Future directions',
		description: 'Future work proposed or implied by the research.',
		group: 'evaluation',
		propertyType: 'text',
		editor: 'textarea',
		aiGenerated: true,
		defaultVisible: false,
	},
] as const satisfies ReadonlyArray<PaperPropertySchema>;

const LITERATURE_TYPE_VALUES = new Set<string>(
	LITERATURE_TYPE_OPTIONS.map((option) => option.value),
);

export function isLiteratureType(value: unknown): value is LiteratureType {
	return typeof value === 'string' && LITERATURE_TYPE_VALUES.has(value);
}

export function isPaperAiStatus(value: unknown): value is PaperAiStatus {
	return (
		value === 'not_started' ||
		value === 'queued' ||
		value === 'processing' ||
		value === 'completed' ||
		value === 'failed'
	);
}
