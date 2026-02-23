import { describe, it, expect } from 'vitest';
import { checkAnswer } from './answerChecker';

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
