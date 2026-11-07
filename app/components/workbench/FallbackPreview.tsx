import { useStore } from '@nanostores/react';
import { useMemo, useState } from 'react';
import { useVercelDeploy } from '~/components/deploy/VercelDeploy.client';
import { runtimeError, runtimeStatus } from '~/lib/stores/runtime';
import { workbenchStore } from '~/lib/stores/workbench';
import { buildStaticPreview } from '~/utils/staticPreview';

/**
 * Preview shown when the in-browser runtime cannot run (typically on phones). Plain HTML/CSS/JS
 * projects render from their source files; anything that needs a build step points the user to a
 * Vercel preview deploy instead.
 */
export function FallbackPreview() {
  const files = useStore(workbenchStore.files);
  const status = useStore(runtimeStatus);
  const error = useStore(runtimeError);
  const { handleVercelDeploy, isDeploying, isConnected } = useVercelDeploy();
  const [showDetails, setShowDetails] = useState(false);

  const preview = useMemo(() => buildStaticPreview(files), [files]);

  return (
    <div className="flex h-full flex-col bg-bolt-elements-background-depth-1">
      <div className="flex items-center gap-2 border-b border-bolt-elements-borderColor px-3 py-2 text-xs text-bolt-elements-textSecondary">
        <span className="i-ph:device-mobile text-base" aria-hidden="true" />
        <span className="flex-1">
          {preview
            ? 'Static preview (this device can’t run the full dev server)'
            : 'Live preview isn’t available on this device'}
        </span>
        <button
          type="button"
          className="underline"
          onClick={() => setShowDetails((value) => !value)}
          aria-expanded={showDetails}
        >
          Why?
        </button>
      </div>

      {showDetails && (
        <div className="border-b border-bolt-elements-borderColor px-3 py-2 text-xs text-bolt-elements-textTertiary">
          {status === 'unsupported'
            ? 'This browser or connection can’t run the in-browser runtime.'
            : 'The in-browser runtime failed to start, usually because the phone ran out of memory.'}
          {error ? ` (${error})` : ''} You can still edit files and deploy; open the project on a computer for the full
          terminal and live preview.
        </div>
      )}

      {preview ? (
        <iframe
          title="Static preview"
          className="min-h-0 w-full flex-1 bg-white"

          // No allow-same-origin: generated code must not reach this app's storage or API keys.
          sandbox="allow-scripts allow-forms allow-modals allow-popups"
          srcDoc={preview.html}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-bolt-elements-textSecondary">
          <span className="i-ph:rocket-launch text-3xl" aria-hidden="true" />
          <p>
            This project needs a build step. Deploy it to Vercel to see it running, or continue on a computer for a live
            preview.
          </p>
          <button
            type="button"
            disabled={isDeploying || !isConnected}
            onClick={() => handleVercelDeploy()}
            className="rounded-md bg-accent-500 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDeploying ? 'Deploying…' : isConnected ? 'Deploy preview to Vercel' : 'Connect Vercel in Settings first'}
          </button>
        </div>
      )}
    </div>
  );
}
