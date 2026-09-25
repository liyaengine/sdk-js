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

  /** Shared fetch/retry/error-envelope core — returns the parsed body as-is (past the success check), not unwrapped to `.data`. Almost every endpoint wants `request()` below instead. */
  private async requestEnvelope<T>(method: string, path: string, body?: unknown): Promise<T> {
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

        let json: (T & { success: true }) | ErrorEnvelope;
        try {
          json = await res.json();
        } catch (parseErr) {
          throw new LiyaEngineNetworkError(`Invalid JSON response (status ${res.status})`, parseErr);
        }

        if (!json.success) {
          throw new LiyaEngineAPIError(res.status, json.error.code, json.error.message, json.error.details);
        }
        return json;
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

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const json = await this.requestEnvelope<SuccessEnvelope<T>>(method, path, body);
    return json.data;
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

  /**
   * For the rare endpoint whose envelope has extra top-level sibling fields
   * beyond `{success, data}` (today: only `POST /v1/run`, which also returns
   * sibling `metadata`/`usage`) — returns the parsed body as-is, past the
   * standard success/error check, instead of unwrapping to just `.data`.
   */
  postEnvelope<T>(path: string, body?: unknown): Promise<T> {
    return this.requestEnvelope<T>('POST', path, body);
  }

  /**
   * Streams `POST {path}` as server-sent events, yielding each parsed
   * `data: {...}` frame in order. No retries — a stream is a single
   * long-lived attempt, not a single request with a bounded response the
   * usual retry-with-backoff logic can safely redo. No timeoutMs either:
   * this is a token-by-token stream of unbounded duration, not a single
   * fetch race against a fixed deadline.
   *
   * A rejection *before* the stream opens (missing field, plan gate) arrives
   * as a normal `{success:false,error}` JSON body over a non-2xx status —
   * thrown as a LiyaEngineAPIError, exactly like `request()`. Once the
   * stream has opened, every subsequent failure arrives in-band as a frame
   * with the caller's own `type` field (e.g. `'error'`) — this method has no
   * opinion on frame shape, callers discriminate by whatever `type` values
   * that specific endpoint documents.
   */
  async *stream<T extends { type: string }>(path: string, body?: unknown): AsyncGenerator<T, void, undefined> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/event-stream')) {
      // A pre-flight rejection — the normal {success,error} envelope, not SSE.
      let json: ErrorEnvelope | Record<string, unknown>;
      try {
        json = await res.json();
      } catch (parseErr) {
        throw new LiyaEngineNetworkError(`Invalid JSON response (status ${res.status})`, parseErr);
      }
      if ((json as ErrorEnvelope).success === false) {
        const { code, message, details } = (json as ErrorEnvelope).error;
        throw new LiyaEngineAPIError(res.status, code, message, details);
      }
      throw new LiyaEngineNetworkError(`Unexpected non-streaming response (status ${res.status})`);
    }

    if (!res.body) {
      throw new LiyaEngineNetworkError('Streaming response had no body');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let frameEnd: number;
        while ((frameEnd = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, frameEnd);
          buffer = buffer.slice(frameEnd + 2);
          const dataLine = frame.split('\n').find(line => line.startsWith('data: '));
          if (!dataLine) continue;
          yield JSON.parse(dataLine.slice('data: '.length)) as T;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
