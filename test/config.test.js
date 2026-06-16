const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizeManabaUrl, parseKeyText, readConfig, writeKeyFile } = require('../src/config');

test('parseKeyText reads ID, PASS, and bare URL', () => {
  assert.deepEqual(
    parseKeyText('ID=abc\nPASS=secret\n\nhttps://example.test/\n'),
    {
      ID: 'abc',
      PASS: 'secret',
      URL: 'https://example.test/',
    },
  );
});

test('readConfig derives auth state path from URL without requiring credentials', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manaba-config-'));
  const keyPath = path.join(dir, '.key');
  fs.writeFileSync(keyPath, 'https://manaba.example/\n');

  const config = readConfig({ keyPath });
  assert.equal(config.url, 'https://manaba.example/');
  assert.equal(config.id, undefined);
  assert.equal(config.password, undefined);
  assert.equal(config.authStatePath, path.resolve('.manaba-auth/manaba.example.storage-state.json'));
});

test('normalizeManabaUrl accepts host-only input', () => {
  assert.equal(normalizeManabaUrl('manaba.example'), 'https://manaba.example/');
});

test('writeKeyFile writes parseable key file with private permissions', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manaba-key-'));
  const keyPath = path.join(dir, '.key');

  const savedPath = writeKeyFile(
    { id: 'abc', password: 'secret', url: 'manaba.example' },
    { keyPath },
  );

  assert.equal(savedPath, keyPath);
  assert.deepEqual(parseKeyText(fs.readFileSync(keyPath, 'utf8')), {
    ID: 'abc',
    PASS: 'secret',
    URL: 'https://manaba.example/',
  });
  assert.equal(fs.statSync(keyPath).mode & 0o777, 0o600);
});
