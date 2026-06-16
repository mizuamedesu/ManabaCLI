const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { assertReadOnlyRequest, isDangerousGetUrl } = require('./safety');
const { extractCourseId, isDownloadLikeUrl, safeFileName, scrapePage } = require('./scrape');

function normalizeUrl(rawUrl) {
  const url = new URL(rawUrl);
  url.hash = '';
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
    url.port = '';
  }
  return url.toString();
}

function shortHash(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function pageStem(index, url) {
  const parsed = new URL(url);
  const raw = `${String(index).padStart(4, '0')}_${parsed.pathname.replace(/^\/+/, '').replace(/[^A-Za-z0-9._-]+/g, '_') || 'home'}`;
  return `${raw.slice(0, 120)}_${shortHash(url)}`;
}

function isSameOrigin(url, origin) {
  return new URL(url).origin === origin;
}

function isCourseUrl(url, courseId) {
  if (!courseId) return false;
  return new URL(url).pathname.startsWith(`/ct/course_${courseId}`);
}

function isManabaStaticOrUtility(url) {
  const pathname = new URL(url).pathname;
  return (
    /^\/ct\/(?:logout|doc_student|home_preferences|home_usermemo|home_favoritecourse|usermemo_)/.test(pathname) ||
    /^\/attend\//.test(pathname)
  );
}

function shouldVisitPage(url, options) {
  try {
    const normalized = normalizeUrl(url);
    assertReadOnlyRequest('GET', normalized);
    if (!isSameOrigin(normalized, options.origin)) return false;
    if (isDownloadLikeUrl(normalized)) return false;
    if (isManabaStaticOrUtility(normalized)) return false;
    if (options.scope === 'course') return isCourseUrl(normalized, options.courseId);
    if (options.scope === 'site') return new URL(normalized).pathname.startsWith('/ct/');
    return normalized === options.startUrl;
  } catch {
    return false;
  }
}

function shouldDownload(url, options) {
  try {
    const normalized = normalizeUrl(url);
    assertReadOnlyRequest('GET', normalized);
    if (!isSameOrigin(normalized, options.origin)) return false;
    return isDownloadLikeUrl(normalized);
  } catch {
    return false;
  }
}

function responseFileName(response, url, fallback) {
  const disposition = response.headers()['content-disposition'] || '';
  const utf8Name = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Name) {
    try {
      return safeFileName(decodeURIComponent(utf8Name[1]), fallback);
    } catch {
      return safeFileName(utf8Name[1], fallback);
    }
  }
  const asciiName = disposition.match(/filename="?([^";]+)"?/i);
  if (asciiName) return safeFileName(asciiName[1], fallback);
  return safeFileName(path.basename(new URL(url).pathname), fallback);
}

async function saveAttachment(client, url, outDir, sourceUrl, index) {
  const normalized = normalizeUrl(url);
  const response = await client.downloadGet(normalized);
  const fallback = `attachment_${String(index).padStart(4, '0')}_${shortHash(normalized)}`;
  const name = responseFileName(response, normalized, fallback);
  const fileName = `${String(index).padStart(4, '0')}_${shortHash(normalized)}_${name}`;
  const outPath = path.join(outDir, 'attachments', fileName);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, await response.body());
  return {
    url: normalized,
    sourceUrl,
    path: path.relative(outDir, outPath),
    bytes: fs.statSync(outPath).size,
    contentType: response.headers()['content-type'] || '',
  };
}

async function crawl(client, target, options = {}) {
  const outDir = path.resolve(options.outDir || 'manaba-export');
  const startUrl = normalizeUrl(client.resolveTarget(target || 'home'));
  const inferredCourseId = extractCourseId(startUrl);
  const scope = options.scope || (inferredCourseId ? 'course' : 'site');
  const crawlOptions = {
    origin: new URL(client.config.url).origin,
    startUrl,
    courseId: inferredCourseId,
    scope,
  };

  fs.mkdirSync(path.join(outDir, 'pages'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'attachments'), { recursive: true });

  const maxPages = Number(options.maxPages || 500);
  const downloadAttachments = options.downloadAttachments !== false;
  const queue = [startUrl];
  const seenPages = new Set();
  const seenAttachments = new Set();
  const pages = [];
  const attachments = [];
  const skipped = [];

  while (queue.length && pages.length < maxPages) {
    const current = normalizeUrl(queue.shift());
    if (seenPages.has(current)) continue;
    if (!shouldVisitPage(current, crawlOptions)) {
      skipped.push({ url: current, reason: 'outside scope or unsafe' });
      continue;
    }

    seenPages.add(current);
    await client.goto(current);
    await client.page.waitForTimeout(options.settleMs || 300);

    const html = await client.page.content();
    const pageData = await scrapePage(client.page);
    const index = pages.length;
    const stem = pageStem(index, current);
    const htmlPath = path.join(outDir, 'pages', `${stem}.html`);
    const textPath = path.join(outDir, 'pages', `${stem}.txt`);
    const jsonPath = path.join(outDir, 'pages', `${stem}.json`);

    fs.writeFileSync(htmlPath, html);
    fs.writeFileSync(textPath, pageData.text);

    for (const link of pageData.allLinks) {
      let normalized;
      try {
        normalized = normalizeUrl(link.url);
      } catch {
        continue;
      }

      if (shouldDownload(normalized, crawlOptions)) {
        if (downloadAttachments && !seenAttachments.has(normalized)) {
          seenAttachments.add(normalized);
          try {
            attachments.push(await saveAttachment(client, normalized, outDir, current, attachments.length));
          } catch (error) {
            skipped.push({ url: normalized, reason: `download failed: ${error.message}` });
          }
        }
        continue;
      }

      if (!seenPages.has(normalized) && !isDangerousGetUrl(normalized) && shouldVisitPage(normalized, crawlOptions)) {
        queue.push(normalized);
      }
    }

    const pageRecord = {
      index,
      url: current,
      title: pageData.title,
      headings: pageData.headings,
      textPath: path.relative(outDir, textPath),
      htmlPath: path.relative(outDir, htmlPath),
      jsonPath: path.relative(outDir, jsonPath),
      links: pageData.allLinks,
      downloads: pageData.downloads,
      forms: pageData.forms,
    };
    fs.writeFileSync(jsonPath, JSON.stringify(pageRecord, null, 2));
    pages.push(pageRecord);
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    startUrl,
    scope,
    courseId: inferredCourseId || null,
    maxPages,
    pages,
    attachments,
    skipped,
    truncated: queue.length > 0,
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

module.exports = {
  crawl,
  normalizeUrl,
  shouldDownload,
  shouldVisitPage,
};
