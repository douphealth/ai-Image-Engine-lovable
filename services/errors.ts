// services/errors.ts - Centralized error handling

export class APIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public isRetryable: boolean = false,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'APIError';
  }

  static fromResponse(response: Response, body?: string): APIError {
    const isRetryable = response.status >= 500 || response.status === 429;
    return new APIError(
      `API request failed: ${response.status} ${response.statusText}${body ? ` - ${body}` : ''}`,
      response.status,
      isRetryable
    );
  }

  static fromError(error: unknown): APIError {
    if (error instanceof APIError) return error;
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return new APIError('Network error: Unable to connect', undefined, true, error);
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      return new APIError('Request was cancelled', undefined, false, error);
    }
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return new APIError(message, undefined, false, error);
  }
}

export class RateLimitError extends APIError {
  constructor(
    message: string,
    public retryAfter?: number
  ) {
    super(message, 429, true);
    this.name = 'RateLimitError';
  }
}

export class AuthenticationError extends APIError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401, false);
    this.name = 'AuthenticationError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof APIError) {
    if (error.statusCode === 401) return 'Authentication failed. Check your credentials.';
    if (error.statusCode === 403) return 'Access forbidden. Check your permissions.';
    if (error.statusCode === 404) return 'Resource not found. Check the URL.';
    if (error.statusCode === 429) return 'Rate limited. Please wait before retrying.';
    if (error.statusCode && error.statusCode >= 500) return 'Server error. Please try again later.';
    return error.message;
  }
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return 'Network error. Check your connection and CORS settings.';
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'Operation was cancelled.';
  }
  return error instanceof Error ? error.message : 'An unknown error occurred';
};

export const isRetryableError = (error: unknown): boolean => {
  if (error instanceof APIError) return error.isRetryable;
  if (error instanceof TypeError) return true; // Network errors are retryable
  return false;
};
