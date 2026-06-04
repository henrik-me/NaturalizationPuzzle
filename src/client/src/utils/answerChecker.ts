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

function convertNumberRun(run: readonly string[]): string {
  const hasHundred = run.includes('hundred');
  if (!hasHundred) {
    const groups = splitGroups(run.filter((t) => t !== 'and'));
    // Spoken-year pair: two adjacent 2-digit cardinal groups, no hundred/thousand.
    if (groups.length === 2 && groups.every((g) => g >= 10 && g <= 99)) {
      return String(groups[0] * 100 + groups[1]);
    }
  }
  const value = parseCardinal(run);
  // A lone "hundred" (or any run that is not a valid cardinal) is left as words.
  return Number.isNaN(value) ? run.join(' ') : String(value);
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

function tokenize(text: string): string[] {
  return text.split(' ').filter((t) => t.length > 0);
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
 * can never satisfy the answer on its own.
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
    const primaryTokens = tokenize(primary);

    // Whole-token containment in either direction (numeric-safe).
    if (containsTokens(userTokens, primaryTokens)) return true;
    if (containsTokens(primaryTokens, userTokens)) return true;

    // Significant-word overlap heuristic (>=50% of accepted words present).
    const userWords = userTokens.filter((w) => w.length > 2);
    const acceptedWords = primaryTokens.filter((w) => w.length > 2);
    if (acceptedWords.length === 0) return false;

    const matchingWords = userWords.filter((w) => acceptedWords.includes(w));
    return matchingWords.length >= Math.ceil(acceptedWords.length * 0.5);
  });
}

/**
 * Test-only export of the internal normalization helpers. Production code uses
 * `checkAnswer` exclusively; these are exposed solely so the unit tests can
 * exercise each pure helper in isolation without widening the public API.
 */
export const __testing__ = { normalizeText, normalizeNumbers, generateCandidates };
