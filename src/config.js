const fs = require('node:fs');
const path = require('node:path');

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

function readConfig(options = {}) {
  const keyPath = path.resolve(options.keyPath || process.env.MANABA_KEY || '.key');
  const keyText = fs.existsSync(keyPath) ? fs.readFileSync(keyPath, 'utf8') : '';
  if (!keyText && !process.env.MANABA_URL) {
    throw new Error(`key file not found: ${keyPath}`);
  }

  const parsed = parseKeyText(keyText);
  const url = process.env.MANABA_URL || parsed.URL;
  if (!url) {
    throw new Error(`missing URL in ${keyPath}`);
  }

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
  parseKeyText,
  readConfig,
};
