// services/retry.ts - Exponential backoff retry logic

import { RetryConfig } from '../types';
import { APIError, isRetryableError, RateLimitError } from './errors';

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
};

export const sleep = (ms: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms));

export const calculateBackoff = (
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number => {
  const delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt);
  const jitter = Math.random() * 1000; // Add jitter to prevent thundering herd
  return Math.min(delay + jitter, config.maxDelay);
};

export interface RetryOptions<T> {
  operation: () => Promise<T>;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delay: number) => void;
  config?: Partial<RetryConfig>;
  signal?: AbortSignal;
}

export const withRetry = async <T>({
  operation,
  shouldRetry = isRetryableError,
  onRetry,
  config = {},
  signal,
}: RetryOptions<T>): Promise<T> => {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: unknown;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    // Check if aborted before attempting
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Don't retry if aborted
      if (signal?.aborted) {
        throw error;
      }

      // Check if we should retry
      const isLastAttempt = attempt === retryConfig.maxRetries;
      if (isLastAttempt || !shouldRetry(error, attempt)) {
        throw error;
      }

      // Handle rate limit with Retry-After header
      let delay = calculateBackoff(attempt, retryConfig);
      if (error instanceof RateLimitError && error.retryAfter) {
        delay = Math.max(delay, error.retryAfter * 1000);
      }

      // Notify about retry
      onRetry?.(error, attempt + 1, delay);

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw lastError;
};

// Fetch with timeout and retry
export const fetchWithRetry = async (
  url: string,
  options: RequestInit = {},
  retryConfig?: Partial<RetryConfig>,
  timeout = 60000
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // Merge abort signals
  const originalSignal = options.signal;
  if (originalSignal) {
    originalSignal.addEventListener('abort', () => controller.abort());
  }

  try {
    return await withRetry({
      operation: async () => {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        if (!response.ok) {
          // Check for rate limiting
          if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After');
            throw new RateLimitError(
              'Rate limited',
              retryAfter ? parseInt(retryAfter, 10) : undefined
            );
          }
          throw APIError.fromResponse(response);
        }

        return response;
      },
      config: retryConfig,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

export default { withRetry, fetchWithRetry, sleep, calculateBackoff };
