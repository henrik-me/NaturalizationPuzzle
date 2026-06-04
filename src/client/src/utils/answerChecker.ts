/**
 * Normalizes free text for comparison (NO parenthetical or number handling):
 * lowercase, replace every non-word/non-space character (punctuation, hyphens,
 * parentheses) with a space, collapse runs of whitespace, and trim.
 *
 * Parenthetical handling and number normalization are intentionally kept out of
 * this function and live in `generateCandidates` and `normalizeNumbers` so each
 * concern stays small and independently testable.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // strip punctuation/hyphens/parens to spaces
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim();
}

const ONES: Readonly<Record<string, number>> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
};

const TEENS: Readonly<Record<string, number>> = {
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Readonly<Record<string, number>> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/**
 * Own-property lookup into one of the number-word maps. Avoids the `in`
 * operator (which walks the prototype chain and would treat inherited keys like
 * `__proto__`, `constructor`, or `toString` as number words).
 */
function numberValue(map: Readonly<Record<string, number>>, token: string): number | undefined {
  return Object.hasOwn(map, token) ? map[token] : undefined;
}

function isNumberWord(token: string): boolean {
  return (
    numberValue(ONES, token) !== undefined ||
    numberValue(TEENS, token) !== undefined ||
    numberValue(TENS, token) !== undefined ||
    token === 'hundred'
  );
}

function stripOrdinalSuffix(token: string): string {
  const match = /^(\d+)(?:st|nd|rd|th)$/.exec(token);
  return match ? match[1] : token;
}

/**
 * Splits a run of number words (without "and"/"hundred") into groups, each
 * representing a value < 100 (a teen, a standalone unit, or a tens word with an
 * optional trailing unit). Used to detect spoken-year pairs like
 * "eighteen seventy" (two groups: 18, 70).
 */
function splitGroups(tokens: readonly string[]): number[] {
  const groups: number[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    const teen = numberValue(TEENS, t);
    const ten = numberValue(TENS, t);
    const one = numberValue(ONES, t);
    if (teen !== undefined) {
      groups.push(teen);
      i += 1;
    } else if (ten !== undefined) {
      let value = ten;
      const nextOne = i + 1 < tokens.length ? numberValue(ONES, tokens[i + 1]) : undefined;
      if (nextOne !== undefined) {
        value += nextOne;
        i += 2;
      } else {
        i += 1;
      }
      groups.push(value);
    } else if (one !== undefined) {
      groups.push(one);
      i += 1;
    } else {
      i += 1;
    }
  }
  return groups;
}

/**
 * Sums a run of cardinal number words into a value. Returns `NaN` when the run
 * is not a valid standalone cardinal — specifically when "hundred" appears with
 * no preceding value (a lone "hundred" is a plain word, not the number 100), so
 * callers leave such tokens unchanged.
 */
function parseCardinal(tokens: readonly string[]): number {
  let current = 0;
  let sawValue = false;
  for (const w of tokens) {
    if (w === 'and') continue;
    if (w === 'hundred') {
      if (!sawValue) return NaN; // lone "hundred" is not a number
      current *= 100;
      continue;
    }
    const value = numberValue(ONES, w) ?? numberValue(TEENS, w) ?? numberValue(TENS, w);
    if (value !== undefined) {
      current += value;
      sawValue = true;
    }
  }
  return current;
}

/**
 * Converts a run of number words to its digit string. A run containing
 * "hundred" is summed as a cardinal (e.g. "four hundred thirty five" -> "435").
 * A run with no "hundred" is only converted when it forms either (1) a single
 * value < 100 ("nine" -> "9", "twenty seven" -> "27") or (2) a spoken-year pair
 * of two 2-digit groups ("eighteen seventy" -> "1870"). Any other no-"hundred"
 * run (e.g. "four five", "one two three") is NOT a valid cardinal phrase and is
 * left as words, so unrelated number words can never collapse into a number.
 */
function convertNumberRun(run: readonly string[]): string {
  if (run.includes('hundred')) {
    const value = parseCardinal(run);
    // A lone "hundred" (or any run that is not a valid cardinal) is left as words.
    return Number.isNaN(value) ? run.join(' ') : String(value);
  }

  const groups = splitGroups(run.filter((t) => t !== 'and'));
  // Single value < 100: "nine" -> 9, "twenty seven" -> 27.
  if (groups.length === 1) {
    return String(groups[0]);
  }
  // Spoken-year pair: two adjacent 2-digit groups, e.g. "eighteen seventy" -> 1870.
  if (groups.length === 2 && groups.every((g) => g >= 10 && g <= 99)) {
    return String(groups[0] * 100 + groups[1]);
  }
  // Not a valid cardinal phrase ("four five", "one two") - leave unchanged.
  return run.join(' ');
}

/**
 * Converts number WORDS to digits via a greedy longest-match phrase pass over
 * whitespace tokens. Handles:
 *  - cardinals: tens + ones, and hundreds with optional "and"
 *  - 4-digit spoken-year pairs ("eighteen seventy" -> 1870)
 *  - digit-suffix ordinals ("22nd" -> 22, "4th" -> 4)
 * Word ordinals ("fourth", "second") are intentionally NOT mapped to digits.
 * Input is expected to already be `normalizeText`-ed (lowercase, no punctuation,
 * hyphens already split to spaces). Non-number tokens are left untouched.
 */
function normalizeNumbers(text: string): string {
  const tokens = text
    .split(' ')
    .filter((t) => t.length > 0)
    .map(stripOrdinalSuffix);

  const result: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (isNumberWord(tokens[i])) {
      const run: string[] = [];
      let j = i;
      while (j < tokens.length) {
        if (isNumberWord(tokens[j])) {
          run.push(tokens[j]);
          j += 1;
        } else if (
          tokens[j] === 'and' &&
          j + 1 < tokens.length &&
          isNumberWord(tokens[j + 1])
        ) {
          run.push('and');
          j += 1;
        } else {
          break;
        }
      }
      result.push(convertNumberRun(run));
      i = j;
    } else {
      result.push(tokens[i]);
      i += 1;
    }
  }
  return result.join(' ');
}

/**
 * Generates candidate string forms for ONE accepted answer:
 *  (a) STRIPPED  - parentheses AND their contents removed (the canonical form).
 *  (b) UNWRAPPED - parentheses removed but their contents kept inline.
 *  (c) NUMERIC-CONTENTS-ONLY - for each parenthetical whose trimmed content is
 *      purely numeric, the bare number alone (e.g. "Four (4) years" -> "4").
 * Non-numeric parenthetical contents never become standalone candidates, so
 * "(Thomas) Jefferson" does not yield "Thomas". The STRIPPED form is always
 * returned first (it is the only form used for lenient matching).
 */
function generateCandidates(accepted: string): string[] {
  const stripped = accepted.replace(/\([^)]*\)/g, ' ');
  const unwrapped = accepted.replace(/[()]/g, ' ');

  const candidates: string[] = [stripped, unwrapped];

  const parenRegex = /\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = parenRegex.exec(accepted)) !== null) {
    const content = match[1].trim();
    if (/^\d+$/.test(content)) {
      candidates.push(content);
    }
  }

  return [...new Set(candidates)];
}

function normalizeFull(text: string): string {
  return normalizeNumbers(normalizeText(text));
}

/**
 * Hand-curated groups of interchangeable WHOLE civics answers. Each group ties
 * a seed answer to one or more well-known equivalents that are NOT in the seed
 * data (e.g. "USA"/"America" alongside the seed answer "The United States", and
 * the Latin "E pluribus unum" alongside the seed motto "Out of many, one"), so
 * typing any group member is accepted for that answer. Groups are raw,
 * pre-normalization.
 *
 * These are intentionally tiny and conservative. They are matched ONLY as
 * whole-answer equality against the stripped canonical candidate (see
 * `sameFullAnswerSynonym`), never fed into the token containment or overlap
 * heuristics, so they add zero new partial-match surface and cannot, on their
 * own, accept a wrong answer for a different question.
 *
 * NOTE: groups are GLOBAL (not scoped to a question id, which the checker does
 * not receive). When editing this list, audit that no member normalizes to the
 * WHOLE of an unrelated question's accepted answer. Today the only whole answer
 * matching the country group is Q66's "The United States".
 */
const SYNONYM_GROUPS_RAW: readonly (readonly string[])[] = [
  // Country name (e.g. Q66 Pledge of Allegiance, whole answer "The United States").
  [
    'the United States',
    'United States',
    'United States of America',
    'America',
    'USA',
    'U.S.',
    'U.S.A.',
  ],
  // National motto (Q124, whole answer "Out of many, one"); "E pluribus unum"
  // is the well-known Latin form not present in the seed data.
  ['Out of many, one', 'We all become one', 'E pluribus unum'],
];

const SYNONYM_GROUPS: ReadonlyArray<ReadonlySet<string>> = SYNONYM_GROUPS_RAW.map(
  (group) => new Set(group.map(normalizeFull).filter((s) => s.length > 0)),
);

/**
 * True when two ALREADY-normalized whole answers belong to the same curated
 * synonym group. Used as an exact-only equivalence alongside literal equality;
 * deliberately not used by any lenient (containment/overlap) path.
 */
function sameFullAnswerSynonym(a: string, b: string): boolean {
  if (a.length === 0 || b.length === 0) return false;
  return SYNONYM_GROUPS.some((group) => group.has(a) && group.has(b));
}

function tokenize(text: string): string[] {
  return text.split(' ').filter((t) => t.length > 0);
}

/**
 * Common English function words that carry no civics meaning on their own.
 * They are excluded from the lenient matching paths so that a stopword-only
 * input (e.g. "the" or "of") can never satisfy a multi-word answer such as
 * "the Constitution". Short numbers (e.g. "13") are intentionally NOT stopwords
 * so a valid numeric subset like "13" still matches "13 original colonies".
 */
const STOPWORDS: ReadonlySet<string> = new Set([
  'a',
  'an',
  'as',
  'at',
  'be',
  'by',
  'do',
  'he',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'to',
  'we',
  'and',
  'are',
  'for',
  'her',
  'his',
  'its',
  'our',
  'the',
  'was',
  'that',
  'them',
  'they',
  'this',
  'were',
  'with',
]);

/**
 * A token is "significant" for the overlap heuristic if it is long enough to be
 * meaningful (>2 chars, preserving the prior overlap threshold) and is not a
 * common stopword. Numeric matching never relies on significance — numbers
 * match by exact whole-token equality in `containsTokens` and the
 * exact-equality check.
 */
function isSignificant(token: string): boolean {
  return token.length > 2 && !STOPWORDS.has(token);
}

/**
 * Returns true when `a` and `b` are within a single edit (one insertion,
 * deletion, or substitution) of each other — i.e. Levenshtein distance <= 1.
 * Implemented as a length-diff short-circuit plus a single linear scan rather
 * than a full DP table. Transpositions count as two edits and are NOT within
 * one edit.
 */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;

  let i = 0;
  let j = 0;
  let edited = false;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    if (edited) return false; // a second mismatch => distance >= 2
    edited = true;
    if (la > lb) {
      i += 1; // deletion from a
    } else if (lb > la) {
      j += 1; // insertion into a
    } else {
      i += 1;
      j += 1; // substitution
    }
  }
  // A leftover trailing character in the longer string is the single edit; if
  // we already consumed our one edit, that trailing char makes it two.
  if ((i < la || j < lb) && edited) return false;
  return true;
}

/**
 * Typo-tolerant token equality used ONLY by the overlap heuristic. Two tokens
 * are fuzzy-equal when they are identical, or both are long enough (>=6 chars),
 * contain no digit, are NOT a pure singular/plural pair, and are within a single
 * edit. The length and digit guards keep short words and every numeric token (a
 * PR1 precision guarantee) on strict exact matching, so "5" never matches "9"
 * and "1786" never matches "1776". The >=6 threshold avoids loose 5-letter
 * collisions such as "state"~"states". The plural guard rejects pairs that
 * differ only by a trailing "s" (e.g. "president"~"presidents",
 * "freedom"~"freedoms", "amendment"~"amendments") because that single edit
 * collapses distinct civics terms that belong to different questions; genuine
 * substitution typos such as "presidant"~"president" are still accepted. The
 * guard is skipped when the shorter token already ends in "s" so genuine
 * final-"s" deletion typos like "congres"~"congress" still match.
 */
function fuzzyEqual(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 6 || b.length < 6) return false;
  if (/\d/.test(a) || /\d/.test(b)) return false;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (
    !shorter.endsWith('s') &&
    longer.length === shorter.length + 1 &&
    longer === `${shorter}s`
  ) {
    return false;
  }
  return withinOneEdit(a, b);
}

/**
 * Whole-token contiguous containment: true when `needle` appears as a
 * consecutive run of tokens inside `haystack`. Because matching is per whole
 * token, a numeric token (e.g. "1") can never match a sub-span of a longer
 * number (e.g. "100").
 */
function containsTokens(haystack: readonly string[], needle: readonly string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    let all = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[start + j] !== needle[j]) {
        all = false;
        break;
      }
    }
    if (all) return true;
  }
  return false;
}

/**
 * Checks whether a user's typed answer matches any of the accepted answers.
 *
 * Each accepted answer is expanded into candidate forms (see
 * `generateCandidates`) and both sides are normalized with `normalizeText`
 * followed by `normalizeNumbers`, so digit and word number forms are unified
 * ("four"/"4" -> "4", "twenty-seven"/"27" -> "27", "eighteen seventy"/"1870" ->
 * "1870"). Matching is numeric-aware: numeric tokens only match by exact whole
 * token equality, so "1" is never accepted for "100".
 *
 * Exact equality is checked against every candidate; lenient matching
 * (whole-token containment and >=50% significant-word overlap) is applied only
 * against the STRIPPED candidate so a parenthetical clarifier (e.g. "(Thomas)")
 * can never satisfy the answer on its own. Stopword-only inputs (e.g. "the")
 * are rejected: significant-word filtering keeps them from matching multi-word
 * answers such as "the Constitution" through containment or overlap. For
 * numeric answers, the lenient paths additionally require the user to supply at
 * least one of the answer's numeric tokens, so the bare noun ("years",
 * "states") cannot match "Four (4) years" or "50 states".
 *
 * The overlap heuristic is typo-tolerant (`fuzzyEqual`): a word that is within
 * one edit of an accepted word (both >=6 chars, no digits) counts as a match,
 * so "presidant" matches "President". To contain false positives it counts
 * unique accepted words matched and never lets a lone fuzzy-only match satisfy
 * a multi-word answer.
 *
 * A small curated set of whole-answer synonyms (`sameFullAnswerSynonym`, e.g.
 * "USA"/"America" for "The United States", "E pluribus unum" for the motto) is
 * accepted alongside exact equality. These are matched only as whole answers
 * against the stripped candidate and never feed the lenient paths.
 */
export function checkAnswer(userAnswer: string, acceptedAnswers: readonly string[]): boolean {
  const user = normalizeFull(userAnswer);
  if (user.length === 0) return false;
  const userTokens = tokenize(user);

  return acceptedAnswers.some((accepted) => {
    const candidates = generateCandidates(accepted).map(normalizeFull);

    // Exact match against any candidate form.
    if (candidates.some((c) => c.length > 0 && c === user)) return true;

    // Lenient matching only against the STRIPPED (canonical) candidate.
    const primary = candidates[0];
    if (primary.length === 0) return false;

    // Curated whole-answer synonym equivalence (e.g. "USA" for "The United
    // States", "E pluribus unum" for "Out of many, one"). Checked only against
    // the stripped canonical form so parenthetical fragments (e.g. the "U.S."
    // inside "(U.S.) Constitution") can never trigger it.
    if (sameFullAnswerSynonym(user, primary)) return true;

    const primaryTokens = tokenize(primary);

    // When the canonical answer contains number(s), the user's input must
    // contain at least one of those exact numeric tokens before the lenient
    // (reverse-containment / overlap) paths may accept it. This prevents the
    // non-numeric remainder alone from satisfying a numeric answer, e.g.
    // "years" must not match "Four (4) years" and "states" must not match
    // "50 states". (Exact match and forward containment already require the
    // number to be present, so they are unaffected.)
    const primaryNumbers = primaryTokens.filter((t) => /^\d+$/.test(t));
    const userHasRequiredNumber =
      primaryNumbers.length === 0 || primaryNumbers.some((n) => userTokens.includes(n));

    // Whole-token containment in either direction (numeric-safe). The reverse
    // direction (user input is a contiguous subset of the accepted answer) is
    // only honored when the user typed at least one non-stopword token (so a
    // lone stopword like "the" cannot match "the Constitution") and, for
    // numeric answers, at least one required numeric token.
    if (containsTokens(userTokens, primaryTokens)) return true;
    if (
      userHasRequiredNumber &&
      userTokens.some((t) => !STOPWORDS.has(t)) &&
      containsTokens(primaryTokens, userTokens)
    ) {
      return true;
    }

    // Significant-word overlap heuristic (>=50% of accepted words present),
    // gated on the required numeric token for numeric answers. Matching is
    // typo-tolerant via `fuzzyEqual`, but to avoid false positives we count
    // UNIQUE accepted words matched (so a repeated user token cannot inflate
    // the count) and never let a single fuzzy-only match carry a multi-word
    // answer (so "freedon of religion" cannot satisfy "freedom of speech" via
    // the lone near-match "freedon"~"freedom").
    if (!userHasRequiredNumber) return false;
    const userWords = userTokens.filter(isSignificant);
    const acceptedWords = [...new Set(primaryTokens.filter(isSignificant))];
    if (acceptedWords.length === 0) return false;

    let exactMatches = 0;
    let fuzzyMatches = 0;
    for (const accepted of acceptedWords) {
      if (userWords.includes(accepted)) {
        exactMatches += 1;
      } else if (userWords.some((w) => fuzzyEqual(w, accepted))) {
        fuzzyMatches += 1;
      }
    }
    const totalMatches = exactMatches + fuzzyMatches;

    // A lone fuzzy (non-exact) match is too weak to accept a multi-word answer.
    if (acceptedWords.length >= 2 && totalMatches === 1 && exactMatches === 0) {
      return false;
    }
    return totalMatches >= Math.ceil(acceptedWords.length * 0.5);
  });
}

/**
 * Test-only export of the internal normalization helpers, grouped under a
 * single `__testing__` object rather than exporting each helper individually.
 * Production code uses `checkAnswer` exclusively; this object exists solely so
 * the unit tests can exercise each pure helper in isolation.
 */
export const __testing__ = {
  normalizeText,
  normalizeNumbers,
  generateCandidates,
  withinOneEdit,
  fuzzyEqual,
  sameFullAnswerSynonym,
};
