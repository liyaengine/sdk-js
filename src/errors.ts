/**
 * Every non-2xx /v1 response carries `{success:false, error:{code,message}}`
 * (see liyaengine-api's ErrorEnvelope in openapi.yaml). This maps that
 * envelope onto a real Error subclass instead of a plain object, so callers
 * can `catch (err) { if (err instanceof LiyaEngineAPIError) ... }` and get
 * a stack trace like any other thrown error.
 */
export class LiyaEngineAPIError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'LiyaEngineAPIError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** The request never reached the server, or the response wasn't valid JSON. */
export class LiyaEngineNetworkError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'LiyaEngineNetworkError';
  }
}
