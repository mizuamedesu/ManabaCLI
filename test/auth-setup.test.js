const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseKeyText } = require('../src/config');
const { setupCredentials } = require('../src/index');

test('setupCredentials writes key file from prompted values', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manaba-auth-setup-'));
  const keyPath = path.join(dir, '.key');
  const answers = ['', 'student-id', 'student-pass'];
  const prompts = [];
  const rl = {
    question(prompt, callback) {
      prompts.push(prompt);
      callback(answers.shift() || '');
    },
    close() {},
  };

  const saved = await setupCredentials({ keyPath }, { rl });

  assert.deepEqual(saved, {
    keyPath,
    url: 'https://manaba.tsukuba.ac.jp/',
  });
  assert.deepEqual(prompts, [
    'URL [https://manaba.tsukuba.ac.jp/]: ',
    'ID: ',
    'PASS: ',
  ]);
  assert.deepEqual(parseKeyText(fs.readFileSync(keyPath, 'utf8')), {
    ID: 'student-id',
    PASS: 'student-pass',
    URL: 'https://manaba.tsukuba.ac.jp/',
  });
});
