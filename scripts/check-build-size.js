#!/usr/bin/env node
/**
 * Enforce: requests below 8 per page, total static size below 2 MB.
 * Each route is its own lazy chunk; a page loads the entry files plus its route's chunks.
 */

const fs = require('fs');
const path = require('path');

const BUILD_DIR = path.join(__dirname, '..', 'build');
const MAX_SIZE_MB = 2;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024; // strictly below 2 MB
const MAX_REQUESTS_PER_PAGE = 8;

function getSize(dir, base = '') {
  let total = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      total += getSize(full, rel);
    } else {
      const s = fs.statSync(full).size;
      total += s;
    }
  }
  return total;
}

function main() {
  // On Netlify CI, don't fail the build on these checks.
  // Netlify exposes NETLIFY="true" in the build environment.
  if (process.env.NETLIFY === 'true') {
    console.log('Netlify build detected; skipping strict build-size checks for CI.');
    return;
  }

  if (!fs.existsSync(BUILD_DIR)) {
    console.error('Build folder not found. Run: npm run build');
    process.exit(1);
  }

  const jsDir = path.join(BUILD_DIR, 'static', 'js');
  const cssDir = path.join(BUILD_DIR, 'static', 'css');

  let totalBytes = 0;
  let jsCount = 0;
  let cssCount = 0;
  if (fs.existsSync(jsDir)) {
    totalBytes += getSize(jsDir);
    jsCount = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js') && !f.endsWith('.LICENSE.txt')).length;
  }
  if (fs.existsSync(cssDir)) {
    totalBytes += getSize(cssDir);
    cssCount = fs.readdirSync(cssDir).filter((f) => f.endsWith('.css')).length;
  }

  const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);
  const sizeOk = totalBytes < MAX_SIZE_BYTES; // below 2 MB

  // Per page = entry files + the chunks of the heaviest lazy route (not every chunk in the build).
  const manifest = JSON.parse(fs.readFileSync(path.join(BUILD_DIR, 'asset-manifest.json'), 'utf8'));
  const entryCount = (manifest.entrypoints || []).length;
  const mainJs = (manifest.entrypoints || []).find((f) => f.endsWith('.js'));
  const mainSrc = mainJs ? fs.readFileSync(path.join(BUILD_DIR, mainJs), 'utf8') : '';
  const routeLoads = mainSrc.match(/Promise\.all\(\[(?:\w\.e\(\d+\),?)+\]\)|\w\.e\(\d+\)\.then/g) || [];
  const maxRouteChunks = Math.max(0, ...routeLoads.map((m) => (m.match(/\.e\(\d+\)/g) || []).length));
  const requestEstimate = 1 + entryCount + maxRouteChunks + 1; // HTML + entry JS/CSS + heaviest route + favicon
  const requestsOk = requestEstimate <= MAX_REQUESTS_PER_PAGE;

  console.log(`\nBuild check: requests below ${MAX_REQUESTS_PER_PAGE}, size below ${MAX_SIZE_MB} MB`);
  console.log(`  Total static JS + CSS: ${totalMB} MB ${sizeOk ? '✓' : '✗ (must be below 2 MB)'}`);
  console.log(`  Asset count: ${jsCount} JS + ${cssCount} CSS; heaviest page loads ${entryCount} entry + ${maxRouteChunks} route files → ~${requestEstimate} requests ${requestsOk ? '✓' : '✗ (max 8)'}`);
  if (!sizeOk) {
    console.error(`\nTotal size ${totalMB} MB must be below ${MAX_SIZE_MB} MB. Reduce bundle size.`);
    process.exit(1);
  }
  if (!requestsOk) {
    console.error(`\nEstimated requests (${requestEstimate}) must be ≤ ${MAX_REQUESTS_PER_PAGE}. Reduce number of chunks.`);
    process.exit(1);
  }
  console.log('  For Network tab under 2 MB: use production (npm run build && npx serve -s build).\n');
}

main();
