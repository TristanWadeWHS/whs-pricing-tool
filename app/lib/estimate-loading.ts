export const STILL_WORKING_DELAY_MS = 8_000;
export const INITIAL_LOADING_MESSAGE = 'Analyzing photos and job details...';
export const STILL_WORKING_MESSAGE = 'Still working - detailed photo analysis can take a little longer.';
export const REQUEST_RECEIVED_MESSAGE = 'Request received. Keep this page open while the estimate is analyzed.';

export type EstimateLoadingState = {
  active: boolean;
  requestId: number;
  showStillWorking: boolean;
};

export const idleLoadingState: EstimateLoadingState = {
  active: false,
  requestId: 0,
  showStillWorking: false
};

export function beginEstimateLoading(requestId: number): EstimateLoadingState {
  return {
    active: true,
    requestId,
    showStillWorking: false
  };
}

export function markEstimateStillWorking(state: EstimateLoadingState, requestId: number): EstimateLoadingState {
  if (!state.active || state.requestId !== requestId) {
    return state;
  }

  return {
    ...state,
    showStillWorking: true
  };
}

export function finishEstimateLoading(state: EstimateLoadingState, requestId: number): EstimateLoadingState {
  if (state.requestId !== requestId) {
    return state;
  }

  return idleLoadingState;
}

export function getEstimateLoadingMessage(state: EstimateLoadingState) {
  return state.showStillWorking ? STILL_WORKING_MESSAGE : REQUEST_RECEIVED_MESSAGE;
}

export function isStaleEstimateResponse(state: EstimateLoadingState, requestId: number) {
  return state.active && state.requestId !== requestId;
}

export function canStartEstimateSubmit(state: EstimateLoadingState, formIsValid: boolean) {
  return formIsValid && !state.active;
}

export function isEstimateSubmitDisabled(state: EstimateLoadingState) {
  return state.active;
}

export function scheduleStillWorkingMessage(callback: () => void) {
  return setTimeout(callback, STILL_WORKING_DELAY_MS);
}
