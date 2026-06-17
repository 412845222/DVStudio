#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const parseArgs = (argv) => {
  const args = {
    har: '',
    out: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === '--har' && next) {
      args.har = next;
      i += 1;
      continue;
    }
    if (token === '--out' && next) {
      args.out = next;
      i += 1;
    }
  }
  return args;
};

const toAbs = (p) => (path.isAbsolute(p) ? p : path.resolve(process.cwd(), p));

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));

const isProjectAssetRequest = (url) => {
  const text = String(url || '');
  if (!text) return false;
  if (text.startsWith('dweb://project-assets')) return true;
  return /\/api\/workflow\/projects\/assets\/file(?:\?|$)/.test(text);
};

const parseAssetRequest = (url) => {
  const text = String(url || '').trim();
  if (!text) return null;
  try {
    const base = text.startsWith('dweb://') ? 'http://localhost' : undefined;
    const parsed = base ? new URL(text.replace(/^dweb:\/\/project-assets/, `${base}/project-assets`)) : new URL(text);
    const search = parsed.searchParams;
    const variant = String(search.get('variant') || search.get('mode') || '').trim().toLowerCase();
    const maxSize = Number(search.get('maxSize') || search.get('max_size') || 0) || 0;
    return {
      url: text,
      variant,
      isPreview: variant === 'preview' || variant === 'thumb' || variant === 'thumbnail',
      maxSize,
      path: String(search.get('path') || '').trim(),
      projectId: String(search.get('projectId') || '').trim(),
    };
  } catch {
    const qIndex = text.indexOf('?');
    if (qIndex < 0) return { url: text, variant: '', isPreview: false, maxSize: 0, path: '', projectId: '' };
    const qs = new URLSearchParams(text.slice(qIndex + 1));
    const variant = String(qs.get('variant') || qs.get('mode') || '').trim().toLowerCase();
    const maxSize = Number(qs.get('maxSize') || qs.get('max_size') || 0) || 0;
    return {
      url: text,
      variant,
      isPreview: variant === 'preview' || variant === 'thumb' || variant === 'thumbnail',
      maxSize,
      path: String(qs.get('path') || '').trim(),
      projectId: String(qs.get('projectId') || '').trim(),
    };
  }
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.har) throw new Error('Missing --har <file>');

  const harPath = toAbs(args.har);
  const har = readJson(harPath);
  const entries = Array.isArray(har?.log?.entries) ? har.log.entries : [];

  let totalAssetRequests = 0;
  let previewRequests = 0;
  let originalRequests = 0;
  let preview4xx5xx = 0;
  let original4xx5xx = 0;
  const previewSizes = new Map();
  const previewPathHit = new Map();
  const originalPathHit = new Map();

  for (const entry of entries) {
    const req = entry?.request || {};
    const res = entry?.response || {};
    const status = Number(res.status) || 0;
    const url = String(req.url || '').trim();
    if (!isProjectAssetRequest(url)) continue;

    const parsed = parseAssetRequest(url);
    if (!parsed) continue;
    totalAssetRequests += 1;

    if (parsed.isPreview) {
      previewRequests += 1;
      if (status >= 400) preview4xx5xx += 1;
      if (parsed.maxSize > 0) {
        const key = String(parsed.maxSize);
        previewSizes.set(key, (previewSizes.get(key) || 0) + 1);
      }
      if (parsed.path) previewPathHit.set(parsed.path, (previewPathHit.get(parsed.path) || 0) + 1);
      continue;
    }

    originalRequests += 1;
    if (status >= 400) original4xx5xx += 1;
    if (parsed.path) originalPathHit.set(parsed.path, (originalPathHit.get(parsed.path) || 0) + 1);
  }

  const overlapPathCount = (() => {
    let c = 0;
    for (const key of previewPathHit.keys()) {
      if (originalPathHit.has(key)) c += 1;
    }
    return c;
  })();

  const payload = {
    schemaVersion: 1,
    generatedAt: Date.now(),
    sourceHar: path.relative(process.cwd(), harPath),
    summary: {
      totalAssetRequests,
      previewRequests,
      originalRequests,
      previewRatio: totalAssetRequests > 0 ? Number((previewRequests / totalAssetRequests).toFixed(4)) : 0,
      originalRatio: totalAssetRequests > 0 ? Number((originalRequests / totalAssetRequests).toFixed(4)) : 0,
      preview4xx5xx,
      original4xx5xx,
      overlapPathCount,
    },
    previewSizeDistribution: Object.fromEntries([...previewSizes.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))),
    topPreviewPaths: [...previewPathHit.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([pathValue, count]) => ({ path: pathValue, count })),
    topOriginalPaths: [...originalPathHit.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([pathValue, count]) => ({ path: pathValue, count })),
  };

  const outPath = toAbs(args.out || path.join(path.dirname(harPath), `aiwf-preview-audit-${Date.now()}.json`));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');

  console.log(`[aiwf-asset-preview-audit] wrote ${outPath}`);
  console.log(`[aiwf-asset-preview-audit] total=${totalAssetRequests} preview=${previewRequests} original=${originalRequests}`);
};

try {
  main();
} catch (error) {
  console.error('[aiwf-asset-preview-audit] Failed:', error?.message || error);
  process.exit(1);
}
