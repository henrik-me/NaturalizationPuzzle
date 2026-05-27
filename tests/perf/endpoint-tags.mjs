// Single source of truth for the endpoint tag list used by the
// k6 benchmark and the post-run summarizer.
//
// Both `api-bench.js` (k6 scenario definitions + advisory thresholds)
// and `summarize.mjs` (Node post-processor that renders the GitHub
// Actions Step Summary) import from here. Keeping the list in one
// place prevents the silent-drift failure mode where an endpoint
// added to the bench script but not the summarizer (or vice versa)
// causes the summary to omit the endpoint or report zero requests
// even though k6 actually exercised it.
//
// The `.mjs` extension is deliberate: it lets Node treat the file as
// an ES module without requiring a `package.json` in `tests/perf/`,
// and k6's bundler accepts `.mjs` for local imports too.
export const ENDPOINT_TAGS = [
  'questions-all',
  'questions-65-20',
  'questions-stateid',
  'states-list',
  'states-detail',
  'stories-list',
  'stories-detail',
];
