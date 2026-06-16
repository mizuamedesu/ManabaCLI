const DOWNLOAD_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.csv',
  '.txt',
  '.zip',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.mp4',
  '.mp3',
];

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function extractCourseId(url) {
  const match = String(url || '').match(/\/ct\/course_([^/?#]+)/);
  return match ? match[1] : '';
}

function isDownloadLikeUrl(url) {
  const lower = String(url || '').toLowerCase();
  return (
    /\/doc\//i.test(lower) ||
    /download|file|attachment|contentsfile|material/i.test(lower) ||
    DOWNLOAD_EXTENSIONS.some((extension) => lower.split(/[?#]/)[0].endsWith(extension))
  );
}

function safeFileName(name, fallback = 'download') {
  const normalized = cleanText(name)
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/^\.+/, '')
    .replace(/^\.+$/, '')
    .slice(0, 160);
  return normalized || fallback;
}

async function scrapeCourses(page) {
  return page.evaluate(() => {
    const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const seen = new Set();
    return [...document.querySelectorAll('.course-card-titleV2 a[href*="course_"], a[href*="/ct/course_"]')]
      .map((anchor) => ({
        title: clean(anchor.textContent),
        url: anchor.href,
      }))
      .filter((course) => course.title && !course.url.includes('_calink'))
      .filter((course) => {
        if (seen.has(course.url)) return false;
        seen.add(course.url);
        return true;
      });
  });
}

async function scrapePage(page) {
  const data = await page.evaluate(() => {
    const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const main =
      document.querySelector('.pagebody') ||
      document.querySelector('main') ||
      document.querySelector('#container') ||
      document.body;
    const headings = [...main.querySelectorAll('h1,h2,h3,.pagetitle,.pageheader-course-coursename')]
      .filter(visible)
      .map((element) => clean(element.textContent))
      .filter(Boolean);
    const links = [...main.querySelectorAll('a[href]')]
      .filter(visible)
      .map((anchor) => ({
        text: clean(anchor.textContent),
        url: anchor.href,
        id: anchor.id || '',
        className: anchor.className || '',
        parentClass: anchor.parentElement ? anchor.parentElement.className || '' : '',
      }))
      .filter((link) => link.url && link.text !== 'English' && !/\/ct\/logout\b/i.test(link.url));

    return {
      title: document.title,
      url: location.href,
      headings,
      text: clean(main.innerText).slice(0, 20000),
      links,
    };
  });

  data.downloads = data.links
    .filter((link) => isDownloadLikeUrl(link.url))
    .map((link, index) => ({
      index,
      text: link.text,
      url: link.url,
    }));
  return data;
}

module.exports = {
  cleanText,
  extractCourseId,
  isDownloadLikeUrl,
  safeFileName,
  scrapeCourses,
  scrapePage,
};
