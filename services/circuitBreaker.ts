// services/circuitBreaker.ts - Enterprise circuit breaker with half-open state

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  volumeThreshold: number;
  errorFilter?: (error: unknown) => boolean;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  totalRequests: number;
  lastFailure: number | null;
  lastSuccess: number | null;
  nextAttempt: number | null;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,
  volumeThreshold: 5,
  errorFilter: () => true,
};

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private totalRequests = 0;
  private lastFailure: number | null = null;
  private lastSuccess: number | null = null;
  private halfOpenSuccesses = 0;
  private config: CircuitBreakerConfig;
  private listeners: Set<(stats: CircuitBreakerStats) => void> = new Set();

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.transitionTo('half-open');
      } else {
        throw new CircuitOpenError('Circuit breaker is open', this.getTimeUntilNextAttempt());
      }
    }

    this.totalRequests++;

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  private onSuccess(): void {
    this.lastSuccess = Date.now();
    this.successes++;

    if (this.state === 'half-open') {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.config.successThreshold) {
        this.transitionTo('closed');
      }
    } else if (this.state === 'closed') {
      this.failures = 0;
    }

    this.notifyListeners();
  }

  private onFailure(error: unknown): void {
    if (!this.config.errorFilter?.(error)) {
      return;
    }

    this.lastFailure = Date.now();
    this.failures++;

    if (this.state === 'half-open') {
      this.transitionTo('open');
    } else if (this.state === 'closed') {
      if (
        this.totalRequests >= this.config.volumeThreshold &&
        this.failures >= this.config.failureThreshold
      ) {
        this.transitionTo('open');
      }
    }

    this.notifyListeners();
  }

  private transitionTo(newState: CircuitState): void {
    const prevState = this.state;
    this.state = newState;

    if (newState === 'closed') {
      this.failures = 0;
      this.halfOpenSuccesses = 0;
    } else if (newState === 'half-open') {
      this.halfOpenSuccesses = 0;
    }

    console.log(`Circuit breaker: ${prevState} -> ${newState}`);
    this.notifyListeners();
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailure) return true;
    return Date.now() - this.lastFailure >= this.config.timeout;
  }

  private getTimeUntilNextAttempt(): number {
    if (!this.lastFailure) return 0;
    const elapsed = Date.now() - this.lastFailure;
    return Math.max(0, this.config.timeout - elapsed);
  }

  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      totalRequests: this.totalRequests,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
      nextAttempt: this.state === 'open' ? this.lastFailure! + this.config.timeout : null,
    };
  }

  subscribe(listener: (stats: CircuitBreakerStats) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const stats = this.getStats();
    this.listeners.forEach(listener => listener(stats));
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.totalRequests = 0;
    this.lastFailure = null;
    this.lastSuccess = null;
    this.halfOpenSuccesses = 0;
    this.notifyListeners();
  }

  forceOpen(): void {
    this.transitionTo('open');
    this.lastFailure = Date.now();
  }

  forceClose(): void {
    this.transitionTo('closed');
  }
}

export class CircuitOpenError extends Error {
  constructor(
    message: string,
    public retryAfter: number
  ) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

// Global circuit breakers for different services
export const circuitBreakers = {
  wordpress: new CircuitBreaker({ failureThreshold: 5, timeout: 60000 }),
  gemini: new CircuitBreaker({ failureThreshold: 3, timeout: 30000 }),
  pollinations: new CircuitBreaker({ failureThreshold: 10, timeout: 15000 }),
};

export const withCircuitBreaker = <T>(
  breaker: CircuitBreaker,
  operation: () => Promise<T>
): Promise<T> => {
  return breaker.execute(operation);
};

export default CircuitBreaker;
