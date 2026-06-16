const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const DANGEROUS_GET_PATTERNS = [
  /\/ct\/logout\b/i,
  /favoritecourse/i,
  /selfregistration/i,
  /[?&]action=[^&#]*(add|create|delete|edit|register|remove|save|submit|update)/i,
  /_(add|create|delete|edit|register|remove|save|submit|update)(?:[_/?#]|$)/i,
];

function isSafeMethod(method) {
  return SAFE_METHODS.has(String(method || '').toUpperCase());
}

function isDangerousGetUrl(url) {
  return DANGEROUS_GET_PATTERNS.some((pattern) => pattern.test(url));
}

function assertReadOnlyRequest(method, url) {
  if (!isSafeMethod(method)) {
    throw new Error(`blocked non-read-only ${method} request: ${url}`);
  }

  if (String(method).toUpperCase() === 'GET' && isDangerousGetUrl(url)) {
    throw new Error(`blocked state-changing GET-looking URL: ${url}`);
  }
}

async function installReadOnlyRoute(context, state) {
  await context.route('**/*', async (route) => {
    const request = route.request();
    if (!state.enabled) {
      await route.continue();
      return;
    }

    try {
      assertReadOnlyRequest(request.method(), request.url());
      await route.continue();
    } catch {
      await route.abort('blockedbyclient');
    }
  });
}

module.exports = {
  DANGEROUS_GET_PATTERNS,
  assertReadOnlyRequest,
  installReadOnlyRoute,
  isDangerousGetUrl,
  isSafeMethod,
};
