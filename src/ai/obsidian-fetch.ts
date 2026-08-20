import { requestUrl } from 'obsidian';
import {
	elapsedMs,
	logAiEvent,
	logAiFailure,
	logAiPayload,
} from './ai-logging';

export const AI_REQUEST_ID_HEADER = 'x-paper-manager-request-id';

/**
 * Adapts Obsidian's cross-origin request API to the Fetch API expected by the
 * AI SDK. Obsidian buffers the response, then Response exposes the buffered
 * bytes as a stream for DefaultChatTransport to decode normally.
 */
type ObsidianFetch = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

export const obsidianFetch: ObsidianFetch = async (input, init = {}) => {
	const request = input instanceof Request ? input : null;
	let url: string;
	if (request) {
		url = request.url;
	} else if (typeof input === 'string') {
		url = input;
	} else if (input instanceof URL) {
		url = input.href;
	} else {
		throw new Error('Unsupported AI request URL');
	}
	const method = init.method ?? request?.method ?? 'GET';
	const headers = new Headers(request?.headers);
	new Headers(init.headers).forEach((value, key) => headers.set(key, value));
	const requestId = headers.get(AI_REQUEST_ID_HEADER) ?? 'unknown';
	// This header is only for correlating plugin-side logs; do not send it.
	headers.delete(AI_REQUEST_ID_HEADER);
	const requestHeaders: Record<string, string> = {};
	headers.forEach((value, key) => {
		requestHeaders[key] = value;
	});
	const body = init.body ?? (request ? await request.text() : undefined);

	if (init.signal?.aborted) {
		throw new DOMException('The request was aborted', 'AbortError');
	}
	if (body !== undefined && body !== null && typeof body !== 'string') {
		throw new Error('Obsidian AI requests currently require a string body');
	}

	const startedAt = Date.now();
	const requestUrlForLog = new URL(url);
	logAiEvent('transport.request.started', {
		requestId,
		method,
		host: requestUrlForLog.host,
		path: requestUrlForLog.pathname,
		bodyCharacters: typeof body === 'string' ? body.length : 0,
	});

	let response;
	try {
		response = await requestUrl({
			url,
			method,
			headers: requestHeaders,
			body: body ?? undefined,
			throw: false,
		});
	} catch (error) {
		logAiFailure('transport.request.failed', error, {
			requestId,
			method,
			host: requestUrlForLog.host,
			path: requestUrlForLog.pathname,
			elapsedMs: elapsedMs(startedAt),
		});
		throw error;
	}

	const responseDetails = {
		requestId,
		method,
		host: requestUrlForLog.host,
		path: requestUrlForLog.pathname,
		status: response.status,
		responseBytes: response.arrayBuffer.byteLength,
		elapsedMs: elapsedMs(startedAt),
	};
	if (response.status >= 400) {
		logAiFailure(
			'transport.response.failed',
			new Error(`AI endpoint returned HTTP ${response.status}`),
			responseDetails,
		);
	} else {
		logAiEvent('transport.response.received', responseDetails);
	}
	logAiPayload(
		'transport.response.body',
		new TextDecoder().decode(response.arrayBuffer),
		responseDetails,
	);

	if (init.signal?.aborted) {
		throw new DOMException('The request was aborted', 'AbortError');
	}

	return new Response(response.arrayBuffer, {
		status: response.status,
		headers: response.headers,
	});
};
