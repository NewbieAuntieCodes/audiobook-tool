import type { Project, ScriptLine, TextMarker } from '../../../types';

export interface LineOffset {
  lineId: string;
  offset: number;
}

const SFX_REGEX = /[\[\uFF3B\u3010\u3014][^\]\uFF3D\u3011\u3015]+[\]\uFF3D\u3011\u3015]/g;
const BGM_REGEX = /<\s*(?:(?:\?-|[\u266A\u266B])\s*-\s*)?([^<>]*?)\s*>/g;
const END_REGEX = /\/\/+\s*/g;

const cloneProject = (project: Project): Project =>
  JSON.parse(JSON.stringify(project)) as Project;

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findScriptLineById = (
  project: Project,
  lineId: string
): ScriptLine | null => {
  for (const chapter of project.chapters) {
    const line = chapter.scriptLines.find((candidate) => candidate.id === lineId);
    if (line) {
      return line;
    }
  }
  return null;
};

const createLineOrderMap = (project: Project) => {
  const orderMap = new Map<string, number>();
  project.chapters.forEach((chapter, chapterIndex) => {
    chapter.scriptLines.forEach((line, lineIndex) => {
      orderMap.set(line.id, chapterIndex * 1e6 + lineIndex);
    });
  });
  return orderMap;
};

const resolveSelectionBounds = (
  project: Project,
  range: Range
): { first: LineOffset; last: LineOffset; orderMap: Map<string, number> } | null => {
  const start = findLineIdAndOffset(range.startContainer, range.startOffset);
  const end = findLineIdAndOffset(range.endContainer, range.endOffset);
  if (!start || !end) {
    return null;
  }

  const orderMap = createLineOrderMap(project);
  const startKey = orderMap.get(start.lineId) ?? 0;
  const endKey = orderMap.get(end.lineId) ?? 0;

  return {
    first: startKey <= endKey ? start : end,
    last: startKey <= endKey ? end : start,
    orderMap,
  };
};

const intersectsSelection = ({
  first,
  last,
  marker,
  orderMap,
}: {
  first: LineOffset;
  last: LineOffset;
  marker: TextMarker;
  orderMap: Map<string, number>;
}) => {
  const keyOf = (lineId: string, offset: number) =>
    (orderMap.get(lineId) ?? 0) * 1e4 + offset;

  const selectionStart = keyOf(first.lineId, first.offset);
  const selectionEnd = keyOf(last.lineId, last.offset);
  const markerStart = keyOf(marker.startLineId!, marker.startOffset ?? 0);
  const markerEnd = keyOf(marker.endLineId!, marker.endOffset ?? 0);

  const minSelection = Math.min(selectionStart, selectionEnd);
  const maxSelection = Math.max(selectionStart, selectionEnd);
  const minMarker = Math.min(markerStart, markerEnd);
  const maxMarker = Math.max(markerStart, markerEnd);

  return !(maxMarker <= minSelection || minMarker >= maxSelection);
};

export const findLineIdAndOffset = (
  container: Node,
  offset: number
): LineOffset | null => {
  const lineElement = (
    container.nodeType === Node.ELEMENT_NODE
      ? (container as Element)
      : (container.parentElement as Element | null)
  )?.closest('[data-line-id]');

  if (!lineElement) return null;
  const lineId = lineElement.getAttribute('data-line-id');
  if (!lineId) return null;

  const paragraphElement = lineElement.querySelector('p');
  if (!paragraphElement) return null;

  const range = document.createRange();
  range.selectNodeContents(paragraphElement);
  try {
    range.setEnd(container, offset);
  } catch (_) {
    // Ignore invalid DOM endpoints and fall back to the full paragraph length.
  }

  return { lineId, offset: range.toString().length };
};

export const createKeywordsFromFilename = (filename: string): string[] => {
  const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename;
  return nameWithoutExt
    .split(/[_ \-()]/)
    .map((segment) => segment.trim())
    .filter((segment) => segment && !/^\d+$/.test(segment));
};

export const clearFormattingInProject = ({
  project,
  range,
  soundLibraryItems,
  soundObservationList,
}: {
  project: Project;
  range: Range;
  soundLibraryItems: Array<{ name: string }>;
  soundObservationList: string[];
}): Project | null => {
  const selection = resolveSelectionBounds(project, range);
  if (!selection) {
    return null;
  }

  const { first, last, orderMap } = selection;
  const projectClone = cloneProject(project);
  let projectWasModified = false;

  const allKeywords = new Set<string>(soundObservationList);
  soundLibraryItems.forEach((item) => {
    createKeywordsFromFilename(item.name).forEach((keyword) => {
      allKeywords.add(keyword);
    });
  });
  const sortedKeywords = Array.from(allKeywords)
    .filter((keyword) => keyword.length > 1)
    .sort((left, right) => right.length - left.length)
    .map((keyword) => escapeRegExp(keyword));
  const keywordsRegex =
    sortedKeywords.length > 0
      ? new RegExp(`(${sortedKeywords.join('|')})`, 'g')
      : null;

  const lineOrder = [...orderMap.entries()]
    .sort((left, right) => left[1] - right[1])
    .map(([lineId]) => lineId);
  const firstIndex = lineOrder.indexOf(first.lineId);
  const lastIndex = lineOrder.indexOf(last.lineId);
  const affectedLineIds = new Set<string>();
  if (firstIndex !== -1 && lastIndex !== -1) {
    for (let index = firstIndex; index <= lastIndex; index += 1) {
      affectedLineIds.add(lineOrder[index]);
    }
  }

  projectClone.chapters.forEach((chapter) => {
    chapter.scriptLines.forEach((line) => {
      if (!affectedLineIds.has(line.id)) return;

      const originalText = line.text || '';
      const isFirst = line.id === first.lineId;
      const isLast = line.id === last.lineId;
      const isCollapsed = isFirst && isLast && first.offset === last.offset;
      const selectionStart = isFirst ? first.offset : 0;
      const selectionEnd = isLast ? last.offset : originalText.length;

      if (keywordsRegex) {
        keywordsRegex.lastIndex = 0;
        let keywordMatch: RegExpExecArray | null;
        while ((keywordMatch = keywordsRegex.exec(originalText))) {
          const keyword = keywordMatch[0];
          const keywordIndex = keywordMatch.index;
          const keywordEnd = keywordIndex + keyword.length;

          let overlap = 0;
          if (isCollapsed) {
            if (keywordIndex < selectionStart && keywordEnd > selectionStart) {
              overlap = 1;
            }
          } else {
            overlap = Math.max(
              0,
              Math.min(keywordEnd, selectionEnd) -
                Math.max(keywordIndex, selectionStart)
            );
          }

          if (overlap <= 0) {
            continue;
          }

          line.ignoredSoundKeywords = line.ignoredSoundKeywords || [];
          if (
            !line.ignoredSoundKeywords.some(
              (item) => item.keyword === keyword && item.index === keywordIndex
            )
          ) {
            line.ignoredSoundKeywords.push({ keyword, index: keywordIndex });
            projectWasModified = true;
          }
        }
      }

      const spansToRemove: Array<{ from: number; to: number }> = [];
      const collectOverlappingSpans = (regex: RegExp) => {
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(originalText))) {
          const from = match.index;
          const to = from + match[0].length;

          let overlap = 0;
          if (isCollapsed) {
            if (from < selectionStart && to > selectionStart) {
              overlap = 1;
            }
          } else {
            overlap = Math.max(
              0,
              Math.min(to, selectionEnd) - Math.max(from, selectionStart)
            );
          }

          if (overlap > 0) {
            spansToRemove.push({ from, to });
          }
        }
      };

      collectOverlappingSpans(SFX_REGEX);
      collectOverlappingSpans(BGM_REGEX);
      collectOverlappingSpans(END_REGEX);

      if (spansToRemove.length === 0) {
        return;
      }

      spansToRemove.sort((left, right) => right.from - left.from);
      let currentText = originalText;
      spansToRemove.forEach((span) => {
        currentText = currentText.slice(0, span.from) + currentText.slice(span.to);
      });

      if (currentText !== originalText) {
        line.text = currentText;
        projectWasModified = true;
      }
    });
  });

  const originalMarkerCount = (projectClone.textMarkers || []).length;
  projectClone.textMarkers = (projectClone.textMarkers || []).filter((marker) => {
    if (
      (marker.type !== 'scene' && marker.type !== 'bgm') ||
      !marker.startLineId ||
      !marker.endLineId
    ) {
      return true;
    }

    return !intersectsSelection({
      first,
      last,
      marker,
      orderMap,
    });
  });
  if (originalMarkerCount !== projectClone.textMarkers.length) {
    projectWasModified = true;
  }

  return projectWasModified ? projectClone : project;
};

export const applyBgmWithEndMarkerToProject = ({
  bgmName,
  project,
  range,
}: {
  bgmName: string;
  project: Project;
  range: Range;
}): Project => {
  const name = bgmName.trim();
  if (!name) {
    throw new Error('请输入背景音乐（BGM）名称或标识');
  }

  const startResult = findLineIdAndOffset(range.startContainer, range.startOffset);
  const endResult = findLineIdAndOffset(range.endContainer, range.endOffset);

  console.log('[BGM] handleSaveBgmWithEndMarker selection', {
    name,
    hasSelection: true,
    collapsed: range.collapsed,
    startResult,
    endResult,
  });

  if (range.collapsed) {
    if (!startResult) {
      throw new Error('无法确定 BGM 起始位置，请重新点击或框选。');
    }

    const projectClone = cloneProject(project);
    const lineRef = findScriptLineById(projectClone, startResult.lineId);
    if (!lineRef) {
      throw new Error('找不到目标文本行，请重试。');
    }

    const originalText = lineRef.text || '';
    const bracketedText = `<${name}>`;
    const newText =
      originalText.slice(0, startResult.offset) +
      bracketedText +
      originalText.slice(startResult.offset);
    lineRef.text = newText;

    console.log('[BGM] handleSaveBgmWithEndMarker (collapsed, start only)', {
      lineId: startResult.lineId,
      offset: startResult.offset,
      before: originalText,
      after: newText,
    });

    return projectClone;
  }

  if (!startResult || !endResult) {
    throw new Error('无法确定所选文本的起止位置，请重新选择。');
  }

  const projectClone = cloneProject(project);
  const bracketedText = `<${name}>`;
  const endMarker = '//';
  const startLineRef = findScriptLineById(projectClone, startResult.lineId);
  const endLineRef = findScriptLineById(projectClone, endResult.lineId);

  if (!startLineRef || !endLineRef) {
    throw new Error('找不到目标文本行，请重新选择后再试。');
  }

  let newMarker: TextMarker;
  if (startResult.lineId === endResult.lineId) {
    const originalText = startLineRef.text || '';
    const startOffset = Math.min(startResult.offset, endResult.offset);
    const endOffset = Math.max(startResult.offset, endResult.offset);
    const before = originalText.slice(0, startOffset);
    const middle = originalText.slice(startOffset, endOffset);
    const after = originalText.slice(endOffset);
    const newText = before + bracketedText + middle + endMarker + after;

    newMarker = {
      id: `bgm_${Date.now()}`,
      type: 'bgm',
      name,
      startLineId: startResult.lineId,
      startOffset: before.length + bracketedText.length,
      endLineId: endResult.lineId,
      endOffset: before.length + bracketedText.length + middle.length,
    };

    startLineRef.text = newText;

    console.log('[BGM] handleSaveBgmWithEndMarker update (single line)', {
      marker: newMarker,
      lineId: startResult.lineId,
      selectionStart: startOffset,
      selectionEnd: endOffset,
      before: originalText,
      after: newText,
    });
  } else {
    const startOriginalText = startLineRef.text || '';
    const endOriginalText = endLineRef.text || '';
    const startBefore = startOriginalText.slice(0, startResult.offset);
    const startAfter = startOriginalText.slice(startResult.offset);
    const endBefore = endOriginalText.slice(0, endResult.offset);
    const endAfter = endOriginalText.slice(endResult.offset);
    const newStartText = startBefore + bracketedText + startAfter;
    const newEndText = endBefore + endMarker + endAfter;

    newMarker = {
      id: `bgm_${Date.now()}`,
      type: 'bgm',
      name,
      startLineId: startResult.lineId,
      startOffset: startBefore.length + bracketedText.length,
      endLineId: endResult.lineId,
      endOffset: endBefore.length,
    };

    startLineRef.text = newStartText;
    endLineRef.text = newEndText;

    console.log('[BGM] handleSaveBgmWithEndMarker update (multi line)', {
      marker: newMarker,
      startLineId: startResult.lineId,
      endLineId: endResult.lineId,
      startOffset: startResult.offset,
      endOffset: endResult.offset,
      startBefore,
      startAfter,
      endBefore,
      endAfter,
    });
  }

  projectClone.textMarkers = [...(projectClone.textMarkers || []), newMarker];
  return projectClone;
};

export const applySfxToProject = ({
  project,
  range,
  rawSfxText,
}: {
  project: Project;
  range: Range;
  rawSfxText: string;
}): Project => {
  const sfx = rawSfxText.trim();
  if (!sfx) {
    throw new Error('请输入音效文本。');
  }

  const bracketedText =
    sfx.startsWith('[') && sfx.endsWith(']') ? sfx : `[${sfx}]`;
  const startResult = findLineIdAndOffset(range.startContainer, range.startOffset);
  const endResult = findLineIdAndOffset(range.endContainer, range.endOffset);

  if (!startResult) {
    throw new Error('无法确定插入位置，请重新在文本中点击或选择。');
  }

  const projectClone = cloneProject(project);
  const lineRef = findScriptLineById(projectClone, startResult.lineId);
  if (!lineRef) {
    throw new Error('找不到目标文本行，请重试。');
  }

  const originalText = lineRef.text || '';
  let newText = originalText;
  if (!range.collapsed && endResult && endResult.lineId === startResult.lineId) {
    const startOffset = Math.min(startResult.offset, endResult.offset);
    const endOffset = Math.max(startResult.offset, endResult.offset);
    newText =
      originalText.slice(0, startOffset) +
      bracketedText +
      originalText.slice(endOffset);
  } else {
    newText =
      originalText.slice(0, startResult.offset) +
      bracketedText +
      originalText.slice(startResult.offset);
  }

  lineRef.text = newText;
  return projectClone;
};
