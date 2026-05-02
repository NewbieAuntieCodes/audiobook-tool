import type { Character, ScriptLine } from '../../../../types';
import { sanitizeCharacterDisplayName } from '../../../../lib/characterName';

export interface RewriteLineSelectionState {
  anchorLineId: string | null;
  selectedLineIds: string[];
}

const getSpeakerNameForRewriteBlock = (
  line: ScriptLine,
  charactersById: Map<string, Character>
) => {
  const character = line.characterId ? charactersById.get(line.characterId) : null;
  const normalizedName = sanitizeCharacterDisplayName(character?.name || '');

  if (normalizedName === '[音效]' || normalizedName === '音效') {
    return '[音效]';
  }
  if (normalizedName) {
    return normalizedName;
  }

  const trimmedText = (line.text || '').trim();
  if (
    trimmedText.startsWith('“') ||
    trimmedText.startsWith('「') ||
    trimmedText.startsWith('"')
  ) {
    return '待识别角色';
  }
  return 'Narrator';
};

export const buildRewriteSelectionBlock = (
  line: ScriptLine,
  index: number,
  charactersById: Map<string, Character>
): LocalCodexScriptRewriteSelectionBlock => ({
  lineId: line.id,
  index: index + 1,
  speakerName: getSpeakerNameForRewriteBlock(line, charactersById),
  text: line.text || '',
  originalText: line.originalText || line.text || '',
  soundType: line.soundType || '',
});

const formatRewriteBlocksText = (
  blocks: LocalCodexScriptRewriteSelectionBlock[]
) => {
  return blocks
    .map((block) => {
      const speakerLabel =
        block.speakerName === 'Narrator'
          ? '旁白'
          : block.speakerName === '[音效]'
          ? '音效'
          : block.speakerName || '待识别角色';
      const soundTypeSuffix = block.soundType ? ` <${block.soundType}>` : '';
      return `【${speakerLabel}】${block.text}${soundTypeSuffix}`;
    })
    .join('\n');
};

export const buildRewriteSelectionSegments = (
  chapter: { scriptLines: ScriptLine[] } | null,
  selectedLineIdSet: Set<string>,
  charactersById: Map<string, Character>
): LocalCodexScriptRewriteSelectionSegment[] => {
  if (!chapter || selectedLineIdSet.size === 0) {
    return [];
  }

  const segments: LocalCodexScriptRewriteSelectionSegment[] = [];
  let currentBlocks: LocalCodexScriptRewriteSelectionBlock[] = [];

  const flushCurrentSegment = () => {
    if (currentBlocks.length === 0) {
      return;
    }

    const startIndex = currentBlocks[0].index - 1;
    const endIndex = currentBlocks[currentBlocks.length - 1].index - 1;
    const beforeBlocks = chapter.scriptLines
      .slice(Math.max(0, startIndex - 2), startIndex)
      .map((line, offset, lines) =>
        buildRewriteSelectionBlock(
          line,
          startIndex - lines.length + offset,
          charactersById
        )
      );
    const afterBlocks = chapter.scriptLines
      .slice(endIndex + 1, Math.min(chapter.scriptLines.length, endIndex + 3))
      .map((line, offset) =>
        buildRewriteSelectionBlock(line, endIndex + 1 + offset, charactersById)
      );

    segments.push({
      segmentId: `segment_${segments.length + 1}`,
      startLine: currentBlocks[0].index,
      endLine: currentBlocks[currentBlocks.length - 1].index,
      contextBefore: formatRewriteBlocksText(beforeBlocks),
      contextAfter: formatRewriteBlocksText(afterBlocks),
      blocks: currentBlocks,
    });
    currentBlocks = [];
  };

  chapter.scriptLines.forEach((line, index) => {
    if (selectedLineIdSet.has(line.id)) {
      currentBlocks.push(buildRewriteSelectionBlock(line, index, charactersById));
      return;
    }
    flushCurrentSegment();
  });
  flushCurrentSegment();

  return segments;
};

const orderSelectedLineIdsByScriptOrder = (
  lines: ScriptLine[],
  selectedLineIdSet: Set<string>
) =>
  lines
    .filter((line) => selectedLineIdSet.has(line.id))
    .map((line) => line.id);

export const updateRewriteLineSelection = ({
  lines,
  lineId,
  selectedLineIds,
  anchorLineId,
  shiftKey,
  toggleSelection,
}: {
  lines: ScriptLine[];
  lineId: string;
  selectedLineIds: string[];
  anchorLineId: string | null;
  shiftKey: boolean;
  toggleSelection: boolean;
}): RewriteLineSelectionState => {
  const clickedIndex = lines.findIndex((line) => line.id === lineId);
  if (clickedIndex < 0) {
    return { anchorLineId, selectedLineIds };
  }

  if (shiftKey && anchorLineId) {
    const anchorIndex = lines.findIndex((line) => line.id === anchorLineId);
    if (anchorIndex >= 0) {
      const startIndex = Math.min(anchorIndex, clickedIndex);
      const endIndex = Math.max(anchorIndex, clickedIndex);
      const rangeLineIds = lines
        .slice(startIndex, endIndex + 1)
        .map((line) => line.id);

      if (!toggleSelection) {
        return {
          anchorLineId: lineId,
          selectedLineIds: rangeLineIds,
        };
      }

      const nextSelectedLineIdSet = new Set(selectedLineIds);
      rangeLineIds.forEach((selectedLineId) => {
        nextSelectedLineIdSet.add(selectedLineId);
      });

      return {
        anchorLineId: lineId,
        selectedLineIds: orderSelectedLineIdsByScriptOrder(lines, nextSelectedLineIdSet),
      };
    }
  }

  if (toggleSelection) {
    const nextSelectedLineIdSet = new Set(selectedLineIds);
    if (nextSelectedLineIdSet.has(lineId)) {
      nextSelectedLineIdSet.delete(lineId);
    } else {
      nextSelectedLineIdSet.add(lineId);
    }

    return {
      anchorLineId:
        nextSelectedLineIdSet.size === 0 ||
        (selectedLineIds.includes(lineId) && selectedLineIds.length === 1)
          ? null
          : lineId,
      selectedLineIds: orderSelectedLineIdsByScriptOrder(lines, nextSelectedLineIdSet),
    };
  }

  return {
    anchorLineId: lineId,
    selectedLineIds: [lineId],
  };
};
