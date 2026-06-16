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
  if (!fs.existsSync(keyPath)) {
    throw new Error(`key file not found: ${keyPath}`);
  }

  const parsed = parseKeyText(fs.readFileSync(keyPath, 'utf8'));
  const config = {
    id: process.env.MANABA_ID || parsed.ID,
    password: process.env.MANABA_PASS || parsed.PASS || parsed.PASSWORD,
    url: process.env.MANABA_URL || parsed.URL,
    keyPath,
  };

  const missing = [];
  if (!config.id) missing.push('ID');
  if (!config.password) missing.push('PASS');
  if (!config.url) missing.push('URL');
  if (missing.length) {
    throw new Error(`missing ${missing.join(', ')} in ${keyPath}`);
  }

  return config;
}

module.exports = {
  parseKeyText,
  readConfig,
};
