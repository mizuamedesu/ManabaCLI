const fs = require('node:fs');
const path = require('node:path');
const { readConfig } = require('./config');
const { ManabaClient } = require('./client');
const { assertReadOnlyRequest } = require('./safety');
const { extractCourseId, safeFileName, scrapeCourses, scrapePage } = require('./scrape');

function printHelp() {
  console.log(`manaba-readonly

Usage:
  manaba-readonly courses [--json]
  manaba-readonly read [target] [--json]
  manaba-readonly links [target] [--json]
  manaba-readonly downloads [target] [--json]
  manaba-readonly download <url> [--out downloads]

Targets:
  home                  manaba home
  12345                 /ct/course_12345
  course_12345          /ct/course_12345
  /ct/course_12345      site-relative URL
  https://...           absolute URL

Safety:
  After login, every browser request is guarded. Non-GET/HEAD/OPTIONS requests
  and state-changing GET-looking URLs are blocked.
`);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      args.json = true;
    } else if (arg === '--headed') {
      args.headed = true;
    } else if (arg === '--key') {
      args.keyPath = argv[++i];
    } else if (arg === '--out' || arg === '-o') {
      args.out = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      args._.push(arg);
    }
  }
  return args;
}

function printCourses(courses, json) {
  const rows = courses.map((course, index) => ({
    index,
    id: extractCourseId(course.url),
    title: course.title,
    url: course.url,
  }));
  if (json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  for (const row of rows) {
    console.log(`${row.index}\t${row.id}\t${row.title}`);
  }
}

function printLinks(pageData, json, downloadsOnly = false) {
  const rows = (downloadsOnly ? pageData.downloads : pageData.links).map((link, index) => ({
    index,
    text: link.text || '(no text)',
    url: link.url,
  }));
  if (json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  for (const row of rows) {
    console.log(`${row.index}\t${row.text}\t${row.url}`);
  }
}

function printPage(pageData, json) {
  if (json) {
    console.log(JSON.stringify(pageData, null, 2));
    return;
  }
  console.log(`# ${pageData.title}`);
  console.log(pageData.url);
  if (pageData.headings.length) {
    console.log('\n## Headings');
    for (const heading of pageData.headings) console.log(`- ${heading}`);
  }
  console.log('\n## Text');
  console.log(pageData.text);
}

function fileNameFromResponse(response, url) {
  const disposition = response.headers()['content-disposition'] || '';
  const utf8Name = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Name) {
    try {
      return safeFileName(decodeURIComponent(utf8Name[1]));
    } catch {
      return safeFileName(utf8Name[1]);
    }
  }
  const asciiName = disposition.match(/filename="?([^";]+)"?/i);
  if (asciiName) {
    return safeFileName(asciiName[1]);
  }
  const pathname = new URL(url).pathname;
  return safeFileName(path.basename(pathname), 'download.bin');
}

async function withClient(args, work) {
  const config = readConfig({ keyPath: args.keyPath });
  const client = new ManabaClient(config, { headed: args.headed });
  await client.open();
  try {
    await client.login();
    return await work(client);
  } finally {
    await client.close();
  }
}

async function main(argv) {
  const args = parseArgs(argv);
  const [command, target] = args._;

  if (args.help || !command) {
    printHelp();
    return;
  }

  if (command === 'courses') {
    await withClient(args, async (client) => {
      await client.goto('home');
      printCourses(await scrapeCourses(client.page), args.json);
    });
    return;
  }

  if (command === 'read' || command === 'links' || command === 'downloads') {
    await withClient(args, async (client) => {
      await client.goto(target || 'home');
      const pageData = await scrapePage(client.page);
      if (command === 'read') printPage(pageData, args.json);
      if (command === 'links') printLinks(pageData, args.json, false);
      if (command === 'downloads') printLinks(pageData, args.json, true);
    });
    return;
  }

  if (command === 'download') {
    if (!target) throw new Error('download requires a URL or target path');
    await withClient(args, async (client) => {
      const url = client.resolveTarget(target);
      assertReadOnlyRequest('GET', url);
      const response = await client.downloadGet(url);
      const outDir = path.resolve(args.out || 'downloads');
      fs.mkdirSync(outDir, { recursive: true });
      const outPath = path.join(outDir, fileNameFromResponse(response, url));
      fs.writeFileSync(outPath, await response.body());
      console.log(outPath);
    });
    return;
  }

  throw new Error(`unknown command: ${command}`);
}

module.exports = {
  main,
  parseArgs,
};
