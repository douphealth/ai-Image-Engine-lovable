// services/rateController.ts - Adaptive Rate Controller (extracted from App.tsx)

export interface RateControllerConfig {
  initialConcurrency: number;
  maxConcurrency: number;
  minConcurrency: number;
  initialBatchSize: number;
  maxBatchSize: number;
  minBatchSize: number;
  fastResponseThreshold: number;
  slowResponseThreshold: number;
}

const DEFAULT_CONFIG: RateControllerConfig = {
  initialConcurrency: 5,
  maxConcurrency: 15,
  minConcurrency: 2,
  initialBatchSize: 50,
  maxBatchSize: 100,
  minBatchSize: 10,
  fastResponseThreshold: 800,
  slowResponseThreshold: 3000,
};

export class AdaptiveRateController {
  private concurrency: number;
  private batchSize: number;
  private responseTimes: number[] = [];
  private errorCount = 0;
  private successCount = 0;
  private lastAdjustment = 0;
  private consecutiveErrors = 0;
  private config: RateControllerConfig;

  constructor(config: Partial<RateControllerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.concurrency = this.config.initialConcurrency;
    this.batchSize = this.config.initialBatchSize;
  }

  recordSuccess(responseTime: number): void {
    this.responseTimes.push(responseTime);
    this.successCount++;
    this.consecutiveErrors = 0;
    this.errorCount = Math.max(0, this.errorCount - 1);
    
    if (this.responseTimes.length > 30) this.responseTimes.shift();
    
    const now = Date.now();
    if (now - this.lastAdjustment > 1000) {
      this.adjust();
      this.lastAdjustment = now;
    }
  }

  recordError(): void {
    this.errorCount++;
    this.consecutiveErrors++;
    this.adjust();
  }

  private adjust(): void {
    const avgResponseTime = this.responseTimes.length > 0
      ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length
      : this.config.slowResponseThreshold;

    if (avgResponseTime < this.config.fastResponseThreshold && 
        this.consecutiveErrors === 0 && 
        this.successCount > 10) {
      this.concurrency = Math.min(this.config.maxConcurrency, this.concurrency + 1);
    } else if (avgResponseTime > this.config.slowResponseThreshold) {
      this.concurrency = Math.max(this.config.minConcurrency, this.concurrency - 1);
    }
    
    if (this.consecutiveErrors >= 2) {
      this.concurrency = Math.max(this.config.minConcurrency, Math.floor(this.concurrency / 2));
      this.batchSize = Math.max(this.config.minBatchSize, Math.floor(this.batchSize / 2));
    }
  }

  getConcurrency(): number { return this.concurrency; }
  getBatchSize(): number { return this.batchSize; }
  getConsecutiveErrors(): number { return this.consecutiveErrors; }

  getStats() {
    return {
      concurrency: this.concurrency,
      batchSize: this.batchSize,
      avgResponseTime: this.responseTimes.length > 0
        ? Math.round(this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length)
        : 0,
      successRate: this.successCount / (this.successCount + this.errorCount) || 1,
    };
  }

  reset(): void {
    this.concurrency = this.config.initialConcurrency;
    this.batchSize = this.config.initialBatchSize;
    this.responseTimes = [];
    this.errorCount = 0;
    this.successCount = 0;
    this.consecutiveErrors = 0;
  }
}

export default AdaptiveRateController;
