import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { LiyaEngine } from './client.js';

const BASE_URL = 'https://api.test.liyaengine.ai';
let body: unknown;

const server = setupServer(
  http.post(`${BASE_URL}/v1/files/parse`, async ({ request }) => {
    body = await request.json();
    return HttpResponse.json({ success: true, data: { file_name: 'acord.png', format: 'image', text: 'Insured: Harbor Foods', warnings: [], transcribed_pages: [1] } });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = () => new LiyaEngine({ apiKey: 'liya_test', baseUrl: BASE_URL, maxRetries: 0 });

it('parses a file and sends snake_case fields', async () => {
  const parsed = await client().files.parse({ fileName: 'acord.png', fileBase64: 'iVBORw0K' });
  expect(body).toEqual({ file_name: 'acord.png', file_base64: 'iVBORw0K' });
  expect(parsed).toMatchObject({ format: 'image', text: 'Insured: Harbor Foods', transcribed_pages: [1] });
});
