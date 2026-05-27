#!/usr/bin/env node
// Turn k6's handleSummary() JSON into a markdown table grouped by the
// `endpoint` tag. Stdlib only — no external deps so this runs anywhere
// Node 18+ is available (CI uses Node 22).
//
// Usage:
//   node tests/perf/summarize.mjs tests/perf/k6-results.json > tests/perf/k6-summary.md
//
// Exit code 1 if ANY scenario recorded zero requests — that's almost always
// the API having died mid-run, and we want CI to surface it loudly even
// though the benchmark step itself is marked `continue-on-error: true`.

import { readFileSync } from 'node:fs';

const ENDPOINT_TAGS = [
  'questions-all',
  'questions-65-20',
  'questions-stateid',
  'states-list',
  'states-detail',
  'stories-list',
  'stories-detail',
];

function fail(msg) {
  process.stderr.write(`summarize: ${msg}\n`);
  process.exit(2);
}

const [, , inputPath] = process.argv;
if (!inputPath) fail('missing input path argument');

let raw;
try {
  raw = JSON.parse(readFileSync(inputPath, 'utf8'));
} catch (err) {
  fail(`failed to read or parse ${inputPath}: ${err.message}`);
}

const metrics = raw.metrics || {};

// k6 reports per-tag submetrics in two slightly different shapes depending
// on version: either as a separate top-level key like
// `http_req_duration{endpoint:foo}`, or nested under the parent metric's
// `submetrics`/`thresholds` map. Probe both.
function findSubmetric(metricName, tag) {
  const flatKey = `${metricName}{endpoint:${tag}}`;
  if (metrics[flatKey]) return metrics[flatKey];
  const parent = metrics[metricName];
  if (parent && parent.submetrics) {
    const sub = parent.submetrics.find(s => s.tags && s.tags.endpoint === tag);
    if (sub) return sub;
  }
  return null;
}

function getValue(metric, key) {
  if (!metric) return null;
  if (metric.values && metric.values[key] !== undefined) return metric.values[key];
  if (metric[key] !== undefined) return metric[key];
  return null;
}

function fmtMs(v) {
  return v == null ? '—' : `${v.toFixed(1)}`;
}

function fmtRate(v) {
  return v == null ? '—' : `${v.toFixed(1)}`;
}

function fmtBytes(v) {
  if (v == null) return '—';
  if (v < 1024) return `${v.toFixed(0)} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KiB`;
  return `${(v / 1024 / 1024).toFixed(2)} MiB`;
}

const rows = [];
const emptyScenarios = [];

for (const tag of ENDPOINT_TAGS) {
  const reqs = findSubmetric('http_reqs', tag);
  const dur = findSubmetric('http_req_duration', tag);
  const size = findSubmetric('bench_bytes_received', tag);

  const count = getValue(reqs, 'count');
  if (!count || count === 0) {
    emptyScenarios.push(tag);
    rows.push({
      tag,
      count: 0,
      p50: null, p95: null, p99: null,
      rate: null,
      avgSize: null,
    });
    continue;
  }

  rows.push({
    tag,
    count,
    p50: getValue(dur, 'med') ?? getValue(dur, 'p(50)'),
    p95: getValue(dur, 'p(95)'),
    p99: getValue(dur, 'p(99)'),
    rate: getValue(reqs, 'rate'),
    avgSize: getValue(size, 'count') != null ? getValue(size, 'count') / count : null,
  });
}

let out = '';
if (emptyScenarios.length > 0) {
  for (const tag of emptyScenarios) {
    out += `> ⚠️ Scenario \`${tag}\` recorded zero requests — the API likely died mid-run.\n`;
  }
  out += '\n';
}

out += '| Endpoint | Requests | p50 (ms) | p95 (ms) | p99 (ms) | Throughput (req/s) | Avg compressed size |\n';
out += '|---|---:|---:|---:|---:|---:|---:|\n';
for (const r of rows) {
  out += `| \`${r.tag}\` | ${r.count} | ${fmtMs(r.p50)} | ${fmtMs(r.p95)} | ${fmtMs(r.p99)} | ${fmtRate(r.rate)} | ${fmtBytes(r.avgSize)} |\n`;
}

process.stdout.write(out);

if (emptyScenarios.length > 0) {
  process.exit(1);
}
