import { PronunciationNote } from '../types';

export type PronunciationToken =
  | { type: 'text'; value: string }
  | { type: 'ruby'; term: string; pinyin: string; note?: string };

const normalizeNotes = (notes: PronunciationNote[]): Array<Pick<PronunciationNote, 'term' | 'pinyin' | 'note'>> => {
  const map = new Map<string, Pick<PronunciationNote, 'term' | 'pinyin' | 'note'>>();
  for (const n of notes || []) {
    const term = (n?.term || '').trim();
    const pinyin = (n?.pinyin || '').trim();
    if (!term || !pinyin) continue;
    map.set(term, { term, pinyin, note: n.note });
  }

  const list = Array.from(map.values());
  list.sort((a, b) => {
    const len = b.term.length - a.term.length;
    if (len !== 0) return len;
    return a.term.localeCompare(b.term, 'zh-Hans-CN');
  });
  return list;
};

/**
 * 将一段文本（单行）按“最长词优先”规则分词，把命中的词标记为 ruby。
 * 仅用于渲染提示，不修改原始文本。
 */
export const tokenizeWithPronunciation = (text: string, notes: PronunciationNote[]): PronunciationToken[] => {
  const normalized = normalizeNotes(notes || []);
  if (!text) return [];
  if (normalized.length === 0) return [{ type: 'text', value: text }];

  const tokens: PronunciationToken[] = [];
  let buffer = '';
  let i = 0;

  while (i < text.length) {
    let matched: (typeof normalized)[number] | undefined = undefined;
    for (const n of normalized) {
      if (n.term.length === 0) continue;
      if (text.startsWith(n.term, i)) {
        matched = n;
        break;
      }
    }

    if (matched) {
      if (buffer) {
        tokens.push({ type: 'text', value: buffer });
        buffer = '';
      }
      tokens.push({ type: 'ruby', term: matched.term, pinyin: matched.pinyin, note: matched.note });
      i += matched.term.length;
      continue;
    }

    buffer += text[i];
    i += 1;
  }

  if (buffer) tokens.push({ type: 'text', value: buffer });
  return tokens;
};

