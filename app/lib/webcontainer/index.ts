import { WebContainer } from '@webcontainer/api';
import { createVirtualContainer } from './virtual-container';
import { markRuntimeReady, markRuntimeUnavailable } from '~/lib/stores/runtime';
import { getCoepMode } from '~/utils/coep';
import { WORK_DIR_NAME } from '~/utils/constants';
import { cleanStackTrace } from '~/utils/stacktrace';

interface WebContainerContext {
  loaded: boolean;
}

export const webcontainerContext: WebContainerContext = import.meta.hot?.data.webcontainerContext ?? {
  loaded: false,
};

if (import.meta.hot) {
  import.meta.hot.data.webcontainerContext = webcontainerContext;
}

const BOOT_TIMEOUT_MS = 60_000;

async function bootRealContainer(): Promise<WebContainer> {
  const container = await WebContainer.boot({
    coep: getCoepMode(navigator.userAgent),
    workdirName: WORK_DIR_NAME,
    forwardPreviewErrors: true, // Enable error forwarding from iframes
  });

  webcontainerContext.loaded = true;

  const { workbenchStore } = await import('~/lib/stores/workbench');

  const response = await fetch('/inspector-script.js');
  const inspectorScript = await response.text();
  await container.setPreviewScript(inspectorScript);

  // Listen for preview errors
  container.on('preview-message', (message) => {
    console.log('WebContainer preview message:', message);

    // Handle both uncaught exceptions and unhandled promise rejections
    if (message.type === 'PREVIEW_UNCAUGHT_EXCEPTION' || message.type === 'PREVIEW_UNHANDLED_REJECTION') {
      const isPromise = message.type === 'PREVIEW_UNHANDLED_REJECTION';
      const title = isPromise ? 'Unhandled Promise Rejection' : 'Uncaught Exception';
      workbenchStore.actionAlert.set({
        type: 'preview',
        title,
        description: 'message' in message ? message.message : 'Unknown error',
        content: `Error occurred at ${message.pathname}${message.search}${message.hash}\nPort: ${message.port}\n\nStack trace:\n${cleanStackTrace(message.stack || '')}`,
        source: 'preview',
      });
    }
  });

  return container;
}

/**
 * Boots the real WebContainer when the browser can run it. Otherwise (not cross-origin isolated,
 * out of memory, or a boot that never finishes) it resolves to an in-memory file system so the
 * editor, file tree and source deploys keep working, and records why in the runtime store.
 */
async function startRuntime(): Promise<WebContainer> {
  if (!window.crossOriginIsolated) {
    markRuntimeUnavailable(
      'unsupported',
      'This page is not cross-origin isolated, so the in-browser runtime cannot start.',
    );

    return createVirtualContainer();
  }

  let timeoutId: number | undefined;

  try {
    const container = await Promise.race([
      bootRealContainer(),
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(
          () => reject(new Error('The in-browser runtime took too long to start.')),
          BOOT_TIMEOUT_MS,
        );
      }),
    ]);

    markRuntimeReady();

    return container;
  } catch (error) {
    console.error('WebContainer failed to boot, falling back to the in-memory file system:', error);
    markRuntimeUnavailable('failed', error);

    return createVirtualContainer();
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export let webcontainer: Promise<WebContainer> = new Promise(() => {
  // noop for ssr
});

if (!import.meta.env.SSR) {
  webcontainer = import.meta.hot?.data.webcontainer ?? startRuntime();

  if (import.meta.hot) {
    import.meta.hot.data.webcontainer = webcontainer;
  }
}
