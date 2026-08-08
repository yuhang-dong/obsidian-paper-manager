import {
	AI_WORKER_BASE_URL,
	PAPER_MANAGER_PRODUCT_TYPE,
} from './config';
import { requestUrl } from 'obsidian';

export interface PaperManagerUsage {
	usageId: string;
	usageToken: string;
	productType: typeof PAPER_MANAGER_PRODUCT_TYPE;
	creditsCharged: number;
	remainingCredits: number;
}

export interface PaperManagerKeyStatus {
	valid: true;
	productType: typeof PAPER_MANAGER_PRODUCT_TYPE;
	remainingCredits: number;
}

export interface StartPaperManagerUsageOptions {
	key: string;
	requestId: string;
}

export async function validatePaperManagerKey(
	key: string,
): Promise<PaperManagerKeyStatus> {
	const normalizedKey = key.trim();
	if (!normalizedKey) {
		throw new Error('A billing key is required');
	}

	const response = await requestUrl({
		url: `${AI_WORKER_BASE_URL}/api/keys/validate`,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			key: normalizedKey,
			productType: PAPER_MANAGER_PRODUCT_TYPE,
		}),
		throw: false,
	});
	const payload = parseJson(response.text);

	if (response.status < 200 || response.status >= 300) {
		throw new Error(billingErrorMessage(payload, response.status));
	}
	if (!isPaperManagerKeyStatus(payload)) {
		throw new Error('Billing service returned an invalid key response');
	}

	return payload;
}

export async function startPaperManagerUsage({
	key,
	requestId,
}: StartPaperManagerUsageOptions): Promise<PaperManagerUsage> {
	const normalizedKey = key.trim();
	const normalizedRequestId = requestId.trim();
	if (!normalizedKey) {
		throw new Error('A billing key is required');
	}
	if (!normalizedRequestId) {
		throw new Error('A request ID is required');
	}

	const response = await requestUrl({
		url: `${AI_WORKER_BASE_URL}/api/usage/start`,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			key: normalizedKey,
			productType: PAPER_MANAGER_PRODUCT_TYPE,
			requestId: normalizedRequestId,
		}),
		throw: false,
	});
	const payload = parseJson(response.text);

	if (response.status < 200 || response.status >= 300) {
		throw new Error(billingErrorMessage(payload, response.status));
	}
	if (!isPaperManagerUsage(payload)) {
		throw new Error('Billing service returned an invalid usage response');
	}

	return payload;
}

export function createUsageTokenHeaders(
	usageToken: string,
): Record<'x-usage-token', string> {
	const normalizedToken = usageToken.trim();
	if (!normalizedToken) {
		throw new Error('A usage token is required');
	}

	return {
		'x-usage-token': normalizedToken,
	};
}

function isPaperManagerUsage(value: unknown): value is PaperManagerUsage {
	if (!isRecord(value)) {
		return false;
	}

	return (
		isNonEmptyString(value.usageId) &&
		isNonEmptyString(value.usageToken) &&
		value.productType === PAPER_MANAGER_PRODUCT_TYPE &&
		isFiniteNumber(value.creditsCharged) &&
		isFiniteNumber(value.remainingCredits)
	);
}

function isPaperManagerKeyStatus(
	value: unknown,
): value is PaperManagerKeyStatus {
	if (!isRecord(value)) {
		return false;
	}

	return (
		value.valid === true &&
		value.productType === PAPER_MANAGER_PRODUCT_TYPE &&
		isFiniteNumber(value.remainingCredits)
	);
}

function billingErrorMessage(payload: unknown, status: number): string {
	if (isRecord(payload)) {
		const message = payload.message ?? payload.error;
		if (isNonEmptyString(message)) {
			return message;
		}
	}

	return `Billing request failed (${status})`;
}

function parseJson(value: string): unknown {
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return null;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}
