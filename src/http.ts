import { LiyaEngineAPIError, LiyaEngineNetworkError } from './errors.js';

export interface HttpClientOptions {
  apiKey: string;
  baseUrl: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetch?: typeof fetch;
}

interface SuccessEnvelope<T> {
  success: true;
  data: T;
}

interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Thin fetch wrapper: bearer auth, JSON in/out, the {success,data} /
 * {success,error} envelope unwrapped into a return value or a thrown
 * LiyaEngineAPIError, and retry-with-backoff on 429/5xx (not on 4xx, which
 * are the caller's own mistake and won't succeed on retry).
 */
export class HttpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (RETRYABLE_STATUS.has(res.status) && attempt < this.maxRetries) {
          lastError = new LiyaEngineAPIError(res.status, 'RETRYABLE', `Retryable status ${res.status}`);
          await sleep(2 ** attempt * 250);
          continue;
        }

        let json: SuccessEnvelope<T> | ErrorEnvelope;
        try {
          json = await res.json();
        } catch (parseErr) {
          throw new LiyaEngineNetworkError(`Invalid JSON response (status ${res.status})`, parseErr);
        }

        if (!json.success) {
          throw new LiyaEngineAPIError(res.status, json.error.code, json.error.message, json.error.details);
        }
        return json.data;
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof LiyaEngineAPIError) throw err;
        if (err instanceof DOMException && err.name === 'AbortError') {
          lastError = new LiyaEngineNetworkError(`Request timed out after ${this.timeoutMs}ms`, err);
        } else if (err instanceof LiyaEngineNetworkError) {
          throw err;
        } else {
          lastError = new LiyaEngineNetworkError('Network request failed', err);
        }
        if (attempt >= this.maxRetries) throw lastError;
        await sleep(2 ** attempt * 250);
      }
    }

    throw lastError instanceof Error ? lastError : new LiyaEngineNetworkError('Request failed');
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }
  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }
  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }
  delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}
