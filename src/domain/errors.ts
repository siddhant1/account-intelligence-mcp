/**
 * Domain error hierarchy. Services throw these; transport adapters translate
 * them into MCP tool errors or HTTP responses. Anything that is not an
 * AppError is treated as an unexpected internal failure.
 */
export type ErrorCode =
  'INVALID_ARGUMENT' | 'NOT_FOUND' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'RATE_LIMITED' | 'EXPIRED' | 'INTERNAL';

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    /** Optional guidance for the caller (often an LLM) on how to recover. */
    readonly hint?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      ...(this.hint ? { hint: this.hint } : {}),
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export class ValidationError extends AppError {
  constructor(message: string, hint?: string, details?: Record<string, unknown>) {
    super('INVALID_ARGUMENT', message, hint, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, hint?: string, details?: Record<string, unknown>) {
    super('NOT_FOUND', message, hint, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string, hint?: string, details?: Record<string, unknown>) {
    super('FORBIDDEN', message, hint, details);
  }
}

export class ExpiredError extends AppError {
  constructor(message: string, hint?: string) {
    super('EXPIRED', message, hint);
  }
}
