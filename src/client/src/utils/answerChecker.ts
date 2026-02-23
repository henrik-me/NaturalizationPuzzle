/**
 * Normalizes text for comparison: lowercase, trim, collapse whitespace,
 * strip parenthetical clarifications and common filler words.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/\(.*?\)/g, '') // remove parentheticals
    .replace(/[^\w\s]/g, ' ') // strip punctuation
    .replace(/\s+/g, ' ')    // collapse whitespace
    .trim();
}

/**
 * Checks whether a user's typed answer matches any of the accepted answers.
 * Uses case-insensitive, normalized substring matching in both directions:
 * the user's answer contains an accepted answer, or vice versa.
 */
export function checkAnswer(userAnswer: string, acceptedAnswers: readonly string[]): boolean {
  const normalizedUser = normalize(userAnswer);
  if (normalizedUser.length === 0) return false;

  return acceptedAnswers.some(accepted => {
    const normalizedAccepted = normalize(accepted);
    if (normalizedAccepted.length === 0) return false;

    // Exact match after normalization
    if (normalizedUser === normalizedAccepted) return true;

    // User answer contains the accepted answer (or vice versa)
    if (normalizedUser.includes(normalizedAccepted)) return true;
    if (normalizedAccepted.includes(normalizedUser)) return true;

    // Check individual words: if user's answer shares 50%+ words with accepted
    const userWords = normalizedUser.split(' ').filter(w => w.length > 2);
    const acceptedWords = normalizedAccepted.split(' ').filter(w => w.length > 2);
    if (acceptedWords.length === 0) return false;

    const matchingWords = userWords.filter(w => acceptedWords.includes(w));
    return matchingWords.length >= Math.ceil(acceptedWords.length * 0.5);
  });
}
