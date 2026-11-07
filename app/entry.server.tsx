import { isbot } from 'isbot';
import { renderToReadableStream } from 'react-dom/server';
import { ServerRouter, type EntryContext, type RouterContextProvider } from 'react-router';
import { getCoepMode } from '~/utils/coep';

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext: Readonly<RouterContextProvider>,
) {
  const body = await renderToReadableStream(<ServerRouter context={routerContext} url={request.url} />, {
    signal: request.signal,
    onError(error: unknown) {
      console.error(error);
      responseStatusCode = 500;
    },
  });

  if (isbot(request.headers.get('user-agent') || '') || routerContext.isSpaMode) {
    await body.allReady;
  }

  responseHeaders.set('Content-Type', 'text/html');

  /*
   * WebContainer requires a cross-origin-isolated document.
   * `credentialless` is used because the preview iframe and the
   * COEP header would otherwise block every third-party subresource.
   * WebKit (Safari and all iOS browsers) does not support `credentialless`,
   * so it gets `require-corp`; the choice therefore varies by User-Agent.
   */
  responseHeaders.append('Vary', 'User-Agent');
  responseHeaders.set('Cross-Origin-Embedder-Policy', getCoepMode(request.headers.get('user-agent')));
  responseHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');

  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
