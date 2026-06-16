const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const {
  DEFAULT_MANABA_URL,
  normalizeManabaUrl,
  parseKeyText,
  readConfig,
  resolveKeyPath,
  writeKeyFile,
} = require('./config');
const { ManabaClient } = require('./client');
const { crawl } = require('./crawl');
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
  manaba-readonly crawl <target> [--out manaba-export] [--max-pages 500]
  manaba auth setup
  manaba auth login|status|clear

Targets:
  home                  manaba home
  12345                 /ct/course_12345
  course_12345          /ct/course_12345
  /ct/course_12345      site-relative URL
  https://...           absolute URL

Safety:
  After login, every browser request is guarded. Non-GET/HEAD/OPTIONS requests
  and state-changing GET-looking URLs are blocked.

Crawl:
  crawl saves rendered HTML, visible text, page JSON, and attachments discovered
  through DOM links. The default scope is the target course when a course id is
  present; otherwise it stays on the manaba site.
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
    } else if (arg === '--auth-state') {
      args.authStatePath = argv[++i];
    } else if (arg === '--url') {
      args.url = argv[++i];
    } else if (arg === '--id') {
      args.id = argv[++i];
    } else if (arg === '--out' || arg === '-o') {
      args.out = argv[++i];
    } else if (arg === '--max-pages') {
      args.maxPages = Number(argv[++i]);
    } else if (arg === '--scope') {
      args.scope = argv[++i];
    } else if (arg === '--no-download') {
      args.noDownload = true;
    } else if (arg === '--force-login') {
      args.forceLogin = true;
    } else if (arg === '--no-auth-cache') {
      args.noAuthCache = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      args._.push(arg);
    }
  }
  return args;
}

function promptVisible(question, defaultValue = '', io = {}) {
  const input = io.input || process.stdin;
  const output = io.output || process.stdout;
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  if (io.rl) {
    return new Promise((resolve) => {
      io.rl.question(`${question}${suffix}: `, (answer = '') => {
        resolve(answer.trim() || defaultValue);
      });
    });
  }
  const rl = readline.createInterface({ input, output });
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer = '') => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

function promptHidden(question, io = {}) {
  const input = io.input || process.stdin;
  const output = io.output || process.stdout;

  if (io.rl) {
    return new Promise((resolve) => {
      io.rl.question(`${question}: `, (answer = '') => {
        resolve(answer);
      });
    });
  }

  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    const rl = readline.createInterface({ input, output });
    return new Promise((resolve) => {
      rl.question(`${question}: `, (answer = '') => {
        rl.close();
        resolve(answer);
      });
    });
  }

  return new Promise((resolve, reject) => {
    let value = '';
    const wasRaw = input.isRaw;

    const cleanup = () => {
      input.off('keypress', onKeypress);
      input.setRawMode(wasRaw);
      input.pause();
    };

    const onKeypress = (str, key = {}) => {
      if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        output.write('\n');
        resolve(value);
        return;
      }
      if (key.ctrl && (key.name === 'c' || key.name === 'd')) {
        cleanup();
        output.write('\n');
        reject(new Error('cancelled'));
        return;
      }
      if (key.name === 'backspace') {
        value = value.slice(0, -1);
        return;
      }
      if (str && !key.ctrl && !key.meta) {
        value += str;
      }
    };

    readline.emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    input.on('keypress', onKeypress);
    output.write(`${question}: `);
  });
}

function createBufferedPrompt(input, output) {
  const text = fs.readFileSync(input.fd, 'utf8');
  const lines = text.split(/\r?\n/);
  let index = 0;
  return {
    question(prompt, callback) {
      output.write(prompt);
      callback(lines[index++] || '');
    },
    close() {},
  };
}

async function setupCredentials(args, io = {}) {
  const keyPath = resolveKeyPath({ keyPath: args.keyPath });
  const existing = fs.existsSync(keyPath) ? parseKeyText(fs.readFileSync(keyPath, 'utf8')) : {};
  const existingPassword = process.env.MANABA_PASS || existing.PASS || existing.PASSWORD || '';
  const input = io.input || process.stdin;
  const output = io.output || process.stdout;
  const sharedRl =
    !input.isTTY && !io.rl
      ? typeof input.fd === 'number'
        ? createBufferedPrompt(input, output)
        : readline.createInterface({ input, output })
      : undefined;
  const promptIo = sharedRl ? { ...io, rl: sharedRl } : io;

  try {
    const rawUrl =
      args.url ||
      (await promptVisible(
        'URL',
        process.env.MANABA_URL || existing.URL || DEFAULT_MANABA_URL,
        promptIo,
      ));
    const url = normalizeManabaUrl(rawUrl);

    const id =
      args.id ||
      (await promptVisible('ID', process.env.MANABA_ID || existing.ID || '', promptIo));
    if (!id) {
      throw new Error('ID is required');
    }

    const passwordPrompt = existingPassword ? 'PASS (leave empty to keep current)' : 'PASS';
    const enteredPassword = await promptHidden(passwordPrompt, promptIo);
    const password = enteredPassword || existingPassword;
    if (!password) {
      throw new Error('PASS is required');
    }

    const savedPath = writeKeyFile({ id, password, url }, { keyPath });
    return { keyPath: savedPath, url };
  } finally {
    if (sharedRl) {
      sharedRl.close();
    }
  }
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
  const config = readConfig({ keyPath: args.keyPath, authStatePath: args.authStatePath });
  const client = new ManabaClient(config, {
    headed: args.headed,
    forceLogin: args.forceLogin,
    ignoreAuthState: args.noAuthCache,
  });
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

  if (command === 'auth') {
    const action = target || 'status';
    if (action === 'setup' || action === 'configure') {
      const saved = await setupCredentials(args);
      console.log(JSON.stringify({ path: saved.keyPath, url: saved.url, saved: true }, null, 2));
      return;
    }

    const config = readConfig({ keyPath: args.keyPath, authStatePath: args.authStatePath });
    if (action === 'status') {
      const exists = fs.existsSync(config.authStatePath);
      let valid = false;
      if (exists) {
        const client = new ManabaClient(config, {
          headed: args.headed,
          ignoreAuthState: args.noAuthCache,
        });
        await client.open();
        try {
          valid = await client.tryStoredSession();
        } finally {
          await client.close();
        }
      }
      console.log(JSON.stringify({ path: config.authStatePath, exists, valid }, null, 2));
      return;
    }
    if (action === 'clear') {
      const removed = fs.existsSync(config.authStatePath);
      if (removed) fs.rmSync(config.authStatePath);
      console.log(JSON.stringify({ path: config.authStatePath, removed }, null, 2));
      return;
    }
    if (action === 'login') {
      await withClient({ ...args, forceLogin: true }, async (client) => {
        console.log(JSON.stringify({ path: client.config.authStatePath, saved: true }, null, 2));
      });
      return;
    }
    throw new Error(`unknown auth action: ${action}`);
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

  if (command === 'crawl') {
    if (!target) throw new Error('crawl requires a target, such as a course id');
    await withClient(args, async (client) => {
      const manifest = await crawl(client, target, {
        outDir: args.out || 'manaba-export',
        maxPages: args.maxPages || 500,
        scope: args.scope,
        downloadAttachments: !args.noDownload,
      });
      const summary = {
        out: path.resolve(args.out || 'manaba-export'),
        pages: manifest.pages.length,
        attachments: manifest.attachments.length,
        skipped: manifest.skipped.length,
        truncated: manifest.truncated,
      };
      console.log(JSON.stringify(summary, null, 2));
    });
    return;
  }

  throw new Error(`unknown command: ${command}`);
}

module.exports = {
  main,
  parseArgs,
  promptHidden,
  setupCredentials,
};
