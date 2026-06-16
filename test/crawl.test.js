const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeUrl, shouldDownload, shouldVisitPage } = require('../src/crawl');

const courseOptions = {
  origin: 'https://manaba.example',
  startUrl: 'https://manaba.example/ct/course_123',
  courseId: '123',
  scope: 'course',
};

test('normalizeUrl removes fragments', () => {
  assert.equal(normalizeUrl('https://manaba.example/ct/course_123#body'), 'https://manaba.example/ct/course_123');
});

test('shouldVisitPage keeps crawl inside target course', () => {
  assert.equal(shouldVisitPage('https://manaba.example/ct/course_123_topics', courseOptions), true);
  assert.equal(shouldVisitPage('https://manaba.example/ct/course_999_topics', courseOptions), false);
  assert.equal(shouldVisitPage('https://other.example/ct/course_123_topics', courseOptions), false);
});

test('shouldVisitPage rejects state-changing URLs', () => {
  assert.equal(shouldVisitPage('https://manaba.example/ct/course_123?action=add', courseOptions), false);
  assert.equal(shouldVisitPage('https://manaba.example/ct/home_favoritecourse_123_set___', courseOptions), false);
});

test('shouldDownload accepts same-origin document links', () => {
  assert.equal(shouldDownload('https://manaba.example/doc/abc/def/', courseOptions), true);
  assert.equal(shouldDownload('https://other.example/doc/abc/def/', courseOptions), false);
});
