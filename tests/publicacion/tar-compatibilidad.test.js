const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const tar = require('tar');

test('SQLite keeps extracting its sources with the fixed tar version', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sqlite-tar-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const input = path.join(dir, 'input');
  const output = path.join(dir, 'output');
  await fs.mkdir(input);
  await fs.mkdir(output);
  await fs.writeFile(path.join(input, 'sample.txt'), 'contenido de prueba');
  const archive = path.join(dir, 'source.tar.gz');
  await tar.create({ cwd: input, file: archive, gzip: true }, ['sample.txt']);
  const extractor = path.join(path.dirname(require.resolve('sqlite3/package.json')), 'deps/extract.js');
  await promisify(execFile)(process.execPath, [extractor, archive, output]);
  assert.equal(await fs.readFile(path.join(output, 'sample.txt'), 'utf8'), 'contenido de prueba');
});
