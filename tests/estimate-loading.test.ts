import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  INITIAL_LOADING_MESSAGE,
  REQUEST_RECEIVED_MESSAGE,
  STILL_WORKING_DELAY_MS,
  STILL_WORKING_MESSAGE,
  beginEstimateLoading,
  canStartEstimateSubmit,
  claimEstimateSubmit,
  finishEstimateLoading,
  getEstimateLoadingMessage,
  idleLoadingState,
  isEstimateSubmitDisabled,
  isStaleEstimateResponse,
  markEstimateStillWorking,
  releaseEstimateSubmit,
  scheduleStillWorkingMessage
} from '../app/lib/estimate-loading';

afterEach(() => {
  vi.useRealTimers();
});

describe('estimate loading state', () => {
  it('starts immediately for a valid submission with clear loading copy', () => {
    const state = beginEstimateLoading(1);
    expect(state.active).toBe(true);
    expect(INITIAL_LOADING_MESSAGE).toBe('Analyzing photos and job details…');
    expect(getEstimateLoadingMessage(state)).toBe(REQUEST_RECEIVED_MESSAGE);
    expect(REQUEST_RECEIVED_MESSAGE).toContain('Request received');
  });

  it('does not start for invalid submissions or duplicate submissions', () => {
    expect(canStartEstimateSubmit(idleLoadingState, false)).toBe(false);

    const loading = beginEstimateLoading(1);
    expect(canStartEstimateSubmit(loading, true)).toBe(false);
    expect(isEstimateSubmitDisabled(loading)).toBe(true);
  });

  it('uses a synchronous in-flight guard to prevent same-tick duplicate submits', () => {
    const guard = { current: false };

    expect(claimEstimateSubmit(guard, idleLoadingState, true)).toBe(true);
    expect(guard.current).toBe(true);
    expect(claimEstimateSubmit(guard, idleLoadingState, true)).toBe(false);

    releaseEstimateSubmit(guard, 1, 1);
    expect(guard.current).toBe(false);
  });

  it('shows the still-working message after the configured delay using fake timers', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    scheduleStillWorkingMessage(callback);

    vi.advanceTimersByTime(STILL_WORKING_DELAY_MS - 1);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('cleans up the still-working timer before it fires', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const timer = scheduleStillWorkingMessage(callback);

    clearTimeout(timer);
    vi.advanceTimersByTime(STILL_WORKING_DELAY_MS);

    expect(callback).not.toHaveBeenCalled();
  });

  it('updates the supporting message for long-running requests', () => {
    const loading = beginEstimateLoading(2);
    const stillWorking = markEstimateStillWorking(loading, 2);
    expect(stillWorking.showStillWorking).toBe(true);
    expect(getEstimateLoadingMessage(stillWorking)).toBe('Still working — detailed photo analysis can take a little longer.');
    expect(getEstimateLoadingMessage(stillWorking)).toBe(STILL_WORKING_MESSAGE);
  });

  it('clears loading after success, analysis_failed, or network error cleanup paths', () => {
    for (const requestId of [1, 2, 3]) {
      const loading = beginEstimateLoading(requestId);
      expect(finishEstimateLoading(loading, requestId)).toEqual(idleLoadingState);
    }
  });

  it('ignores stale delayed messages and stale responses from older requests', () => {
    const newerRequest = beginEstimateLoading(5);
    expect(markEstimateStillWorking(newerRequest, 4)).toBe(newerRequest);
    expect(finishEstimateLoading(newerRequest, 4)).toBe(newerRequest);
    expect(isStaleEstimateResponse(newerRequest, 4)).toBe(true);
    expect(isStaleEstimateResponse(newerRequest, 5)).toBe(false);
  });
});

describe('estimate loading markup and styles', () => {
  const pageSource = readFileSync('app/page.tsx', 'utf8');
  const cssSource = readFileSync('app/styles.css', 'utf8');

  it('includes accessible live-region and busy-state attributes', () => {
    expect(pageSource).toContain('role="status"');
    expect(pageSource).toContain('aria-live="polite"');
    expect(pageSource).toContain('aria-atomic="true"');
    expect(pageSource).toContain('aria-busy={loading}');
  });

  it('uses text in addition to animation and respects reduced-motion preferences', () => {
    expect(pageSource).toContain('INITIAL_LOADING_MESSAGE');
    expect(pageSource).toContain('getEstimateLoadingMessage(loadingState)');
    expect(cssSource).toContain('@media (prefers-reduced-motion: reduce)');
    expect(cssSource).toContain('animation: none');
  });

  it('does not add fake progress percentages', () => {
    expect(pageSource).not.toMatch(/\d+%\s*(complete|done|finished)/i);
    expect(cssSource).not.toMatch(/\d+%\s*(complete|done|finished)/i);
  });
});
