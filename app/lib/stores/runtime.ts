import { atom } from 'nanostores';

/**
 * Tracks whether the in-browser WebContainer runtime is usable on this device.
 *
 * - `booting`: boot has been requested and has not finished yet
 * - `ready`: the runtime is running (full terminal, dev server, live preview)
 * - `unsupported`: the browser cannot run it (e.g. not cross-origin isolated)
 * - `failed`: boot was attempted but threw (e.g. out of memory on a phone)
 *
 * When the runtime is `unsupported` or `failed`, the UI falls back to a
 * lightweight static preview and the Deploy tab so the user can still build.
 */
export type RuntimeStatus = 'booting' | 'ready' | 'unsupported' | 'failed';

export const runtimeStatus = atom<RuntimeStatus>('booting');
export const runtimeError = atom<string | undefined>(undefined);

export function isRuntimeUnavailable(status: RuntimeStatus) {
  return status === 'unsupported' || status === 'failed';
}

export function markRuntimeReady() {
  runtimeStatus.set('ready');
  runtimeError.set(undefined);
}

export function markRuntimeUnavailable(status: 'unsupported' | 'failed', error?: unknown) {
  runtimeStatus.set(status);
  runtimeError.set(error instanceof Error ? error.message : error ? String(error) : undefined);
}
