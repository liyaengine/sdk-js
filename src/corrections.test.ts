import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { LiyaEngine } from './client.js';
import { LiyaEngineAPIError } from './errors.js';

const BASE_URL = 'https://api.test.liyaengine.ai';
let lastBody: Record<string, unknown> | undefined;

const server = setupServer(
  http.delete(`${BASE_URL}/v1/corrections/:id`, ({ params }) => {
    if (params.id === 'gone') return HttpResponse.json({ success: false, error: { code: 'CORRECTION_NOT_FOUND', message: 'none' } }, { status: 404 });
    return HttpResponse.json({ success: true, data: { deleted: true, already_deleted: params.id === 'twice' } });
  }),
  http.post(`${BASE_URL}/v1/corrections`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    lastBody = body;
    if (body.message_id === 'msg_gone') return HttpResponse.json({ success: false, error: { code: 'MESSAGE_NOT_FOUND', message: 'No answer with that message_id in this workspace.' } }, { status: 404 });
    return HttpResponse.json({ success: true, data: {
      correction_id: 'cor_1', already_recorded: body.message_id === 'msg_again', note: null,
      passages: [
        { document_id: 'doc1', file_name: 'shipping.pdf', rank: 1, attribution: 'passage', counted: true, flagged: true },
        { document_id: 'doc2', file_name: null, rank: 2, attribution: 'document_only', counted: false, flagged: false },
        { document_id: 'doc3', file_name: 'returns.md', rank: 3, attribution: 'lower_ranked', counted: false, flagged: false },
      ],
    } }, { status: 201 });
  }),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => { server.resetHandlers(); lastBody = undefined; });
afterAll(() => server.close());
const client = () => new LiyaEngine({ apiKey: 'liya_test_key', baseUrl: BASE_URL });

describe('corrections.report', () => {
  it('sends the wire fields in snake_case and reads the result in camelCase', async () => {
    const out = await client().corrections.report({ messageId: 'msg_1', correctAnswer: 'Free over $75.', note: 'thumbs down', endUserId: 'u_9' });
    expect(lastBody).toEqual({ message_id: 'msg_1', correct_answer: 'Free over $75.', note: 'thumbs down', end_user_id: 'u_9' });
    expect(out).toMatchObject({ correctionId: 'cor_1', alreadyRecorded: false, note: null });
    expect(out.passages[0]).toEqual({ documentId: 'doc1', fileName: 'shipping.pdf', rank: 1, attribution: 'passage', counted: true, flagged: true });
    expect(out.passages[1]).toMatchObject({ attribution: 'document_only', counted: false });
    expect(out.passages[2]).toMatchObject({ rank: 3, attribution: 'lower_ranked', counted: false });
  });

  it('leaves out the optional fields when they are not given', async () => {
    await client().corrections.report({ messageId: 'msg_1', correctAnswer: 'Right' });
    expect(lastBody).toEqual({ message_id: 'msg_1', correct_answer: 'Right' });
  });

  it('names an agent run by runId and sends run_id instead of message_id', async () => {
    await client().corrections.report({ runId: 'run_7', correctAnswer: 'Right' });
    expect(lastBody).toEqual({ run_id: 'run_7', correct_answer: 'Right' });
    // @ts-expect-error an answer is named by messageId or runId, not both
    client().corrections.report({ messageId: 'm', runId: 'r', correctAnswer: 'x' }).catch(() => undefined);
  });

  it('says when the same answer was reported before', async () => {
    expect((await client().corrections.report({ messageId: 'msg_again', correctAnswer: 'Right' })).alreadyRecorded).toBe(true);
  });

  it('surfaces an unknown answer as a typed error', async () => {
    await expect(client().corrections.report({ messageId: 'msg_gone', correctAnswer: 'Right' })).rejects.toMatchObject({ name: 'LiyaEngineAPIError', code: 'MESSAGE_NOT_FOUND', status: 404 });
    expect(LiyaEngineAPIError).toBeDefined();
  });
});

describe('corrections.delete', () => {
  it('erases a correction and says when it already was', async () => {
    expect(await client().corrections.delete('cor_1')).toEqual({ deleted: true, alreadyDeleted: false });
    expect((await client().corrections.delete('twice')).alreadyDeleted).toBe(true);
    await expect(client().corrections.delete('gone')).rejects.toMatchObject({ code: 'CORRECTION_NOT_FOUND', status: 404 });
  });
});
