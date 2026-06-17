#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = {
    file: '',
    keywords: ['package://', 'ERR_UNKNOWN_URL_SCHEME', 'NotAllowedError'],
    context: 80,
    maxHitsPerKeyword: 20,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--file' && argv[i + 1]) {
      args.file = argv[i + 1];
      i += 1;
    } else if (token === '--keywords' && argv[i + 1]) {
      args.keywords = argv[i + 1].split(',').map((s) => s.trim()).filter(Boolean);
      i += 1;
    } else if (token === '--context' && argv[i + 1]) {
      args.context = Number(argv[i + 1]) || args.context;
      i += 1;
    } else if (token === '--maxHits' && argv[i + 1]) {
      args.maxHitsPerKeyword = Number(argv[i + 1]) || args.maxHitsPerKeyword;
      i += 1;
    }
  }

  return args;
}

function toAbs(p) {
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

function buildFindings(keywords) {
  const findings = {};
  for (const kw of keywords) {
    findings[kw] = { count: 0, samples: [] };
  }
  return findings;
}

async function scanFile({ file, keywords, context, maxHitsPerKeyword }) {
  const abs = toAbs(file);
  if (!fs.existsSync(abs)) {
    throw new Error(`File not found: ${abs}`);
  }

  const findings = buildFindings(keywords);
  const maxKwLen = Math.max(...keywords.map((k) => k.length), 1);

  let offset = 0;
  let carry = '';

  const stream = fs.createReadStream(abs, { encoding: 'utf8', highWaterMark: 1024 * 1024 });

  for await (const chunk of stream) {
    const text = carry + chunk;

    for (const kw of keywords) {
      let idx = text.indexOf(kw);
      while (idx !== -1) {
        findings[kw].count += 1;

        if (findings[kw].samples.length < maxHitsPerKeyword) {
          const left = Math.max(0, idx - context);
          const right = Math.min(text.length, idx + kw.length + context);
          findings[kw].samples.push({
            approxOffset: offset - carry.length + idx,
            snippet: text.slice(left, right).replace(/\s+/g, ' ').trim(),
          });
        }

        idx = text.indexOf(kw, idx + kw.length);
      }
    }

    carry = text.slice(Math.max(0, text.length - (maxKwLen + context)));
    offset += chunk.length;
  }

  return {
    file: abs,
    sizeBytes: fs.statSync(abs).size,
    keywords,
    findings,
  };
}

function printResult(result) {
  console.log(`File: ${result.file}`);
  console.log(`Size: ${result.sizeBytes} bytes`);

  for (const kw of result.keywords) {
    const f = result.findings[kw];
    console.log(`\nKeyword: ${kw}`);
    console.log(`Count: ${f.count}`);
    if (!f.samples.length) {
      console.log('Samples: none');
      continue;
    }
    for (const s of f.samples) {
      console.log(`- @${s.approxOffset}: ${s.snippet}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    throw new Error('Missing --file parameter');
  }
  const result = await scanFile(args);
  printResult(result);
}

main().catch((err) => {
  console.error('[scan-large-text] Failed:', err?.message || err);
  process.exit(1);
});
