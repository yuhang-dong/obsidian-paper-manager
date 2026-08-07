import type { PaperRecord } from '@/papers/types';
import type { ObsidianPropertyType } from '@/papers/paper-property-schema';
import { PAPER_AI_PROPERTY_SCHEMA } from '@/papers/paper-property-schema';
import type { LibraryTableSettings } from '@/settings';

export const SPECIAL_COLUMN_IDS = {
	select: '__select',
	aiAnalysis: '__ai_analysis',
	actions: '__actions',
} as const;

export type LibraryColumnKind = 'special' | 'known' | 'property' | 'custom';

export interface LibraryColumnMeta {
	id: string;
	label: string;
	type: ObsidianPropertyType;
	kind: LibraryColumnKind;
	/** True when Paper Manager owns the render type and it cannot be changed. */
	lockedType: boolean;
	size: number;
	/** Frontmatter key when this column is backed by a property. */
	sourceKey?: string;
}

export const OBSIDIAN_PROPERTY_TYPES: ReadonlyArray<{
	value: ObsidianPropertyType;
	label: string;
}> = [
	{ value: 'text', label: 'Text' },
	{ value: 'list', label: 'List' },
	{ value: 'number', label: 'Number' },
	{ value: 'checkbox', label: 'Checkbox' },
	{ value: 'date', label: 'Date' },
	{ value: 'datetime', label: 'Date & time' },
];

const KNOWN_SYSTEM_COLUMNS: ReadonlyArray<{
	key: string;
	label: string;
	type: ObsidianPropertyType;
	size: number;
}> = [
	{ key: 'status', label: 'Status', type: 'text', size: 110 },
	{ key: 'ai_status', label: 'AI status', type: 'text', size: 120 },
	{ key: 'ai_model', label: 'AI model', type: 'text', size: 160 },
	{ key: 'ai_error', label: 'AI error', type: 'text', size: 180 },
	{ key: 'ai_updated_at', label: 'AI updated', type: 'datetime', size: 170 },
	{ key: 'created_at', label: 'Created', type: 'datetime', size: 170 },
	{ key: 'updated_at', label: 'Updated', type: 'datetime', size: 170 },
];

const KNOWN_COLUMN_ORDER: readonly string[] = [
	'title',
	'authors',
	'year',
	'status',
	'journal',
	'literature_type',
	'abstract',
	'keywords',
	'research_background',
	'research_results',
	'research_methods',
	'paper_summary',
	'innovations',
	'application_value',
	'limitations',
	'future_directions',
	'ai_status',
	'ai_model',
	'ai_updated_at',
	'ai_error',
	'created_at',
	'updated_at',
];

const LONG_TEXT_KEYS = new Set<string>([
	'abstract',
	'research_background',
	'research_results',
	'research_methods',
	'paper_summary',
	'innovations',
	'application_value',
	'limitations',
	'future_directions',
]);

const SIZE_BY_TYPE: Record<ObsidianPropertyType, number> = {
	text: 180,
	list: 200,
	number: 110,
	checkbox: 80,
	date: 130,
	datetime: 170,
};

export function humanizePropertyKey(key: string): string {
	const words = key
		.replace(/_/g, ' ')
		.replace(/\bai\b/gi, 'AI')
		.replace(/\bpdf\b/gi, 'PDF')
		.replace(/\bid\b/gi, 'ID')
		.replace(/\burl\b/gi, 'URL')
		.replace(/\bapi\b/gi, 'API')
		.trim();

	return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}

export function columnSizeFor(type: ObsidianPropertyType, key?: string): number {
	if (key === 'title') {
		return 260;
	}
	if (key !== undefined && LONG_TEXT_KEYS.has(key)) {
		return 240;
	}
	return SIZE_BY_TYPE[type];
}

export function inferPropertyType(values: readonly unknown[]): ObsidianPropertyType {
	const nonEmpty = values.filter(
		(value) =>
			value !== null &&
			value !== undefined &&
			value !== '' &&
			!(Array.isArray(value) && value.length === 0),
	);

	if (nonEmpty.length === 0) {
		return 'text';
	}
	if (nonEmpty.every((value) => typeof value === 'boolean')) {
		return 'checkbox';
	}
	if (nonEmpty.every((value) => typeof value === 'number')) {
		return 'number';
	}
	if (nonEmpty.every((value) => Array.isArray(value))) {
		return 'list';
	}
	if (nonEmpty.every((value) => isDateValue(value))) {
		return nonEmpty.some((value) => isDateTimeValue(value))
			? 'datetime'
			: 'date';
	}
	return 'text';
}

function isDateValue(value: unknown): boolean {
	return (
		value instanceof Date ||
		(typeof value === 'string' &&
			/^\d{4}-\d{2}-\d{2}/.test(value))
	);
}

function isDateTimeValue(value: unknown): boolean {
	if (value instanceof Date) {
		return (
			value.getHours() !== 0 ||
			value.getMinutes() !== 0 ||
			value.getSeconds() !== 0
		);
	}
	return (
		typeof value === 'string' &&
		/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value)
	);
}

function collectPropertyCatalog(
	papers: readonly PaperRecord[],
): Map<string, unknown[]> {
	const catalog = new Map<string, unknown[]>();

	for (const paper of papers) {
		for (const [key, value] of Object.entries(paper.properties)) {
			const values = catalog.get(key) ?? [];
			values.push(value);
			catalog.set(key, values);
		}
	}

	return catalog;
}

export function buildLibraryColumns(
	papers: readonly PaperRecord[],
	settings: LibraryTableSettings,
): LibraryColumnMeta[] {
	const catalog = collectPropertyCatalog(papers);
	const knownMeta = new Map<string, LibraryColumnMeta>();

	for (const field of PAPER_AI_PROPERTY_SCHEMA) {
		knownMeta.set(field.frontmatterKey, {
			id: field.frontmatterKey,
			label: field.label,
			type: field.propertyType,
			kind: 'known',
			lockedType: true,
			size: columnSizeFor(field.propertyType, field.frontmatterKey),
			sourceKey: field.frontmatterKey,
		});
	}
	for (const system of KNOWN_SYSTEM_COLUMNS) {
		knownMeta.set(system.key, {
			id: system.key,
			label: system.label,
			type: system.type,
			kind: 'known',
			lockedType: true,
			size: system.size,
			sourceKey: system.key,
		});
	}

	const columns: LibraryColumnMeta[] = [
		{
			id: SPECIAL_COLUMN_IDS.select,
			label: '',
			type: 'checkbox',
			kind: 'special',
			lockedType: true,
			size: 40,
		},
	];

	for (const key of KNOWN_COLUMN_ORDER) {
		if (catalog.has(key)) {
			const meta = knownMeta.get(key);
			if (meta) {
				columns.push(meta);
			}
		}
	}

	const customByProperty = new Map(
		settings.customColumns.map((custom) => [custom.property, custom]),
	);

	const unknownKeys = Array.from(catalog.keys())
		.filter((key) => !knownMeta.has(key) && !customByProperty.has(key))
		.sort((left, right) => left.localeCompare(right));

	for (const key of unknownKeys) {
		columns.push({
			id: key,
			label: humanizePropertyKey(key),
			type: inferPropertyType(catalog.get(key) ?? []),
			kind: 'property',
			lockedType: false,
			size: columnSizeFor('text', key),
			sourceKey: key,
		});
	}

	for (const custom of settings.customColumns) {
		if (knownMeta.has(custom.property)) {
			continue;
		}
		columns.push({
			id: custom.property,
			label: humanizePropertyKey(custom.property),
			type: custom.type,
			kind: 'custom',
			lockedType: false,
			size: columnSizeFor(custom.type, custom.property),
			sourceKey: custom.property,
		});
	}

	columns.push(
		{
			id: SPECIAL_COLUMN_IDS.aiAnalysis,
			label: 'AI analysis',
			type: 'text',
			kind: 'special',
			lockedType: true,
			size: 132,
		},
		{
			id: SPECIAL_COLUMN_IDS.actions,
			label: '',
			type: 'text',
			kind: 'special',
			lockedType: true,
			size: 64,
		},
	);

	return columns;
}

export function cloneLibraryTableSettings(
	settings: LibraryTableSettings,
): LibraryTableSettings {
	return {
		visibility: { ...settings.visibility },
		customColumns: settings.customColumns.map((custom) => ({ ...custom })),
	};
}

export function formatPropertyValue(
	value: unknown,
	type: ObsidianPropertyType,
): string {
	if (value === null || value === undefined || value === '') {
		return '—';
	}

	if (type === 'list') {
		const items = Array.isArray(value) ? value : [value];
		return items
			.map((item) => stringifyPropertyValue(item))
			.filter((item) => item !== '')
			.join(', ');
	}
	if (type === 'checkbox') {
		return value ? 'Yes' : 'No';
	}
	if (type === 'date' || type === 'datetime') {
		return formatDateLike(value);
	}

	return Array.isArray(value)
		? value.map((item) => stringifyPropertyValue(item)).join(', ')
		: stringifyPropertyValue(value);
}

function formatDateLike(value: unknown): string {
	if (value instanceof Date) {
		return value.toISOString().replace('T', ' ').slice(0, 16);
	}
	return String(value).replace('T', ' ').slice(0, 16);
}

export function stringifyPropertyValue(value: unknown): string {
	if (value instanceof Date) {
		return value.toISOString();
	}
	if (typeof value === 'object' && value !== null) {
		return JSON.stringify(value);
	}
	return String(value);
}
