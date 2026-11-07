import { describe, expect, it } from 'vitest';
import { collectSourceFiles } from './collectSourceFiles';
import { WORK_DIR } from '~/utils/constants';
import type { FileMap } from '~/lib/stores/files';

const textFile = (content: string) => ({ type: 'file' as const, content, isBinary: false });

describe('collectSourceFiles', () => {
  it('keeps normal project source files', () => {
    const files: FileMap = {
      [`${WORK_DIR}/package.json`]: textFile('{"name":"demo"}'),
      [`${WORK_DIR}/src/main.ts`]: textFile('export {};'),
    };

    expect(collectSourceFiles(files)).toEqual({
      'package.json': '{"name":"demo"}',
      'src/main.ts': 'export {};',
    });
  });

  it('excludes environment files and common credential files', () => {
    const files: FileMap = {
      [`${WORK_DIR}/.env`]: textFile('API_KEY=secret'),
      [`${WORK_DIR}/.env.local`]: textFile('API_KEY=secret'),
      [`${WORK_DIR}/config/.env.production`]: textFile('API_KEY=secret'),
      [`${WORK_DIR}/.npmrc`]: textFile('//registry.npmjs.org/:_authToken=secret'),
      [`${WORK_DIR}/.ssh/id_rsa`]: textFile('private key'),
      [`${WORK_DIR}/certs/app.pem`]: textFile('private certificate'),
      [`${WORK_DIR}/src/main.ts`]: textFile('export {};'),
    };

    expect(collectSourceFiles(files)).toEqual({
      'src/main.ts': 'export {};',
    });
  });

  it('excludes generated folders, binary files, and files outside the work directory', () => {
    const files: FileMap = {
      [`${WORK_DIR}/node_modules/pkg/index.js`]: textFile('ignored'),
      [`${WORK_DIR}/dist/index.js`]: textFile('ignored'),
      [`${WORK_DIR}/image.png`]: { type: 'file', content: 'binary', isBinary: true },
      '/tmp/private.txt': textFile('ignored'),
    };

    expect(collectSourceFiles(files)).toEqual({});
  });
});
