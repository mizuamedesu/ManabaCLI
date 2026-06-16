const test = require('node:test');
const assert = require('node:assert/strict');
const { assertReadOnlyRequest, isDangerousGetUrl, isSafeMethod } = require('../src/safety');

test('safe methods allow reads', () => {
  assert.equal(isSafeMethod('GET'), true);
  assert.equal(isSafeMethod('HEAD'), true);
  assert.equal(isSafeMethod('POST'), false);
});

test('read-only assertion blocks non-safe methods', () => {
  assert.throws(() => assertReadOnlyRequest('POST', 'https://manaba.example/ct/course_1'));
});

test('dangerous GET patterns are blocked', () => {
  assert.equal(isDangerousGetUrl('https://manaba.example/ct/logout'), true);
  assert.equal(isDangerousGetUrl('https://manaba.example/ct/home_favoritecourse_1_set___'), true);
  assert.equal(isDangerousGetUrl('https://manaba.example/ct/course_1?action=add'), true);
  assert.equal(isDangerousGetUrl('https://manaba.example/ct/course_1'), false);
});
