import { describe, it, expect } from 'vitest';
import { AdaptiveRateController } from '../services/rateController';

describe('AdaptiveRateController', () => {
  it('starts at default concurrency and batch size', () => {
    const c = new AdaptiveRateController();
    expect(c.getConcurrency()).toBe(5);
    expect(c.getBatchSize()).toBe(50);
  });

  it('respects custom config', () => {
    const c = new AdaptiveRateController({ initialConcurrency: 8, initialBatchSize: 20 });
    expect(c.getConcurrency()).toBe(8);
    expect(c.getBatchSize()).toBe(20);
  });

  it('increases concurrency on fast responses', async () => {
    const c = new AdaptiveRateController({ initialConcurrency: 5, maxConcurrency: 10 });
    // Need >10 successes and >1s elapsed to trigger increase
    for (let i = 0; i < 11; i++) c.recordSuccess(100);
    await new Promise(r => setTimeout(r, 1100));
    c.recordSuccess(100);
    expect(c.getConcurrency()).toBeGreaterThan(5);
  });

  it('decreases concurrency on slow responses', async () => {
    const c = new AdaptiveRateController({ initialConcurrency: 5 });
    for (let i = 0; i < 5; i++) c.recordSuccess(5000);
    await new Promise(r => setTimeout(r, 1100));
    c.recordSuccess(5000);
    expect(c.getConcurrency()).toBeLessThan(5);
  });

  it('halves concurrency and batch size on consecutive errors', () => {
    const c = new AdaptiveRateController({ initialConcurrency: 10, initialBatchSize: 80 });
    c.recordError();
    c.recordError();
    expect(c.getConcurrency()).toBeLessThanOrEqual(5);
    expect(c.getBatchSize()).toBeLessThanOrEqual(40);
  });

  it('respects min concurrency floor', () => {
    const c = new AdaptiveRateController({ initialConcurrency: 4, minConcurrency: 2 });
    for (let i = 0; i < 10; i++) c.recordError();
    expect(c.getConcurrency()).toBeGreaterThanOrEqual(2);
  });

  it('reset returns to initial values', () => {
    const c = new AdaptiveRateController();
    c.recordError(); c.recordError(); c.recordError();
    c.reset();
    expect(c.getConcurrency()).toBe(5);
    expect(c.getBatchSize()).toBe(50);
    expect(c.getConsecutiveErrors()).toBe(0);
  });

  it('clears consecutiveErrors on success', () => {
    const c = new AdaptiveRateController();
    c.recordError();
    expect(c.getConsecutiveErrors()).toBe(1);
    c.recordSuccess(500);
    expect(c.getConsecutiveErrors()).toBe(0);
  });

  it('reports stats', () => {
    const c = new AdaptiveRateController();
    c.recordSuccess(200);
    c.recordSuccess(400);
    const stats = c.getStats();
    expect(stats.avgResponseTime).toBe(300);
    expect(stats.successRate).toBeGreaterThan(0);
  });
});
