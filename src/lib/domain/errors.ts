/**
 * Domain errors. Messages are written for operators and safe to surface in the
 * admin UI; unexpected errors are logged and replaced with a generic message.
 */
export class DomainError extends Error {
  readonly code: string;

  constructor(message: string, code = "domain_error") {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string) {
    super(`${entity} not found.`, "not_found");
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = "You do not have permission to perform this action.") {
    super(message, "unauthorized");
    this.name = "UnauthorizedError";
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, "conflict");
    this.name = "ConflictError";
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

export function toUserMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (error instanceof DomainError) return error.message;
  console.error("[HAVEN] unexpected error:", error);
  return fallback;
}
