import { describe, expect, it, vi } from 'vitest';
import { createVirtualContainer, VIRTUAL_RUNTIME_MESSAGE } from './virtual-container';

type Watch = (options: object, cb: (events: any[]) => void) => () => void;

describe('virtual container', () => {
  it('writes, reads and lists files under the work dir', async () => {
    const wc = createVirtualContainer();
    await wc.fs.writeFile('src/app.js', 'hello');

    expect(await wc.fs.readFile('/home/project/src/app.js', 'utf-8')).toBe('hello');

    const entries = await wc.fs.readdir('/home/project', { withFileTypes: true });

    expect(entries.map((entry) => [entry.name, entry.isDirectory()])).toEqual([['src', true]]);
  });

  it('emits watch events with content for add, change and remove', async () => {
    const wc = createVirtualContainer();
    const listener = vi.fn();

    (wc.internal.watchPaths as unknown as Watch)({ include: ['/home/project/**'], includeContent: true }, listener);

    await wc.fs.writeFile('/home/project/a.txt', 'one');
    await wc.fs.writeFile('/home/project/a.txt', 'two');
    await wc.fs.rm('/home/project/a.txt');

    const types = listener.mock.calls.flatMap(([events]) => events.map((event: any) => event.type));

    expect(types).toEqual(['add_file', 'change', 'remove_file']);
  });

  it('respects excluded paths', async () => {
    const wc = createVirtualContainer();
    const listener = vi.fn();

    (wc.internal.watchPaths as unknown as Watch)(
      { include: ['/home/project/**'], exclude: ['**/node_modules'], includeContent: true },
      listener,
    );

    await wc.fs.writeFile('/home/project/node_modules/x/index.js', '1');

    const paths = listener.mock.calls.flatMap(([events]) => events.map((event: any) => event.path));

    expect(paths.some((path: string) => path.includes('node_modules'))).toBe(false);
  });

  it('removes directories recursively', async () => {
    const wc = createVirtualContainer();
    await wc.fs.writeFile('/home/project/d/e/f.txt', 'x');
    await wc.fs.rm('/home/project/d', { recursive: true });

    await expect(wc.fs.readFile('/home/project/d/e/f.txt', 'utf-8')).rejects.toThrow('ENOENT');
  });

  it('fails clearly when a process is requested', async () => {
    const wc = createVirtualContainer();

    await expect((wc.spawn as any)('npm', ['run', 'dev'])).rejects.toThrow(VIRTUAL_RUNTIME_MESSAGE);
  });
});
