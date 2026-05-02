import type { Character } from '../../../../types';

export const normalizeSpeakerLabel = (speakerName: string) => {
  const trimmed = String(speakerName || '').trim();
  if (!trimmed || trimmed === 'Narrator') return '旁白';
  if (trimmed === '[音效]' || trimmed === '音效') return '音效';
  return trimmed;
};

export const buildSelectionTextFromBlocks = (
  blocks: LocalCodexScriptRewriteSelectionBlock[]
) => {
  return blocks
    .map((block) => {
      const speakerLabel = normalizeSpeakerLabel(block.speakerName);
      const suffix = block.soundType ? ` <${block.soundType}>` : '';
      return `【${speakerLabel}】${block.text}${suffix}`;
    })
    .join('\n');
};

export const buildSelectionTextFromSegments = (
  segments: LocalCodexScriptRewriteSelectionSegment[]
) => {
  return segments
    .map((segment, index) => {
      return [
        `【选区${index + 1}｜第 ${segment.startLine}-${segment.endLine} 块】`,
        buildSelectionTextFromBlocks(segment.blocks),
      ].join('\n');
    })
    .join('\n\n');
};

export const normalizePreviewSegments = (
  selectedSegments: LocalCodexScriptRewriteSelectionSegment[],
  result: {
    lines?: LocalCodexScriptRewriteLine[];
    segments?: LocalCodexScriptRewriteResultSegment[];
  }
) => {
  if (Array.isArray(result.segments) && result.segments.length > 0) {
    return result.segments;
  }

  if (
    selectedSegments.length === 1 &&
    Array.isArray(result.lines) &&
    result.lines.length > 0
  ) {
    return [
      {
        segmentId: selectedSegments[0].segmentId,
        startLine: selectedSegments[0].startLine,
        endLine: selectedSegments[0].endLine,
        lines: result.lines,
      },
    ];
  }

  return [];
};

export const countSegmentLines = (
  segments: Array<{ lines: LocalCodexScriptRewriteLine[] }>
) => {
  return segments.reduce((total, segment) => total + segment.lines.length, 0);
};

const normalizeComparableText = (value: string) =>
  String(value || '').replace(/\s+/g, '').trim();

export const didPreviewChangeSelection = ({
  previewSegments,
  selectedSegments,
}: {
  previewSegments: LocalCodexScriptRewriteResultSegment[];
  selectedSegments: LocalCodexScriptRewriteSelectionSegment[];
}) => {
  if (previewSegments.length !== selectedSegments.length) {
    return true;
  }

  return selectedSegments.some((selectedSegment, segmentIndex) => {
    const previewSegment =
      previewSegments.find(
        (candidate) => candidate.segmentId === selectedSegment.segmentId
      ) || previewSegments[segmentIndex];
    if (!previewSegment) return true;
    if (previewSegment.lines.length !== selectedSegment.blocks.length) {
      return true;
    }

    return selectedSegment.blocks.some((block, blockIndex) => {
      const previewLine = previewSegment.lines[blockIndex];
      if (!previewLine) return true;
      const expectedSpeaker = normalizeSpeakerLabel(block.speakerName);
      const actualSpeaker = normalizeSpeakerLabel(previewLine.speakerName);
      return (
        expectedSpeaker !== actualSpeaker ||
        normalizeComparableText(block.text) !== normalizeComparableText(previewLine.text) ||
        String(block.soundType || '').trim() !== String(previewLine.soundType || '').trim()
      );
    });
  });
};

export const buildRewriteKnownCharacters = (
  characters: Character[],
  projectId: string
) => {
  return characters
    .filter(
      (character) =>
        (!character.projectId || character.projectId === projectId) &&
        character.status !== 'merged'
    )
    .map((character) => ({
      name: character.name,
      cvName: character.cvName || '',
    }));
};

export const buildRewriteSelectionPayload = ({
  blocks,
  endLine,
  selectedSegments,
  selectedText,
  startLine,
}: {
  blocks: LocalCodexScriptRewriteSelectionBlock[];
  endLine: number;
  selectedSegments: LocalCodexScriptRewriteSelectionSegment[];
  selectedText: string;
  startLine: number;
}) => ({
  text: selectedText,
  startLine,
  endLine,
  contextBefore: selectedSegments[0]?.contextBefore || '',
  contextAfter: selectedSegments[selectedSegments.length - 1]?.contextAfter || '',
  blocks,
  segments: selectedSegments,
});

export const buildApplyRewriteSegments = ({
  previewSegments,
  selectedSegments,
}: {
  previewSegments: LocalCodexScriptRewriteResultSegment[];
  selectedSegments: LocalCodexScriptRewriteSelectionSegment[];
}) => {
  return selectedSegments.map((segment, index) => {
    const matchedSegment =
      previewSegments.find(
        (previewSegment) => previewSegment.segmentId === segment.segmentId
      ) || previewSegments[index];

    return {
      segmentId: segment.segmentId,
      selectedLineIds: segment.blocks.map((block) => block.lineId),
      startLine: segment.startLine,
      endLine: segment.endLine,
      lines: Array.isArray(matchedSegment?.lines) ? matchedSegment.lines : [],
    };
  });
};
