import {
	PAPER_AI_PROPERTY_SCHEMA,
	isBodySectionField,
	type PaperAiProperties,
} from './paper-property-schema';

const OVERVIEW_GROUP_HEADINGS: Record<'research' | 'evaluation', string> = {
	research: 'Research',
	evaluation: 'Evaluation',
};

export function buildOverviewMarkdown(analysis: PaperAiProperties): string {
	const lines: string[] = ['## Overview', ''];

	for (const group of ['research', 'evaluation'] as const) {
		const sections: string[] = [];

		for (const field of PAPER_AI_PROPERTY_SCHEMA) {
			if (field.group !== group || !isBodySectionField(field.id)) {
				continue;
			}
			const value = String(analysis[field.id] ?? '').trim();
			if (!value) {
				continue;
			}
			sections.push(`#### ${field.label}`, '', value, '');
		}

		if (sections.length > 0) {
			lines.push(
				`### ${OVERVIEW_GROUP_HEADINGS[group]}`,
				'',
				...sections,
			);
		}
	}

	return lines.join('\n').trimEnd();
}

export function replaceOverviewSection(
	content: string,
	overviewMarkdown: string,
): string {
	const lines = content.split('\n');
	let overviewStart = -1;
	let sectionEnd = lines.length;

	for (let index = 0; index < lines.length; index++) {
		if (/^## Overview\s*$/.test(lines[index] ?? '')) {
			overviewStart = index;
			continue;
		}
		if (
			overviewStart >= 0 &&
			/^## (Paper|My notes)\s*$/.test(lines[index] ?? '')
		) {
			sectionEnd = index;
			break;
		}
	}

	if (overviewStart >= 0) {
		return [
			...lines.slice(0, overviewStart),
			overviewMarkdown,
			'',
			...lines.slice(sectionEnd),
		].join('\n');
	}

	// No Overview section yet: insert it right after the note title.
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index] ?? '';
		if (/^#\s/.test(line) && !/^##\s/.test(line)) {
			return [
				...lines.slice(0, index + 1),
				'',
				overviewMarkdown,
				...lines.slice(index + 1),
			].join('\n');
		}
	}

	return `${content.trimEnd()}\n\n${overviewMarkdown}\n`;
}
