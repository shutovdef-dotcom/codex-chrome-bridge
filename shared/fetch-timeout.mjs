const DEFAULT_FETCH_TIMEOUT_CUSHION_MS = 1_000;
const MAX_FETCH_SIGNAL_TIMEOUT_MS = 1_905_000;

export function bridgeFetchTimeoutSignal(timeoutMs, cushionMs = DEFAULT_FETCH_TIMEOUT_CUSHION_MS) {
  const timeout = Number(timeoutMs);
  if (!Number.isFinite(timeout) || timeout <= 0) return undefined;
  const effectiveTimeoutMs = Math.min(
    Math.max(Math.ceil(timeout + cushionMs), 1),
    MAX_FETCH_SIGNAL_TIMEOUT_MS,
  );
  return AbortSignal.timeout(effectiveTimeoutMs);
}

export function isAbortError(error) {
  return error?.name === 'AbortError'
    || error?.name === 'TimeoutError'
    || error?.code === 'ABORT_ERR';
}
