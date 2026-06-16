const test = require('node:test');
const assert = require('node:assert/strict');
const { parseKeyText } = require('../src/config');

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
