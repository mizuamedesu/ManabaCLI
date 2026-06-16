const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const { installReadOnlyRoute, assertReadOnlyRequest } = require('./safety');
const { extractCourseId } = require('./scrape');

class ManabaClient {
  constructor(config, options = {}) {
    this.config = config;
    this.options = options;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.readOnlyState = { enabled: false };
    this.baseUrl = new URL(config.url);
  }

  async open() {
    this.browser = await chromium.launch({ headless: this.options.headed ? false : true });
    const contextOptions = {
      acceptDownloads: true,
      viewport: { width: 1280, height: 900 },
    };
    if (!this.options.ignoreAuthState && fs.existsSync(this.config.authStatePath)) {
      contextOptions.storageState = this.config.authStatePath;
    }
    this.context = await this.browser.newContext({
      ...contextOptions,
    });
    await installReadOnlyRoute(this.context, this.readOnlyState);
    this.page = await this.context.newPage();
    return this;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async login() {
    if (!this.options.forceLogin && (await this.tryStoredSession())) {
      this.readOnlyState.enabled = true;
      return;
    }

    await this.page.goto(this.config.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.page.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => undefined);

    const username = this.page.locator('#username, input[name="j_username"], input[type="text"]').first();
    const password = this.page.locator('#password, input[name="j_password"], input[type="password"]').first();

    if (!/manaba\./.test(this.page.url())) {
      await username.waitFor({ state: 'visible', timeout: 30000 }).catch(() => undefined);
    }

    if (!this.config.id || !this.config.password) {
      throw new Error(`stored auth is unavailable or expired, and ID/PASS are missing in ${this.config.keyPath}`);
    }

    if ((await username.count()) > 0 && (await password.count()) > 0) {
      await username.fill(this.config.id);
      await password.fill(this.config.password);
      await Promise.all([
        this.page.waitForURL(/manaba\./, { timeout: 60000 }).catch(() => undefined),
        this.page.locator('button[type="submit"], input[type="submit"]').first().click(),
      ]);
    }

    await this.page.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => undefined);
    await this.page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => undefined);

    if (!/manaba\./.test(this.page.url())) {
      throw new Error(`login did not reach manaba: ${this.page.url()}`);
    }

    this.readOnlyState.enabled = true;
    await this.saveAuthState();
  }

  async tryStoredSession() {
    if (this.options.ignoreAuthState || !fs.existsSync(this.config.authStatePath)) {
      return false;
    }

    await this.page.goto(new URL('/ct/home', this.config.url).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await this.page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => undefined);
    return /manaba\./.test(this.page.url()) && !/\/idp\/|\/SAML2\//i.test(this.page.url());
  }

  async saveAuthState() {
    fs.mkdirSync(path.dirname(this.config.authStatePath), { recursive: true });
    await this.context.storageState({ path: this.config.authStatePath });
    fs.chmodSync(this.config.authStatePath, 0o600);
  }

  clearAuthState() {
    if (fs.existsSync(this.config.authStatePath)) {
      fs.rmSync(this.config.authStatePath);
      return true;
    }
    return false;
  }

  resolveTarget(target) {
    if (!target || target === 'home') {
      return new URL('/ct/home', this.config.url).toString();
    }

    if (/^https?:\/\//i.test(target)) {
      return target;
    }

    if (target.startsWith('/')) {
      return new URL(target, this.config.url).toString();
    }

    if (/^course_/.test(target)) {
      return new URL(`/ct/${target}`, this.config.url).toString();
    }

    if (/^\d+$/.test(target)) {
      return new URL(`/ct/course_${target}`, this.config.url).toString();
    }

    throw new Error(`unsupported target: ${target}`);
  }

  async goto(target) {
    const url = this.resolveTarget(target);
    assertReadOnlyRequest('GET', url);
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => undefined);
    return this.page;
  }

  async downloadGet(url) {
    const resolved = this.resolveTarget(url);
    assertReadOnlyRequest('GET', resolved);
    const response = await this.context.request.get(resolved, {
      maxRedirects: 10,
      timeout: 60000,
    });
    if (!response.ok()) {
      throw new Error(`download failed (${response.status()}): ${resolved}`);
    }
    return response;
  }

  courseIdFromUrl(url) {
    return extractCourseId(url);
  }
}

module.exports = {
  ManabaClient,
};
