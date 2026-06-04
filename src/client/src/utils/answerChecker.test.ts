import { describe, it, expect } from 'vitest';
import { checkAnswer, __testing__ } from './answerChecker';

const { normalizeNumbers, generateCandidates } = __testing__;

describe('checkAnswer', () => {
  it('matches exact answer (case-insensitive)', () => {
    expect(checkAnswer('Republic', ['Republic'])).toBe(true);
    expect(checkAnswer('republic', ['Republic'])).toBe(true);
    expect(checkAnswer('REPUBLIC', ['Republic'])).toBe(true);
  });

  it('matches with extra whitespace', () => {
    expect(checkAnswer('  Republic  ', ['Republic'])).toBe(true);
  });

  it('matches any of multiple accepted answers', () => {
    const accepted = ['Republic', 'Constitution-based federal republic', 'Representative democracy'];
    expect(checkAnswer('Republic', accepted)).toBe(true);
    expect(checkAnswer('representative democracy', accepted)).toBe(true);
  });

  it('matches when user answer contains accepted answer', () => {
    expect(checkAnswer('It is a Republic', ['Republic'])).toBe(true);
  });

  it('matches when accepted answer contains user answer', () => {
    expect(checkAnswer('federal republic', ['Constitution-based federal republic'])).toBe(true);
  });

  it('strips parenthetical clarifications', () => {
    expect(checkAnswer('freedom of speech', ['freedom of speech (and of the press)'])).toBe(true);
  });

  it('returns false for empty input', () => {
    expect(checkAnswer('', ['Republic'])).toBe(false);
    expect(checkAnswer('   ', ['Republic'])).toBe(false);
  });

  it('returns false for wrong answers', () => {
    expect(checkAnswer('Monarchy', ['Republic', 'Representative democracy'])).toBe(false);
  });

  it('matches on significant word overlap', () => {
    expect(checkAnswer('the supreme law of the land', ['the Constitution', 'the supreme law of the land'])).toBe(true);
  });
});

describe('checkAnswer - numeric answers (digit and word form)', () => {
  it('accepts digit, word, and inline forms for "Four (4) years"', () => {
    const accepted = ['Four (4) years'];
    expect(checkAnswer('4', accepted)).toBe(true);
    expect(checkAnswer('four', accepted)).toBe(true);
    expect(checkAnswer('Four', accepted)).toBe(true);
    expect(checkAnswer('four years', accepted)).toBe(true);
    expect(checkAnswer('4 years', accepted)).toBe(true);
  });

  it('accepts single-digit numeric contents', () => {
    expect(checkAnswer('9', ['Nine (9)'])).toBe(true);
    expect(checkAnswer('5', ['Five (5)'])).toBe(true);
  });

  it('accepts hyphenated and spaced tens words', () => {
    const accepted = ['Twenty-seven (27)'];
    expect(checkAnswer('27', accepted)).toBe(true);
    expect(checkAnswer('twenty-seven', accepted)).toBe(true);
    expect(checkAnswer('twenty seven', accepted)).toBe(true);
  });

  it('accepts hundreds', () => {
    const accepted = ['One hundred (100)'];
    expect(checkAnswer('100', accepted)).toBe(true);
    expect(checkAnswer('one hundred', accepted)).toBe(true);
  });

  it('accepts hundreds with tens and ones', () => {
    const accepted = ['Four hundred thirty-five (435)'];
    expect(checkAnswer('435', accepted)).toBe(true);
    expect(checkAnswer('four hundred thirty-five', accepted)).toBe(true);
    expect(checkAnswer('four hundred thirty five', accepted)).toBe(true);
  });

  it('accepts numeric answers embedded in a phrase', () => {
    expect(checkAnswer('6', ['Six (6) years'])).toBe(true);
    expect(checkAnswer('six', ['Six (6) years'])).toBe(true);
    expect(checkAnswer('six years', ['Six (6) years'])).toBe(true);
    expect(checkAnswer('2', ['Two (2) years'])).toBe(true);
    expect(checkAnswer('two', ['Two (2) years'])).toBe(true);
    expect(checkAnswer('2', ['Two (2)'])).toBe(true);
    expect(checkAnswer('two', ['Two (2)'])).toBe(true);
  });

  it('accepts a number word inside a longer sentence answer', () => {
    const accepted = ['Citizens eighteen (18) and older'];
    expect(checkAnswer('18', accepted)).toBe(true);
    expect(checkAnswer('eighteen', accepted)).toBe(true);
  });

  it('accepts numbers with no parenthetical hint', () => {
    expect(checkAnswer('thirteen', ['13 original colonies'])).toBe(true);
    expect(checkAnswer('13', ['13 original colonies'])).toBe(true);
    expect(checkAnswer('fifty', ['50 states'])).toBe(true);
    expect(checkAnswer('50', ['50 states'])).toBe(true);
  });

  it('accepts spoken-year pairs', () => {
    expect(checkAnswer('eighteen seventy', ['1870'])).toBe(true);
    expect(checkAnswer('1870', ['1870'])).toBe(true);
    expect(checkAnswer('nineteen twenty', ['1920'])).toBe(true);
    expect(checkAnswer('1920', ['1920'])).toBe(true);
    expect(checkAnswer('seventeen seventy six', ['1776'])).toBe(true);
    expect(checkAnswer('seventeen eighty seven', ['1787'])).toBe(true);
  });
});

describe('checkAnswer - numeric false-positive sentinels', () => {
  it('does not match a digit as a sub-span of a longer number', () => {
    expect(checkAnswer('1', ['One hundred (100)'])).toBe(false);
    expect(checkAnswer('3', ['Four hundred thirty-five (435)'])).toBe(false);
    expect(checkAnswer('4', ['Four hundred thirty-five (435)'])).toBe(false);
    expect(checkAnswer('13', ['135'])).toBe(false);
    expect(checkAnswer('2', ['Twenty-seven (27)'])).toBe(false);
    expect(checkAnswer('5', ['50 states'])).toBe(false);
    expect(checkAnswer('76', ['1776'])).toBe(false);
    expect(checkAnswer('76', ['1870'])).toBe(false);
    expect(checkAnswer('18', ['1870'])).toBe(false);
  });

  it('does not match wrong single digits', () => {
    expect(checkAnswer('5', ['Nine (9)'])).toBe(false);
    expect(checkAnswer('9', ['Five (5)'])).toBe(false);
  });

  it('does not map word ordinals to digits', () => {
    expect(checkAnswer('fourth', ['Four (4) years'])).toBe(false);
  });

  it('does not let non-numeric parenthetical contents satisfy the answer', () => {
    expect(checkAnswer('Thomas', ['(Thomas) Jefferson'])).toBe(false);
    expect(checkAnswer('Because of', ['(Because of) the 22nd Amendment'])).toBe(false);
    expect(checkAnswer('Battle of', ['(Battle of) Antietam'])).toBe(false);
  });

  it('preserves non-numeric containment matching', () => {
    expect(checkAnswer('freedom of speech', ['freedom of speech (and of the press)'])).toBe(true);
  });
});

describe('number/text normalization helpers', () => {
  it('normalizeNumbers converts cardinals and ordinals', () => {
    expect(normalizeNumbers('twenty seven')).toBe('27');
    expect(normalizeNumbers('four hundred thirty five')).toBe('435');
    expect(normalizeNumbers('one hundred')).toBe('100');
    expect(normalizeNumbers('eighteen seventy')).toBe('1870');
    expect(normalizeNumbers('22nd')).toBe('22');
    expect(normalizeNumbers('fourth')).toBe('fourth');
    // A lone "hundred" is a plain word, not the number 100.
    expect(normalizeNumbers('hundred')).toBe('hundred');
    expect(normalizeNumbers('a hundred')).toBe('a hundred');
  });

  it('does not accept a lone "hundred" for a hundred-valued answer', () => {
    expect(checkAnswer('hundred', ['One hundred (100)'])).toBe(false);
  });

  it('generateCandidates only emits numeric parenthetical contents', () => {
    expect(generateCandidates('Four (4) years')).toContain('4');
    expect(generateCandidates('(Thomas) Jefferson')).not.toContain('Thomas');
  });

  it('treats prototype-chain keys as plain words, not number words', () => {
    // `__proto__`, `constructor`, `toString` are inherited Object keys; they must
    // not be parsed as numbers (would otherwise corrupt normalization).
    expect(normalizeNumbers('__proto__')).toBe('__proto__');
    expect(normalizeNumbers('constructor')).toBe('constructor');
    expect(normalizeNumbers('toString four')).toBe('toString 4');
    expect(checkAnswer('__proto__', ['Four (4) years'])).toBe(false);
  });
});
