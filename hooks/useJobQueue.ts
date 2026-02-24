
// hooks/useJobQueue.ts - Enterprise Adaptive Job Queue

import { useRef, useCallback, useState, useEffect } from 'react';

export interface QueueJob<T = unknown> {
  id: string | number;
  data: T;
  priority?: number;
  retries?: number;
  maxRetries?: number;
  createdAt?: number;
}

export interface QueueOptions<T, R> {
  processor: (job: QueueJob<T>, signal: AbortSignal) => Promise<R>;
  concurrency?: number;
  maxRetries?: number;
  retryDelay?: number;
  onJobStart?: (job: QueueJob<T>) => void;
  onJobComplete?: (job: QueueJob<T>, result: R) => void;
  onJobError?: (job: QueueJob<T>, error: Error) => void;
  onJobRetry?: (job: QueueJob<T>, attempt: number, error: Error) => void;
  onQueueEmpty?: () => void;
  onProgress?: (completed: number, total: number, active: number) => void;
}

export interface QueueState {
  isProcessing: boolean;
  isPaused: boolean;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  activeJobs: number;
  retriedJobs: number;
  averageProcessingTime: number;
  currentConcurrency: number; // New metric
}

export const useJobQueue = <T, R = void>(options: QueueOptions<T, R>) => {
  const {
    processor,
    concurrency = 3,
    maxRetries = 3,
    retryDelay = 2000,
    onJobStart,
    onJobComplete,
    onJobError,
    onJobRetry,
    onQueueEmpty,
    onProgress,
  } = options;

  const queueRef = useRef<QueueJob<T>[]>([]);
  const activeJobsRef = useRef<Map<string | number, AbortController>>(new Map());
  const isPausedRef = useRef(false);
  
  // ADAPTIVE CONCURRENCY STATE
  const currentConcurrencyRef = useRef(concurrency);
  const consecutiveErrorsRef = useRef(0);
  
  const metricsRef = useRef({
    completed: 0,
    failed: 0,
    retried: 0,
    total: 0,
    processingTimes: [] as number[],
  });

  const [state, setState] = useState<QueueState>({
    isProcessing: false,
    isPaused: false,
    totalJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    activeJobs: 0,
    retriedJobs: 0,
    averageProcessingTime: 0,
    currentConcurrency: concurrency,
  });

  const updateState = useCallback(() => {
    setState({
      isProcessing: queueRef.current.length > 0 || activeJobsRef.current.size > 0,
      isPaused: isPausedRef.current,
      totalJobs: metricsRef.current.total,
      completedJobs: metricsRef.current.completed,
      failedJobs: metricsRef.current.failed,
      activeJobs: activeJobsRef.current.size,
      retriedJobs: metricsRef.current.retried,
      averageProcessingTime: 0,
      currentConcurrency: currentConcurrencyRef.current,
    });
  }, []);

  // Adaptive Throttling Logic
  const handleSuccess = () => {
    consecutiveErrorsRef.current = 0;
    // Slowly ramp up if we are below max concurrency
    if (currentConcurrencyRef.current < concurrency && Math.random() > 0.8) {
        currentConcurrencyRef.current++;
        updateState();
    }
  };

  const handleError = () => {
    consecutiveErrorsRef.current++;
    // Rapidly scale down on errors
    if (consecutiveErrorsRef.current > 2 && currentConcurrencyRef.current > 1) {
        currentConcurrencyRef.current = Math.max(1, currentConcurrencyRef.current - 1);
        updateState();
        // Add a penalty delay
        return new Promise(resolve => setTimeout(resolve, 5000));
    }
    return Promise.resolve();
  };

  const processJob = useCallback(async (job: QueueJob<T>) => {
    const controller = new AbortController();
    activeJobsRef.current.set(job.id, controller);
    updateState();
    onJobStart?.(job);

    try {
      const result = await processor(job, controller.signal);
      metricsRef.current.completed++;
      handleSuccess();
      onJobComplete?.(job, result);
    } catch (error: any) {
        if (error.name === 'AbortError') return;

        const retries = (job.retries || 0) + 1;
        if (retries <= maxRetries) {
            metricsRef.current.retried++;
            onJobRetry?.(job, retries, error);
            await handleError(); // Apply backpressure
            
            // Exponential backoff
            const delay = retryDelay * Math.pow(2, retries);
            await new Promise(resolve => setTimeout(resolve, delay));
            
            queueRef.current.unshift({ ...job, retries }); // Re-queue at front
        } else {
            metricsRef.current.failed++;
            onJobError?.(job, error);
        }
    } finally {
      activeJobsRef.current.delete(job.id);
      updateState();
      processNext();
    }
  }, [processor, maxRetries, retryDelay, onJobStart, onJobComplete, onJobError, onJobRetry, updateState]);

  const processNext = useCallback(() => {
    if (isPausedRef.current) return;
    
    // Check against ADAPTIVE concurrency limit
    if (activeJobsRef.current.size >= currentConcurrencyRef.current) return;
    
    if (queueRef.current.length === 0) {
      if (activeJobsRef.current.size === 0) onQueueEmpty?.();
      return;
    }

    // Simple priority sort
    queueRef.current.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    const job = queueRef.current.shift()!;
    processJob(job);
    
    // Try to spawn more if bandwidth allows
    if (activeJobsRef.current.size < currentConcurrencyRef.current && queueRef.current.length > 0) {
        // Microtask defer to let UI breathe
        queueMicrotask(() => processNext());
    }
  }, [onQueueEmpty, processJob]);

  const addJobs = useCallback((jobs: QueueJob<T>[]) => {
    const newJobs = jobs.map(j => ({ ...j, retries: 0, createdAt: Date.now() }));
    queueRef.current.push(...newJobs);
    metricsRef.current.total += jobs.length;
    updateState();
    processNext();
  }, [processNext, updateState]);

  const addJob = useCallback((job: QueueJob<T>) => addJobs([job]), [addJobs]);
  
  const pause = useCallback(() => { isPausedRef.current = true; updateState(); }, [updateState]);
  const resume = useCallback(() => { isPausedRef.current = false; updateState(); processNext(); }, [updateState, processNext]);
  const cancelAll = useCallback(() => {
    activeJobsRef.current.forEach(c => c.abort());
    activeJobsRef.current.clear();
    queueRef.current = [];
    isPausedRef.current = false;
    updateState();
  }, [updateState]);

  return { state, addJob, addJobs, pause, resume, cancelAll };
};

export default useJobQueue;
