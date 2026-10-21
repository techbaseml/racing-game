import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

// Package the production build for direct opening, including offline fonts.
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const mimeTypes = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml' };
function assetPath(base, url) {
  const path = resolve(base, decodeURIComponent(url));
  const rel = relative(dist, path);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Asset escapes dist: ${url}`);
  return path;
}
function inlineAsset(path) {
  const extension = path.slice(path.lastIndexOf('.'));
  const mime = mimeTypes[extension];
  if (!mime) throw new Error(`Unsupported embedded asset: ${extension}`);
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`;
}
let html = readFileSync(resolve(dist, 'index.html'), 'utf8');
html = html.replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g, (_, url) => {
  const js = readFileSync(assetPath(dist, url), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${js}</script>`;
});
html = html.replace(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, url) => {
  const path = assetPath(dist, url);
  const css = readFileSync(path, 'utf8').replace(/url\((['"]?)([^)'"\s]+)\1\)/g, (original, quote, asset) => {
    if (asset.startsWith('data:') || asset.startsWith('#')) return original;
    return `url("${inlineAsset(assetPath(dirname(path), asset))}")`;
  }).replace(/<\/style/gi, '<\\/style');
  return `<style>${css}</style>`;
});
html = html.replace(/(<link\b[^>]*rel="icon"[^>]*href=")([^"]+)(")/g,
  (_, before, url, after) => `${before}${inlineAsset(assetPath(dist, url))}${after}`);
html = html.replace('class="brand" href="./"', 'class="brand" href=""');
const notices = readFileSync(new URL('../THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8');
html = html.replace('</head>', `<script type="text/plain" id="third-party-notices">${notices.replace(/<\/script/gi, '<\\/script')}</script>\n</head>`);
if (/<(?:script|link)\b[^>]*(?:src|href)="\.\/assets\//.test(html)) throw new Error('Unbundled asset remains');
const output = resolve(dist, 'Turbo-Trails.html');
writeFileSync(output, html);
console.log(`Created ${output} (${Buffer.byteLength(html)} bytes). Open directly in a modern browser.`);
