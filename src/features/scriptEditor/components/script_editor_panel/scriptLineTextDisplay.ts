export type ScriptLineMarkerToken = { kind: 'plain' | 'marker'; text: string };

export const htmlToTextWithNewlines = (html: string): string => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html || '';

  const isBlockTag = (tagName: string) =>
    tagName === 'DIV' || tagName === 'P' || tagName === 'LI';

  let out = '';

  const ensureLeadingBreak = () => {
    if (out !== '' && !out.endsWith('\n')) {
      out += '\n';
    }
  };

  const ensureTrailingBreak = () => {
    if (!out.endsWith('\n')) {
      out += '\n';
    }
  };

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent || '';
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const element = node as HTMLElement;
    const tag = element.tagName;

    if (tag === 'BR') {
      out += '\n';
      return;
    }

    const isBlock = isBlockTag(tag);
    if (isBlock) {
      ensureLeadingBreak();
    }

    element.childNodes.forEach(walk);

    if (isBlock) {
      ensureTrailingBreak();
    }
  };

  tempDiv.childNodes.forEach(walk);

  return out.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n+$/, '');
};

export function buildMarkerTokens(raw: string): ScriptLineMarkerToken[] {
  const sfxLoose = /\[[^\]]+\]/g;
  const bgmLoose = /<\s*(?:(?:\?-|[\u266A\u266B])\s*-\s*)?[^<>]*?\s*>/g;
  const endLoose = /\/\/+\s*/g;
  const patterns = [sfxLoose, bgmLoose, endLoose] as const;

  const findNext = (from: number) => {
    let best: RegExpExecArray | null = null;

    for (const base of patterns) {
      const re = new RegExp(base.source, 'g');
      re.lastIndex = from;
      const match = re.exec(raw);

      if (match && (!best || match.index < best.index)) {
        best = match;
      }
    }

    return best;
  };

  const tokens: ScriptLineMarkerToken[] = [];
  let position = 0;

  while (position < raw.length) {
    const hit = findNext(position);
    if (!hit) {
      tokens.push({ kind: 'plain', text: raw.slice(position) });
      break;
    }

    const start = hit.index;
    const end = start + hit[0].length;

    if (start > position) {
      tokens.push({ kind: 'plain', text: raw.slice(position, start) });
    }

    tokens.push({ kind: 'marker', text: raw.slice(start, end) });
    position = end;
  }

  if (raw.length === 0) {
    tokens.push({ kind: 'plain', text: '' });
  }

  return tokens;
}

export function sanitizeForDisplay(raw: string): string {
  const tokens = buildMarkerTokens(raw);
  return tokens
    .filter((token) => token.kind === 'plain')
    .map((token) => token.text)
    .join('');
}

export function mergeEditedWithMarkers(original: string, newPlain: string): string {
  const tokens = buildMarkerTokens(original);
  const plainIndexes: number[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].kind === 'plain') {
      plainIndexes.push(index);
    }
  }

  if (plainIndexes.length === 0) {
    return original;
  }

  if (plainIndexes.length === 1) {
    tokens[plainIndexes[0]].text = newPlain;
    return tokens.map((token) => token.text).join('');
  }

  const originalPlainLengths = plainIndexes.map(
    (index) => tokens[index].text.length
  );
  let cursor = 0;

  for (let plainIndex = 0; plainIndex < plainIndexes.length; plainIndex += 1) {
    const tokenIndex = plainIndexes[plainIndex];
    if (plainIndex === plainIndexes.length - 1) {
      tokens[tokenIndex].text = newPlain.slice(cursor);
      continue;
    }

    const take = Math.max(
      0,
      Math.min(originalPlainLengths[plainIndex], newPlain.length - cursor)
    );
    tokens[tokenIndex].text = newPlain.slice(cursor, cursor + take);
    cursor += take;
  }

  return tokens.map((token) => token.text).join('');
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/\"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function isSfxBracketMarker(text: string): boolean {
  if (!text || text.length < 2) {
    return false;
  }

  return text.startsWith('[') && text.endsWith(']');
}

export function extractSfxLabel(text: string): string {
  return text.length >= 2 ? text.slice(1, -1).trim() : text;
}

export function tokensToDisplayHtml(original: string): string {
  return escapeHtml(original || '').replace(/\r?\n/g, '<br>');
}

export function ensureSfxDisplayStyle() {
  if (typeof document === 'undefined') {
    return;
  }

  const id = 'sfx-orig-style';
  if (document.getElementById(id)) {
    return;
  }

  const style = document.createElement('style');
  style.id = id;
  style.textContent = '.sfx-orig::before{content:attr(data-label)}';
  document.head.appendChild(style);
}
