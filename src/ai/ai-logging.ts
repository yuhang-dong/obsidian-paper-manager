const AI_LOG_PREFIX = '[Paper Manager AI]';

export type AiLogDetails = Record<
	string,
	string | number | boolean | null | undefined
>;

export function logAiEvent(
	event: string,
	details: AiLogDetails = {},
): void {
	console.debug(AI_LOG_PREFIX, {
		event,
		...details,
	});
}

export function logAiPayload(
	event: string,
	payload: unknown,
	details: AiLogDetails = {},
): void {
	console.debug(AI_LOG_PREFIX, {
		event,
		...details,
		payload,
	});
}

export function logAiFailure(
	event: string,
	error: unknown,
	details: AiLogDetails = {},
): void {
	const normalized = normalizeError(error);
	console.error(AI_LOG_PREFIX, {
		event,
		...details,
		...normalized,
	});
}

export function elapsedMs(startedAt: number): number {
	return Date.now() - startedAt;
}

function normalizeError(error: unknown): {
	errorName: string;
	errorMessage: string;
	errorStack?: string;
} {
	if (error instanceof Error) {
		return {
			errorName: error.name,
			errorMessage: error.message,
			errorStack: error.stack,
		};
	}

	return {
		errorName: 'UnknownError',
		errorMessage: String(error),
	};
}
