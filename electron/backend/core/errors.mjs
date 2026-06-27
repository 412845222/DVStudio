export class BackendError extends Error {
  constructor(message, code = 'INTERNAL_ERROR', statusCode = 500) {
    super(message)
    this.name = this.constructor.name
    this.code = code
    this.statusCode = statusCode
  }

  toJSON() {
    return {
      ok: false,
      error: this.message,
      code: this.code,
    }
  }
}

export class NotFoundError extends BackendError {
  constructor(message = 'Resource not found') {
    super(message, 'NOT_FOUND', 404)
  }
}

export class ValidationError extends BackendError {
  constructor(message = 'Validation failed') {
    super(message, 'VALIDATION_ERROR', 400)
  }
}

export class AuthError extends BackendError {
  constructor(message = 'Authentication failed') {
    super(message, 'AUTH_ERROR', 401)
  }
}

export class UpstreamError extends BackendError {
  constructor(message = 'Upstream service error') {
    super(message, 'UPSTREAM_ERROR', 502)
  }
}

export class StreamCancelledError extends BackendError {
  constructor(message = 'Stream cancelled') {
    super(message, 'STREAM_CANCELLED', 499)
  }
}

export function isBackendError(err) {
  return err instanceof BackendError
}

export function wrapError(err) {
  if (isBackendError(err)) return err
  const message = err?.message || String(err || 'Unknown error')
  return new BackendError(message)
}

export function internalError(message) {
  return new BackendError(message || 'Internal server error', 'INTERNAL_ERROR', 500)
}

export function invalidParamsError(message) {
  return new ValidationError(message)
}

export function notFoundError(message) {
  return new NotFoundError(message)
}

export function authError(message) {
  return new AuthError(message)
}

export function upstreamError(message) {
  return new UpstreamError(message)
}
