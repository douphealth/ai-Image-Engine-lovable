import { describe, it, expect, vi } from 'vitest';
import { CircuitBreaker, CircuitOpenError } from '../services/circuitBreaker';

const ok = () => Promise.resolve('ok');
const fail = () => Promise.reject(new Error('boom'));

describe('CircuitBreaker', () => {
  it('starts closed and passes successful calls through', async () => {
    const cb = new CircuitBreaker();
    await expect(cb.execute(ok)).resolves.toBe('ok');
    expect(cb.getStats().state).toBe('closed');
  });

  it('opens after failure + volume thresholds are met', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, volumeThreshold: 3, timeout: 1000 });
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fail)).rejects.toThrow('boom');
    }
    expect(cb.getStats().state).toBe('open');
  });

  it('rejects with CircuitOpenError while open', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, volumeThreshold: 2, timeout: 60000 });
    await expect(cb.execute(fail)).rejects.toThrow();
    await expect(cb.execute(fail)).rejects.toThrow();
    await expect(cb.execute(ok)).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it('transitions to half-open after timeout, then closed on successes', async () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({ failureThreshold: 2, volumeThreshold: 2, successThreshold: 2, timeout: 1000 });
    await expect(cb.execute(fail)).rejects.toThrow();
    await expect(cb.execute(fail)).rejects.toThrow();
    expect(cb.getStats().state).toBe('open');
    vi.setSystemTime(Date.now() + 2000);
    await expect(cb.execute(ok)).resolves.toBe('ok');
    expect(cb.getStats().state).toBe('half-open');
    await expect(cb.execute(ok)).resolves.toBe('ok');
    expect(cb.getStats().state).toBe('closed');
    vi.useRealTimers();
  });

  it('reopens immediately on failure during half-open', async () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker({ failureThreshold: 2, volumeThreshold: 2, timeout: 1000 });
    await expect(cb.execute(fail)).rejects.toThrow();
    await expect(cb.execute(fail)).rejects.toThrow();
    vi.setSystemTime(Date.now() + 2000);
    await expect(cb.execute(fail)).rejects.toThrow('boom');
    expect(cb.getStats().state).toBe('open');
    vi.useRealTimers();
  });

  it('respects errorFilter to ignore certain errors', async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 2, volumeThreshold: 2, timeout: 1000,
      errorFilter: (e: any) => e?.message !== 'ignored',
    });
    for (let i = 0; i < 5; i++) {
      await expect(cb.execute(() => Promise.reject(new Error('ignored')))).rejects.toThrow();
    }
    expect(cb.getStats().state).toBe('closed');
  });

  it('reset returns to clean state', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, volumeThreshold: 1 });
    await expect(cb.execute(fail)).rejects.toThrow();
    expect(cb.getStats().state).toBe('open');
    cb.reset();
    expect(cb.getStats().state).toBe('closed');
    expect(cb.getStats().failures).toBe(0);
  });

  it('forceOpen / forceClose work', () => {
    const cb = new CircuitBreaker();
    cb.forceOpen();
    expect(cb.getStats().state).toBe('open');
    cb.forceClose();
    expect(cb.getStats().state).toBe('closed');
  });
});
