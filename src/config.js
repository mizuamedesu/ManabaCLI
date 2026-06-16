const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MANABA_URL = 'https://manaba.tsukuba.ac.jp/';

function parseKeyText(text) {
  const config = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const keyValue = line.match(/^([^=]+)=(.*)$/);
    if (keyValue) {
      config[keyValue[1].trim().toUpperCase()] = keyValue[2].trim();
      continue;
    }

    if (/^https?:\/\//i.test(line)) {
      config.URL = line;
    }
  }

  return config;
}

function normalizeManabaUrl(url) {
  const value = String(url || '').trim();
  if (!value) {
    throw new Error('missing URL');
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  const parsed = new URL(withScheme);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`unsupported URL protocol: ${parsed.protocol}`);
  }
  return parsed.toString();
}

function formatKeyText(config) {
  if (!config.id) {
    throw new Error('ID is required');
  }
  if (!config.password) {
    throw new Error('PASS is required');
  }
  return `ID=${config.id}\nPASS=${config.password}\n\n${normalizeManabaUrl(config.url)}\n`;
}

function writeKeyFile(config, options = {}) {
  const keyPath = path.resolve(options.keyPath || process.env.MANABA_KEY || '.key');
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  fs.writeFileSync(keyPath, formatKeyText(config), { mode: 0o600 });
  fs.chmodSync(keyPath, 0o600);
  return keyPath;
}

function readConfig(options = {}) {
  const keyPath = path.resolve(options.keyPath || process.env.MANABA_KEY || '.key');
  const keyText = fs.existsSync(keyPath) ? fs.readFileSync(keyPath, 'utf8') : '';
  if (!keyText && !process.env.MANABA_URL) {
    throw new Error(`key file not found: ${keyPath}`);
  }

  const parsed = parseKeyText(keyText);
  const rawUrl = process.env.MANABA_URL || parsed.URL;
  if (!rawUrl) {
    throw new Error(`missing URL in ${keyPath}`);
  }
  const url = normalizeManabaUrl(rawUrl);

  const host = new URL(url).host.replace(/[^A-Za-z0-9._-]+/g, '_');
  const config = {
    id: process.env.MANABA_ID || parsed.ID,
    password: process.env.MANABA_PASS || parsed.PASS || parsed.PASSWORD,
    url,
    keyPath,
    authStatePath: path.resolve(
      options.authStatePath ||
        process.env.MANABA_AUTH_STATE ||
        path.join('.manaba-auth', `${host}.storage-state.json`),
    ),
  };

  return config;
}

module.exports = {
  DEFAULT_MANABA_URL,
  formatKeyText,
  normalizeManabaUrl,
  parseKeyText,
  readConfig,
  writeKeyFile,
};
