export const LOOSE_SOUND_KEYWORD_MAX_LEN = 3;
export const LOOSE_SOUND_KEYWORD_MAX_GAP = 1;

export const escapeRegExp = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const clampInt = (value: number, min: number, max: number): number => {
  const n = Number.isFinite(value) ? Math.floor(value) : min;
  return Math.min(max, Math.max(min, n));
};

export const shouldUseLooseSoundKeywordMatch = (
  keyword: string,
  maxLen: number = LOOSE_SOUND_KEYWORD_MAX_LEN
): boolean => {
  const len = Array.from((keyword || '').trim()).length;
  return len > 1 && len <= maxLen;
};

export const buildLooseSoundKeywordPattern = (
  keyword: string,
  maxGap: number = LOOSE_SOUND_KEYWORD_MAX_GAP
): string => {
  const chars = Array.from((keyword || '').trim());
  const gap = clampInt(maxGap, 0, 3);
  const gapPattern = `.{0,${gap}}`;
  return chars.map(escapeRegExp).join(gapPattern);
};

export const buildLooseSoundKeywordRegex = (
  keyword: string,
  maxGap: number = LOOSE_SOUND_KEYWORD_MAX_GAP
): RegExp => {
  return new RegExp(buildLooseSoundKeywordPattern(keyword, maxGap));
};
