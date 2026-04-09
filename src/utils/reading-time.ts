/**
 * Estimate reading time for Japanese + mixed content.
 * Japanese: ~500 chars/min, English: ~200 words/min
 */
export function getReadingTime(text: string): string {
  const cleaned = text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

  // Count Japanese characters (CJK Unified Ideographs + Hiragana + Katakana)
  const jaChars = (cleaned.match(/[\u3000-\u9fff\uf900-\ufaff]/g) || []).length;
  // Count English words (remaining non-CJK text)
  const enWords = cleaned
    .replace(/[\u3000-\u9fff\uf900-\ufaff]/g, '')
    .split(/\s+/)
    .filter(Boolean).length;

  const minutes = Math.ceil(jaChars / 500 + enWords / 200);
  return `${Math.max(1, minutes)}分`;
}
