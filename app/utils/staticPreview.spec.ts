import { describe, expect, it } from 'vitest';
import { WORK_DIR } from './constants';
import { buildStaticPreview, findStaticEntry, type StaticFileMap } from './staticPreview';

const file = (content: string) => ({ type: 'file' as const, content, isBinary: false });

describe('staticPreview', () => {
  it('finds the entry html', () => {
    const files: StaticFileMap = { [`${WORK_DIR}/index.html`]: file('<html></html>') };
    expect(findStaticEntry(files)).toBe('index.html');
  });

  it('returns undefined when there is no html entry', () => {
    const files: StaticFileMap = { [`${WORK_DIR}/main.js`]: file('1') };
    expect(buildStaticPreview(files)).toBeUndefined();
  });

  it('inlines local css and js but leaves external urls alone', () => {
    const files: StaticFileMap = {
      [`${WORK_DIR}/index.html`]: file(
        '<link rel="stylesheet" href="style.css"><link rel="stylesheet" href="https://cdn.example.com/x.css"><script src="./app.js"></script>',
      ),
      [`${WORK_DIR}/style.css`]: file('body{color:red}'),
      [`${WORK_DIR}/app.js`]: file('console.log("hi")'),
    };

    const result = buildStaticPreview(files);

    expect(result?.html).toContain('<style data-inlined="style.css">');
    expect(result?.html).toContain('body{color:red}');
    expect(result?.html).toContain('console.log("hi")');
    expect(result?.html).toContain('href="https://cdn.example.com/x.css"');
  });

  it('refuses projects that need a bundler', () => {
    const files: StaticFileMap = {
      [`${WORK_DIR}/index.html`]: file('<script type="module" src="/src/main.tsx"></script>'),
      [`${WORK_DIR}/src/main.tsx`]: file('export {}'),
    };

    expect(buildStaticPreview(files)).toBeUndefined();
  });

  it('does not let inlined scripts close their own tag', () => {
    const files: StaticFileMap = {
      [`${WORK_DIR}/index.html`]: file('<script src="a.js"></script>'),
      [`${WORK_DIR}/a.js`]: file('const s = "</script>";'),
    };

    expect(buildStaticPreview(files)?.html).not.toMatch(/"<\/script>"/);
  });
});
