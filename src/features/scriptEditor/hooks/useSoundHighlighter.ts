import { useMemo } from 'react';
import { SoundLibraryItem, IgnoredSoundKeyword } from '../../../types';
import { buildLooseSoundKeywordPattern, escapeRegExp, shouldUseLooseSoundKeywordMatch } from '../../../lib/soundKeywordMatch';

// Escape HTML special characters
const escapeHtml = (text: string) => {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// Create keywords from filenames
const createKeywordsFromFilename = (filename: string): string[] => {
  const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename;
  return nameWithoutExt
    .split(/[_ \-()]/)
    .map((s) => s.trim())
    .filter((s) => s && !/^\d+$/.test(s));
};

export const useSoundHighlighter = (
  text: string,
  soundLibrary: SoundLibraryItem[],
  observationList: string[],
  ignoredKeywords: IgnoredSoundKeyword[] = []
): string => {
  const combinedMatcher = useMemo(() => {
    // Build keyword set
    const soundKeywords = new Set<string>();
    soundLibrary.forEach((item) => {
      createKeywordsFromFilename(item.name).forEach((kw) => soundKeywords.add(kw));
    });
    const allKeywords = new Set<string>([...soundKeywords, ...observationList]);

    // Filter short/meaningless keywords
    const filteredKeywords = Array.from(allKeywords).filter((kw) => kw.length > 1);

    // Patterns
    const legacyMarker = `��([^��]+)��([^��]+)��`; // legacy mojibake-safe markers
    const bracketSfx = `\\[[^\\[\\]]+\\]`; // [任意内容]
    const bgmMarker = `<([^<>]+)>`; // <BGM>
    const bgmEndMarker = `\\/\\/`; // //

    const fuzzyGroupNames: string[] = [];
    const fuzzyGroupNameToKeyword: Record<string, string> = {};

    const keywordPatterns: string[] = [];

    // Escape keywords and sort by length (longest-first)
    const sortedKeywords = filteredKeywords.sort((a, b) => b.length - a.length);
    for (const kw of sortedKeywords) {
      if (shouldUseLooseSoundKeywordMatch(kw)) {
        const groupName = `k${fuzzyGroupNames.length}`;
        fuzzyGroupNames.push(groupName);
        fuzzyGroupNameToKeyword[groupName] = kw;
        keywordPatterns.push(`(?<${groupName}>${buildLooseSoundKeywordPattern(kw)})`);
      } else {
        keywordPatterns.push(escapeRegExp(kw));
      }
    }

    const parts = [...keywordPatterns, bracketSfx, bgmMarker, bgmEndMarker, legacyMarker].filter(Boolean);
    return {
      regex: new RegExp(parts.join('|'), 'g'),
      fuzzyGroupNames,
      fuzzyGroupNameToKeyword,
    };
  }, [soundLibrary, observationList]);

  const highlightedHtml = useMemo(() => {
    const combinedRegex = combinedMatcher.regex;
    if (!text || !combinedRegex) return escapeHtml(text);

    combinedRegex.lastIndex = 0; // reset global regex

    let lastIndex = 0;
    const parts: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = combinedRegex.exec(text)) !== null) {
      const matchText = match[0];
      const matchIndex = match.index;

      if (matchIndex > lastIndex) {
        parts.push(escapeHtml(text.substring(lastIndex, matchIndex)));
      }

      const isBgm = matchText.startsWith('<') && matchText.endsWith('>');
      const isBgmEnd = matchText === '//';
      const isLegacy = matchText.startsWith('��') && matchText.endsWith('��');
      const isBracket = matchText.startsWith('[') && matchText.endsWith(']');

      const keywordForData = (() => {
        if (isBgm || isLegacy || isBracket) return matchText;
        const groups = match.groups;
        if (!groups) return matchText;
        for (const groupName of combinedMatcher.fuzzyGroupNames) {
          if (groups[groupName] !== undefined) return combinedMatcher.fuzzyGroupNameToKeyword[groupName];
        }
        return matchText;
      })();

      const isIgnored =
        !isBgm &&
        !isBgmEnd &&
        !isLegacy &&
        !isBracket &&
        ignoredKeywords &&
        ignoredKeywords.some((ik) => ik.keyword === keywordForData && ik.index === matchIndex);

      if (isIgnored) {
        parts.push(escapeHtml(matchText));
      } else if (isBgm) {
        const innerRaw = matchText.slice(1, -1);
        const nameMatch = innerRaw.match(/^\s*(?:(?:BGM|[\u266A\u266B])\s*-\s*)?(.+?)\s*$/);
        const name = (nameMatch?.[1] ?? innerRaw).trim();
        const safeName = escapeHtml(name);
        const startOffset = matchIndex + matchText.length;
        parts.push(
          `<strong class="bgm-marker-inline" data-bgm-name="${safeName}" data-index="${matchIndex}" data-bgm-start-offset="${startOffset}">&lt;♫-${safeName}&gt;</strong>`
        );
      } else if (isBgmEnd) {
        parts.push(`<strong class="bgm-marker-inline" data-bgm-end="1" data-index="${matchIndex}">//</strong>`);
      } else if (isLegacy) {
        const title = matchText.slice(1, -1).replace('��', ', ');
        parts.push(`<span class=\"manual-sound-marker\" title=\"音效标记: ${escapeHtml(title)}\">${escapeHtml(matchText)}</span>`);
      } else if (isBracket) {
        const inner = matchText.slice(1, -1);
        parts.push(`<span class=\"sound-keyword-highlight\" data-keyword=\"${escapeHtml(inner)}\" data-index=\"${match.index}\">${escapeHtml(matchText)}</span>`);
      } else {
        parts.push(
          `<span class=\"sound-keyword-highlight\" data-keyword=\"${escapeHtml(keywordForData)}\" data-index=\"${match.index}\">${escapeHtml(matchText)}</span>`
        );
      }

      lastIndex = matchIndex + matchText.length;
    }

    if (lastIndex < text.length) {
      parts.push(escapeHtml(text.substring(lastIndex)));
    }

    return parts.join('');
  }, [text, combinedMatcher, ignoredKeywords]);

  return highlightedHtml;
};
