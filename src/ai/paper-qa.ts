import {
	DefaultChatTransport,
	type UIMessage,
	type UIMessageChunk,
} from 'ai';
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

export const QA_BOT_NAME = 'PP';
export const MAX_QA_TURNS = 10;

const QA_TRIGGER_PATTERN = /^@pp\b[：:\s]*(.*)$/i;
const QA_REPLY_PATTERN = /^\*\*PP[：:]\*\*/;

export interface QaTurn {
	question: string;
	answer: string;
}

/**
 * Parses a comment thread like:
 *   @pp 问题1
 *   **PP：** 回答1
 *   @pp 问题2
 */
export function parseQaThread(contents: string): QaTurn[] {
	const turns: QaTurn[] = [];
	let currentQuestion = '';
	let currentAnswer = '';
	let inAnswer = false;

	const flush = (): void => {
		if (currentQuestion.trim()) {
			turns.push({
				question: currentQuestion.trim(),
				answer: currentAnswer.trim(),
			});
		}
		currentQuestion = '';
		currentAnswer = '';
		inAnswer = false;
	};

	for (const line of contents.split('\n')) {
		const questionMatch = QA_TRIGGER_PATTERN.exec(line);
		if (questionMatch) {
			flush();
			currentQuestion = questionMatch[1] ?? '';
			continue;
		}
		if (QA_REPLY_PATTERN.test(line)) {
			inAnswer = true;
			currentAnswer = line.replace(QA_REPLY_PATTERN, '').trim();
			continue;
		}
		if (!currentQuestion.trim()) {
			continue;
		}
		if (inAnswer) {
			currentAnswer += currentAnswer ? `\n${line}` : line;
		} else {
			currentQuestion += currentQuestion ? `\n${line}` : line;
		}
	}

	flush();
	return turns;
}

/** Returns the question when the thread ends with an unanswered @pp question. */
export function getUnansweredQuestion(contents: string): string | null {
	const turns = parseQaThread(contents);
	const last = turns[turns.length - 1];
	if (last && last.question && !last.answer) {
		return last.question;
	}
	return null;
}

/** Appends the PP reply to the comment thread. */
export function appendAgentReply(contents: string, answer: string): string {
	const trimmed = contents.trimEnd();
	const reply = `**${QA_BOT_NAME}：** ${answer.trim()}`;
	return trimmed ? `${trimmed}\n\n${reply}\n` : `${reply}\n`;
}

export interface QaReplyItem {
	contents: string;
	author?: string;
	created?: Date;
}

/**
 * Assembles the conversation from a thread root comment plus its reply
 * annotations. The root question comes first; replies are applied in created
 * order — PP replies fill the open answer, other comments open a new question.
 */
export function buildQaTurnsFromThread(
	rootContents: string,
	replies: QaReplyItem[],
): QaTurn[] {
	const turns: QaTurn[] = [];
	const rootQuestion = getUnansweredQuestion(rootContents);
	if (rootQuestion) {
		turns.push({ question: rootQuestion, answer: '' });
	}

	const sortedReplies = [...replies].sort(
		(left, right) =>
			(left.created?.getTime() ?? 0) - (right.created?.getTime() ?? 0),
	);

	for (const reply of sortedReplies) {
		if (reply.author === QA_BOT_NAME) {
			const open = turns[turns.length - 1];
			if (open && !open.answer && reply.contents.trim()) {
				open.answer = reply.contents.trim();
			}
			continue;
		}
		const question =
			getUnansweredQuestion(reply.contents) ?? reply.contents.trim();
		if (question) {
			turns.push({ question, answer: '' });
		}
	}

	return turns;
}

export interface AnswerQuestionOptions {
	billingKey: string;
	pdfDataUrl: string;
	pdfFilename: string;
	thread: QaTurn[];
	newQuestion: string;
	/** Optional highlighted/selected text from the PDF (with page hint). */
	context?: string;
}

export interface AnswerQuestionResult {
	answer: string;
	usage: PaperManagerUsage;
}

export async function answerPaperQuestion({
	billingKey,
	pdfDataUrl,
	pdfFilename,
	thread,
	newQuestion,
	context,
}: AnswerQuestionOptions): Promise<AnswerQuestionResult> {
	const usage = await startPaperManagerUsage({
		key: billingKey,
		requestId: crypto.randomUUID(),
	});

	const transport = new DefaultChatTransport<UIMessage>({
		api: AI_CHAT_API_ENDPOINT,
		headers: createUsageTokenHeaders(usage.usageToken),
		fetch: obsidianFetch,
		body: {
			model: PAPER_MANAGER_CHAT_MODEL,
			reasoning: 'medium',
			system: QA_SYSTEM_PROMPT,
		},
	});

	const stream = await transport.sendMessages({
		abortSignal: undefined,
		chatId: crypto.randomUUID(),
		messageId: undefined,
		messages: buildQaMessages(
			thread,
			newQuestion,
			pdfDataUrl,
			pdfFilename,
			context,
		),
		trigger: 'submit-message',
	});
	const reader = stream.getReader();
	let answer = '';

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}

			const chunk = value as UIMessageChunk;
			if (chunk.type === 'error') {
				throw new Error(chunk.errorText || 'PP 回答请求失败');
			}
			if (chunk.type === 'abort') {
				throw new Error('PP 回答已取消');
			}
			if (chunk.type === 'text-delta') {
				answer += chunk.delta;
			}
			if (chunk.type === 'finish' && chunk.finishReason === 'error') {
				throw new Error('PP 回答失败');
			}
		}
	} finally {
		reader.releaseLock();
	}

	if (!answer.trim()) {
		throw new Error('PP 没有返回回答');
	}

	return { answer: answer.trim(), usage };
}

function buildQaMessages(
	thread: QaTurn[],
	newQuestion: string,
	pdfDataUrl: string,
	pdfFilename: string,
	context?: string,
): UIMessage[] {
	const messages: UIMessage[] = [];
	const recentTurns = thread.slice(-MAX_QA_TURNS);

	const pdfParts: UIMessage['parts'] = [
		{
			type: 'file',
			mediaType: 'application/pdf',
			filename: pdfFilename,
			url: pdfDataUrl,
		},
	];
	if (context) {
		pdfParts.push({ type: 'text', text: context });
	}

	if (recentTurns.length === 0) {
		messages.push({
			id: crypto.randomUUID(),
			role: 'user',
			parts: [...pdfParts, { type: 'text', text: newQuestion }],
		});
		return messages;
	}

	recentTurns.forEach((turn, index) => {
		const parts = index === 0 ? [...pdfParts] : [];
		parts.push({ type: 'text', text: turn.question });
		messages.push({ id: crypto.randomUUID(), role: 'user', parts });
		messages.push({
			id: crypto.randomUUID(),
			role: 'assistant',
			parts: [{ type: 'text', text: turn.answer }],
		});
	});

	messages.push({
		id: crypto.randomUUID(),
		role: 'user',
		parts: [{ type: 'text', text: newQuestion }],
	});

	return messages;
}

export function arrayBufferToDataUrl(
	data: ArrayBuffer,
	mediaType: string,
): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () =>
			reject(reader.error ?? new Error('Could not read PDF'));
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

const QA_SYSTEM_PROMPT = `You are PP, the reading assistant for an academic paper library.

Answer the user's question based ONLY on the attached PDF. Be accurate and concise, and cite the relevant page or section when possible. Maintain continuity with the earlier questions and answers in the conversation. If the paper does not contain the answer, say so clearly instead of guessing. Answer in the same language as the user's question.`;
