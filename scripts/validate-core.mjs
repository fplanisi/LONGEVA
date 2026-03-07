#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const htmlFiles = [
  'index.html',
  'library.html',
  'stack-builder.html',
  'biohacker-protocol.html',
  'food-longevity.html',
  'pricing.html',
];

const apiFiles = [
  'api/create-checkout-session.js',
  'api/checkout-status.js',
  'api/stack-builder.js',
  'api/biohacker-protocol.js',
  'api/replace-item.js',
];

let hasError = false;

for (const rel of htmlFiles) {
  const file = path.join(root, rel);
  const text = fs.readFileSync(file, 'utf8');
  const scripts = [...text.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  scripts.forEach((script, index) => {
    try {
      // eslint-disable-next-line no-new-func
      new Function(script);
    } catch (error) {
      hasError = true;
      console.error(`${rel} inline script ${index + 1}: ${error.message}`);
    }
  });
}

for (const rel of apiFiles) {
  const file = path.join(root, rel);
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'pipe', encoding: 'utf8' });
  if (result.status !== 0) {
    hasError = true;
    console.error(`${rel}: ${result.stderr || result.stdout}`);
  }
}

if (hasError) process.exit(1);
console.log('core validation ok');
