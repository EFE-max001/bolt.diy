import { WORK_DIR } from '~/utils/constants';

export interface StaticFile {
  type: 'file' | 'folder';
  content?: string;
  isBinary?: boolean;
}

export type StaticFileMap = Record<string, StaticFile | undefined>;

const ENTRY_CANDIDATES = ['index.html', 'public/index.html', 'dist/index.html', 'src/index.html'];

function normalize(filePath: string) {
  const parts: string[] = [];

  for (const part of filePath.split('/')) {
    if (!part || part === '.') {
      continue;
    }

    if (part === '..') {
      parts.pop();
    } else {
      parts.push(part);
    }
  }

  return parts.join('/');
}

function dirname(filePath: string) {
  const index = filePath.lastIndexOf('/');
  return index === -1 ? '' : filePath.slice(0, index);
}

function isExternal(reference: string) {
  return /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(reference);
}

function relativePath(files: StaticFileMap) {
  const lookup = new Map<string, StaticFile>();

  for (const [absolute, file] of Object.entries(files)) {
    if (file?.type === 'file' && !file.isBinary && absolute.startsWith(`${WORK_DIR}/`)) {
      lookup.set(absolute.slice(WORK_DIR.length + 1), file);
    }
  }

  return lookup;
}

/** Returns the entry HTML path (relative to the project root) if the project can be previewed statically. */
export function findStaticEntry(files: StaticFileMap): string | undefined {
  const lookup = relativePath(files);
  return ENTRY_CANDIDATES.find((candidate) => lookup.has(candidate));
}

function escapeScript(content: string) {
  return content.replace(/<\/script/gi, '<\\/script');
}

/**
 * Builds a self-contained HTML document from plain HTML/CSS/JS project files by
 * inlining local stylesheets and scripts. Projects that need a bundler or dev
 * server (React/Vite, etc.) are not supported here and return `undefined`.
 */
export function buildStaticPreview(files: StaticFileMap): { html: string; entry: string } | undefined {
  const entry = findStaticEntry(files);

  if (!entry) {
    return undefined;
  }

  const lookup = relativePath(files);
  const base = dirname(entry);

  const resolve = (reference: string) => {
    const clean = reference.split(/[?#]/)[0];
    return normalize(clean.startsWith('/') ? clean : `${base}/${clean}`);
  };

  let html = lookup.get(entry)?.content ?? '';

  // <script type="module" src="/src/main.tsx"> and similar need a bundler.
  const needsBundler = /<script[^>]+src=["'][^"']+\.(tsx|ts|jsx)(\?[^"']*)?["']/i.test(html);

  if (needsBundler) {
    return undefined;
  }

  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    const rel = /\brel=["']?stylesheet/i.test(tag);
    const href = /\bhref=["']([^"']+)["']/i.exec(tag)?.[1];

    if (!rel || !href || isExternal(href)) {
      return tag;
    }

    const css = lookup.get(resolve(href))?.content;

    return css === undefined ? tag : `<style data-inlined="${href}">\n${css}\n</style>`;
  });

  html = html.replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (tag, before, src, after) => {
    if (isExternal(src)) {
      return tag;
    }

    const js = lookup.get(resolve(src))?.content;

    if (js === undefined) {
      return tag;
    }

    const attributes = `${before} ${after}`.trim();

    return `<script ${attributes} data-inlined="${src}">\n${escapeScript(js)}\n</script>`;
  });

  return { html, entry };
}
