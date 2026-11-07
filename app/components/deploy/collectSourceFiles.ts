import type { FileMap } from '~/lib/stores/files';
import { WORK_DIR } from '~/utils/constants';

const SKIPPED_SEGMENTS = new Set(['node_modules', '.git', '.next', '.vercel', 'dist', 'build']);

/**
 * Collects the project's text source files straight from the editor's file store, so a deploy
 * can run without the in-browser runtime. Paths are relative to the project root.
 */
export function collectSourceFiles(files: FileMap): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [absolutePath, entry] of Object.entries(files)) {
    if (!entry || entry.type !== 'file' || entry.isBinary || !absolutePath.startsWith(`${WORK_DIR}/`)) {
      continue;
    }

    const relative = absolutePath.slice(WORK_DIR.length + 1);

    if (relative.split('/').some((segment) => SKIPPED_SEGMENTS.has(segment))) {
      continue;
    }

    result[relative] = entry.content;
  }

  return result;
}
