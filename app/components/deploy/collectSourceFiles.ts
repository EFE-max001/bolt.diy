import type { FileMap } from '~/lib/stores/files';
import { WORK_DIR } from '~/utils/constants';

const SKIPPED_SEGMENTS = new Set(['node_modules', '.git', '.next', '.vercel', 'dist', 'build', '.ssh', '.aws']);
const SENSITIVE_FILE_NAMES = new Set(['.npmrc', '.netrc', '.pypirc', '.dockerconfigjson', 'credentials.json']);

function isSensitivePath(relativePath: string) {
  return relativePath.split('/').some((segment) => {
    const name = segment.toLowerCase();

    return (
      SKIPPED_SEGMENTS.has(name) ||
      name === '.env' ||
      name.startsWith('.env.') ||
      SENSITIVE_FILE_NAMES.has(name) ||
      /\.(pem|key|p12|pfx|keystore)$/i.test(name)
    );
  });
}

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

    if (isSensitivePath(relative)) {
      continue;
    }

    result[relative] = entry.content;
  }

  return result;
}
