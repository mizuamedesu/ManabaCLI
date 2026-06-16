const test = require('node:test');
const assert = require('node:assert/strict');
const { extractCourseId, isDownloadLikeUrl, safeFileName } = require('../src/scrape');

test('extractCourseId reads manaba course id', () => {
  assert.equal(extractCourseId('https://manaba.example/ct/course_12345'), '12345');
});

test('isDownloadLikeUrl detects common file and document URLs', () => {
  assert.equal(isDownloadLikeUrl('https://example.test/file.pdf'), true);
  assert.equal(isDownloadLikeUrl('https://example.test/doc/1/2/'), true);
  assert.equal(isDownloadLikeUrl('https://example.test/ct/course_1'), false);
});

test('safeFileName removes path separators', () => {
  assert.equal(safeFileName('../a/b:c.pdf'), '_a_b_c.pdf');
});
