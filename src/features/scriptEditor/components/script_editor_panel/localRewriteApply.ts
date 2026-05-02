import type { Character, Project, ScriptLine } from '../../../../types';
import {
  normalizeCharacterNameKey,
  sanitizeCharacterDisplayName,
} from '../../../../lib/characterName';

const GENERATED_CHARACTER_COLORS = [
  'bg-gray-500',
  'bg-stone-500',
  'bg-red-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-yellow-500',
  'bg-lime-500',
  'bg-green-500',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-cyan-500',
  'bg-sky-500',
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-purple-500',
  'bg-fuchsia-500',
  'bg-pink-500',
  'bg-rose-500',
];

type GeneratedCharacterPayload = Pick<
  Character,
  'name' | 'color' | 'textColor' | 'cvName' | 'description' | 'isStyleLockedToCv'
>;

export type LocalRewriteAddCharacter = (
  characterToAdd: GeneratedCharacterPayload,
  projectId: string
) => Character;

export interface ApplyLocalRewritePayload {
  chapterId: string;
  mode: LocalCodexScriptRewriteMode;
  summary: string;
  segments: LocalCodexScriptRewriteApplySegment[];
}

export interface PreparedLocalRewriteSegment {
  draftScriptLines: ScriptLine[];
  endLine: number;
  originalBlockCount: number;
  segmentId: string;
  selectedLineIds: string[];
  startLine: number;
}

export interface PreparedLocalRewriteApplication {
  focusLineId: string | null;
  generatedLineCount: number;
  preparedSegments: PreparedLocalRewriteSegment[];
  replacedBlockCount: number;
  replacedSegmentCount: number;
}

const buildGeneratedCharacterPayload = (
  rawName: string,
  colorIndex: number
): GeneratedCharacterPayload => {
  const normalizedName = sanitizeCharacterDisplayName(rawName);
  const isNarrator = normalizedName === 'Narrator';
  const isUnknown = normalizedName === '待识别角色';
  const isSfx = normalizedName === '[音效]' || normalizedName === '音效';

  return {
    name: isSfx ? '[音效]' : normalizedName,
    color: isNarrator
      ? 'bg-slate-600'
      : isUnknown
      ? 'bg-orange-400'
      : isSfx
      ? 'bg-transparent'
      : GENERATED_CHARACTER_COLORS[colorIndex % GENERATED_CHARACTER_COLORS.length],
    textColor: isNarrator
      ? 'text-slate-100'
      : isUnknown
      ? 'text-black'
      : isSfx
      ? 'text-red-500'
      : 'text-white',
    cvName: '',
    description: isSfx ? '用于标记音效的文字描述' : '',
    isStyleLockedToCv: isSfx,
  };
};

const resolveSelectedSegmentRange = (
  scriptLines: ScriptLine[],
  selectedLineIds: string[],
  segmentIndex: number
) => {
  const lineIndexById = new Map(
    scriptLines.map((line, index) => [line.id, index] as const)
  );
  const selectedIndices = selectedLineIds.map((selectedLineId) => {
    const lineIndex = lineIndexById.get(selectedLineId);
    if (typeof lineIndex !== 'number') {
      throw new Error(`第 ${segmentIndex + 1} 段的原始选中块已发生变化。`);
    }
    return lineIndex;
  });
  const sortedIndices = [...selectedIndices].sort((left, right) => left - right);
  const startIndex = sortedIndices[0];
  const endIndex = sortedIndices[sortedIndices.length - 1];

  if (endIndex - startIndex + 1 !== sortedIndices.length) {
    throw new Error(
      `第 ${segmentIndex + 1} 段的原始选中块已不再连续，请重新框选并生成。`
    );
  }

  return { endIndex, startIndex };
};

export const prepareLocalRewriteApplication = ({
  addCharacter,
  characters,
  currentProject,
  payload,
}: {
  addCharacter: LocalRewriteAddCharacter;
  characters: Character[];
  currentProject: Project | null;
  payload: ApplyLocalRewritePayload;
}): PreparedLocalRewriteApplication => {
  if (!currentProject) {
    throw new Error('当前未打开小说，无法应用局部重画结果。');
  }

  const targetChapter = currentProject.chapters.find(
    (chapter) => chapter.id === payload.chapterId
  );
  if (!targetChapter) {
    throw new Error('目标章节不存在，可能已被删除或切换。');
  }

  if (!Array.isArray(payload.segments) || payload.segments.length === 0) {
    throw new Error('当前没有可应用的重画结果。');
  }

  const scopedCharacters = characters.filter(
    (character) =>
      (!character.projectId || character.projectId === currentProject.id) &&
      character.status !== 'merged'
  );
  const characterMap = new Map(
    scopedCharacters.map((character) => [
      normalizeCharacterNameKey(character.name),
      character,
    ])
  );
  const selectedLineIdsSeen = new Set<string>();

  const preparedSegments = payload.segments.map((segment, segmentIndex) => {
    if (
      !Array.isArray(segment.selectedLineIds) ||
      segment.selectedLineIds.length === 0
    ) {
      throw new Error(`第 ${segmentIndex + 1} 段没有可替换的原始脚本块。`);
    }
    if (!Array.isArray(segment.lines) || segment.lines.length === 0) {
      throw new Error(`第 ${segmentIndex + 1} 段没有可应用的重画结果。`);
    }

    segment.selectedLineIds.forEach((selectedLineId) => {
      if (selectedLineIdsSeen.has(selectedLineId)) {
        throw new Error(`第 ${segmentIndex + 1} 段与其他段存在重复选中的脚本块。`);
      }
      selectedLineIdsSeen.add(selectedLineId);
    });

    resolveSelectedSegmentRange(
      targetChapter.scriptLines,
      segment.selectedLineIds,
      segmentIndex
    );

    const draftScriptLines: ScriptLine[] = segment.lines.map((line, lineIndex) => {
      const rawSpeakerName =
        line.kind === 'narration'
          ? 'Narrator'
          : line.kind === 'sfx'
          ? '[音效]'
          : sanitizeCharacterDisplayName(line.speakerName || '待识别角色') ||
            '待识别角色';
      const speakerKey = normalizeCharacterNameKey(rawSpeakerName);
      let character = characterMap.get(speakerKey);

      if (!character) {
        character = addCharacter(
          buildGeneratedCharacterPayload(rawSpeakerName, characterMap.size),
          currentProject.id
        );
        characterMap.set(speakerKey, character);
      }

      return {
        id: `${Date.now()}_line_rewrite_${segmentIndex}_${lineIndex}_${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        text: line.text,
        originalText: line.text,
        characterId: character.id,
        soundType: line.soundType || undefined,
        isAiAudioLoading: false,
        isAiAudioSynced: false,
        isTextModifiedManual: false,
      };
    });

    return {
      draftScriptLines,
      endLine: segment.endLine,
      originalBlockCount: segment.selectedLineIds.length,
      segmentId: segment.segmentId,
      selectedLineIds: [...segment.selectedLineIds],
      startLine: segment.startLine,
    };
  });

  return {
    focusLineId: preparedSegments[0]?.draftScriptLines[0]?.id || null,
    generatedLineCount: preparedSegments.reduce(
      (total, segment) => total + segment.draftScriptLines.length,
      0
    ),
    preparedSegments,
    replacedBlockCount: preparedSegments.reduce(
      (total, segment) => total + segment.originalBlockCount,
      0
    ),
    replacedSegmentCount: preparedSegments.length,
  };
};

export const applyPreparedLocalRewriteSegments = ({
  chapterId,
  preparedSegments,
  project,
}: {
  chapterId: string;
  preparedSegments: PreparedLocalRewriteSegment[];
  project: Project;
}): Project => {
  const targetChapterIndex = project.chapters.findIndex(
    (chapter) => chapter.id === chapterId
  );
  if (targetChapterIndex < 0) {
    return project;
  }

  const currentChapter = project.chapters[targetChapterIndex];
  const resolvedSegments = preparedSegments
    .map((segment, segmentIndex) => ({
      ...segment,
      ...resolveSelectedSegmentRange(
        currentChapter.scriptLines,
        segment.selectedLineIds,
        segmentIndex
      ),
    }))
    .sort((left, right) => right.startIndex - left.startIndex);

  for (let index = 1; index < resolvedSegments.length; index += 1) {
    const previousSegment = resolvedSegments[index - 1];
    const currentSegment = resolvedSegments[index];
    if (currentSegment.endIndex >= previousSegment.startIndex) {
      throw new Error('选中的多个重画段出现重叠，无法直接应用，请重新框选。');
    }
  }

  let nextScriptLines = [...currentChapter.scriptLines];
  resolvedSegments.forEach((segment) => {
    nextScriptLines = [
      ...nextScriptLines.slice(0, segment.startIndex),
      ...segment.draftScriptLines,
      ...nextScriptLines.slice(segment.endIndex + 1),
    ];
  });

  const updatedChapter = {
    ...currentChapter,
    scriptLines: nextScriptLines,
  };
  const nextChapters = [...project.chapters];
  nextChapters[targetChapterIndex] = updatedChapter;
  return { ...project, chapters: nextChapters };
};

export const createRewriteApplyPayloadFromTask = (
  task: LocalCodexScriptRewriteTask
): ApplyLocalRewritePayload => {
  if (!task.result) {
    throw new Error('当前任务还没有可应用的重画结果。');
  }

  const selectionSegments =
    Array.isArray(task.selection.segments) && task.selection.segments.length > 0
      ? task.selection.segments
      : [
          {
            segmentId: 'segment_1',
            startLine: task.selection.startLine,
            endLine: task.selection.endLine,
            contextBefore: task.selection.contextBefore || '',
            contextAfter: task.selection.contextAfter || '',
            blocks: task.selection.blocks,
          },
        ];
  const resultSegments =
    Array.isArray(task.result.segments) && task.result.segments.length > 0
      ? task.result.segments
      : [
          {
            segmentId: selectionSegments[0]?.segmentId || 'segment_1',
            startLine: task.selection.startLine,
            endLine: task.selection.endLine,
            lines: task.result.lines,
          },
        ];

  return {
    chapterId: task.chapterId,
    mode: task.mode,
    summary: task.result.summary,
    segments: selectionSegments.map((selectionSegment, segmentIndex) => {
      const resultSegment =
        resultSegments.find(
          (candidateSegment) =>
            candidateSegment.segmentId === selectionSegment.segmentId
        ) || resultSegments[segmentIndex];

      return {
        segmentId: selectionSegment.segmentId,
        selectedLineIds: selectionSegment.blocks.map((block) => block.lineId),
        startLine: selectionSegment.startLine,
        endLine: selectionSegment.endLine,
        lines: Array.isArray(resultSegment?.lines) ? resultSegment.lines : [],
      };
    }),
  };
};
