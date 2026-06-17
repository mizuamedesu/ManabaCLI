const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertReadOnlyRequest,
  isAllowedMutationRequest,
  isDangerousGetUrl,
  isSafeMethod,
} = require('../src/safety');

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

test('mutation allowlist requires method, url, and form field', () => {
  const request = {
    method: () => 'POST',
    url: () => 'https://manaba.example/ct/course_1_query_2',
    postData: () =>
      'manaba-form=abc&action_QueryStudent_querystart=%E9%96%8B%E5%A7%8B',
  };
  const rule = {
    method: 'POST',
    url: 'https://manaba.example/ct/course_1_query_2',
    formField: 'action_QueryStudent_querystart',
  };

  assert.equal(isAllowedMutationRequest(request, [rule]), true);
  assert.equal(isAllowedMutationRequest({ ...request, method: () => 'GET' }, [rule]), false);
  assert.equal(isAllowedMutationRequest({ ...request, url: () => 'https://manaba.example/ct/other' }, [rule]), false);
  assert.equal(
    isAllowedMutationRequest({ ...request, postData: () => 'action_QueryStudent_submit=1' }, [rule]),
    false,
  );
});
