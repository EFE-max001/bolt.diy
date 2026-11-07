import type { WebContainer } from '@webcontainer/api';
import { WORK_DIR, WORK_DIR_NAME } from '~/utils/constants';

/**
 * A tiny in-memory stand-in for WebContainer, used when the real runtime cannot boot
 * (for example on a phone that is out of memory or not cross-origin isolated).
 *
 * It implements only the file-system surface the app relies on, so the AI can still
 * create and edit files, the editor and file tree keep working, and the project can be
 * deployed from source. Anything that needs a real process (terminal, npm, dev server)
 * fails with a clear message instead of hanging.
 */

type WatchEvent = {
  type: 'add_file' | 'add_dir' | 'change' | 'remove_file' | 'remove_dir' | 'update_directory';
  path: string;
  buffer?: Uint8Array;
};

type Watcher = {
  prefix: string;
  excluded: RegExp[];
  includeContent: boolean;
  listener: (events: WatchEvent[]) => void;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const VIRTUAL_RUNTIME_MESSAGE =
  'The in-browser runtime is not available on this device, so commands cannot run here. ' +
  'You can still edit files and deploy from the Deploy menu, or open this project on a computer to run it.';

function globToRegExp(glob: string) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*');

  return new RegExp(`(^|/)${escaped}($|/)`);
}

export function createVirtualContainer(): WebContainer {
  const files = new Map<string, Uint8Array>();
  const dirs = new Set<string>([WORK_DIR, '/home', '/']);
  const watchers = new Set<Watcher>();

  const resolve = (input: string) => {
    const absolute = input.startsWith('/') ? input : `${WORK_DIR}/${input}`;
    const parts: string[] = [];

    for (const part of absolute.split('/')) {
      if (!part || part === '.') {
        continue;
      }

      if (part === '..') {
        parts.pop();
      } else {
        parts.push(part);
      }
    }

    return `/${parts.join('/')}`;
  };

  const parentOf = (target: string) => target.slice(0, target.lastIndexOf('/')) || '/';

  const emit = (event: WatchEvent) => {
    for (const watcher of watchers) {
      if (!event.path.startsWith(watcher.prefix) || watcher.excluded.some((pattern) => pattern.test(event.path))) {
        continue;
      }

      watcher.listener([watcher.includeContent ? event : { ...event, buffer: undefined }]);
    }
  };

  const ensureDir = (target: string) => {
    const missing: string[] = [];

    let current = target;

    while (current !== '/' && !dirs.has(current)) {
      missing.unshift(current);
      current = parentOf(current);
    }

    for (const dir of missing) {
      dirs.add(dir);
      emit({ type: 'add_dir', path: dir });
    }
  };

  const childrenOf = (dir: string) => {
    const prefix = dir === '/' ? '/' : `${dir}/`;
    const entries = new Map<string, 'file' | 'dir'>();

    for (const file of files.keys()) {
      if (file.startsWith(prefix)) {
        const rest = file.slice(prefix.length);
        const [name, ...more] = rest.split('/');
        entries.set(name, more.length ? 'dir' : 'file');
      }
    }

    for (const sub of dirs) {
      if (sub !== dir && sub.startsWith(prefix)) {
        entries.set(sub.slice(prefix.length).split('/')[0], 'dir');
      }
    }

    return entries;
  };

  const notFound = (target: string) =>
    Object.assign(new Error(`ENOENT: no such file or directory, '${target}'`), { code: 'ENOENT' });

  const fs = {
    async mkdir(input: string, options?: { recursive?: boolean }) {
      const target = resolve(input);

      if (!options?.recursive && !dirs.has(parentOf(target))) {
        throw notFound(parentOf(target));
      }

      ensureDir(target);
    },

    async writeFile(input: string, data: string | Uint8Array) {
      const target = resolve(input);
      const existed = files.has(target);
      const buffer = typeof data === 'string' ? encoder.encode(data) : data;

      ensureDir(parentOf(target));
      files.set(target, buffer);
      emit({ type: existed ? 'change' : 'add_file', path: target, buffer });
    },

    async readFile(input: string, encoding?: string) {
      const target = resolve(input);
      const buffer = files.get(target);

      if (!buffer) {
        throw notFound(target);
      }

      return encoding ? decoder.decode(buffer) : buffer;
    },

    async readdir(input: string, options?: { withFileTypes?: boolean }) {
      const target = resolve(input);

      if (!dirs.has(target)) {
        throw notFound(target);
      }

      const entries = [...childrenOf(target).entries()];

      if (!options?.withFileTypes) {
        return entries.map(([name]) => name);
      }

      return entries.map(([name, kind]) => ({
        name,
        isFile: () => kind === 'file',
        isDirectory: () => kind === 'dir',
      }));
    },

    async rm(input: string, options?: { recursive?: boolean; force?: boolean }) {
      const target = resolve(input);

      if (files.delete(target)) {
        emit({ type: 'remove_file', path: target });
        return;
      }

      if (dirs.has(target)) {
        if (!options?.recursive && childrenOf(target).size > 0) {
          throw new Error(`ENOTEMPTY: directory not empty, '${target}'`);
        }

        for (const file of [...files.keys()]) {
          if (file.startsWith(`${target}/`)) {
            files.delete(file);
          }
        }

        for (const dir of [...dirs]) {
          if (dir === target || dir.startsWith(`${target}/`)) {
            dirs.delete(dir);
          }
        }

        emit({ type: 'remove_dir', path: target });

        return;
      }

      if (!options?.force) {
        throw notFound(target);
      }
    },
  };

  const container = {
    workdir: WORK_DIR,
    path: WORK_DIR_NAME,
    fs,

    internal: {
      watchPaths(
        options: { include?: string[]; exclude?: string[]; includeContent?: boolean },
        listener: (events: WatchEvent[]) => void,
      ) {
        const include = options.include?.[0] ?? '/**';

        const watcher: Watcher = {
          prefix: include.replace(/\/?\*\*.*$/, '') || '/',
          excluded: (options.exclude ?? []).map(globToRegExp),
          includeContent: !!options.includeContent,
          listener,
        };

        watchers.add(watcher);

        return () => {
          watchers.delete(watcher);
        };
      },
    },

    on() {
      return () => undefined;
    },

    async spawn() {
      throw new Error(VIRTUAL_RUNTIME_MESSAGE);
    },

    async mount() {
      throw new Error(VIRTUAL_RUNTIME_MESSAGE);
    },

    async setPreviewScript() {
      return undefined;
    },

    teardown() {
      watchers.clear();
    },
  };

  return container as unknown as WebContainer;
}
