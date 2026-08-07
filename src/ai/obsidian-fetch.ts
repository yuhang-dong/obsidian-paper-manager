import { requestUrl } from 'obsidian';

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

	const response = await requestUrl({
		url,
		method,
		headers: requestHeaders,
		body: body ?? undefined,
		throw: false,
	});

	if (init.signal?.aborted) {
		throw new DOMException('The request was aborted', 'AbortError');
	}

	return new Response(response.arrayBuffer, {
		status: response.status,
		headers: response.headers,
	});
};
