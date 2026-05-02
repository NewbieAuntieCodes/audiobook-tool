import { Character, Project } from '../../../types';
import useStore from '../../../store/useStore';
import {
  normalizeCharacterNameKey,
  sanitizeCharacterDisplayName,
} from '../../../lib/characterName';

export interface CodexSyncAssignment {
  lineId: string;
  characterName: string;
  cvName?: string;
}

export interface ActiveChapterSnapshotLine {
  lineId: string;
  index: number;
  text: string;
  originalText: string;
  isDialogue: boolean;
  currentCharacterName: string;
}

export interface ActiveChapterSnapshotCharacter {
  id: string;
  name: string;
  cvName: string;
  description: string;
}

export interface ActiveChapterSnapshot {
  projectId: string;
  projectName: string;
  chapterId: string;
  chapterTitle: string;
  lineCount: number;
  knownCharacters: ActiveChapterSnapshotCharacter[];
  lines: ActiveChapterSnapshotLine[];
}

export interface ChapterSnapshotCollectionItem {
  chapterId: string;
  chapterTitle: string;
  chapterIndex: number;
  lineCount: number;
  lines: ActiveChapterSnapshotLine[];
}

export interface ChapterSnapshotsCollection {
  projectId: string;
  projectName: string;
  selectedChapterId: string | null;
  multiSelectedChapterIds: string[];
  requestedChapterCount: number;
  returnedChapterCount: number;
  knownCharacters: ActiveChapterSnapshotCharacter[];
  chapters: ChapterSnapshotCollectionItem[];
}

export interface GetChapterSnapshotsInput {
  projectId?: string;
  chapterId?: string;
  chapterIds?: string[];
  count?: number;
}

export interface ApplyCodexAssignmentsInput {
  projectId: string;
  chapterId: string;
  assignments: CodexSyncAssignment[];
}

export interface ApplyCodexAssignmentsResult {
  projectId: string;
  chapterId: string;
  chapterTitle: string;
  totalAssignments: number;
  updatedLineCount: number;
  createdCharacterCount: number;
  updatedCharacterCvCount: number;
}

export interface ApplyCodexAssignmentsBatchChapterInput {
  chapterId: string;
  assignments: CodexSyncAssignment[];
}

export interface ApplyCodexAssignmentsBatchInput {
  projectId: string;
  chapters: ApplyCodexAssignmentsBatchChapterInput[];
}

export interface ApplyCodexAssignmentsBatchChapterResult {
  chapterId: string;
  chapterTitle: string;
  totalAssignments: number;
  updatedLineCount: number;
}

export interface ApplyCodexAssignmentsBatchResult {
  projectId: string;
  processedChapterCount: number;
  updatedChapterCount: number;
  totalAssignments: number;
  updatedLineCount: number;
  createdCharacterCount: number;
  updatedCharacterCvCount: number;
  chapters: ApplyCodexAssignmentsBatchChapterResult[];
}

const DEFAULT_CV_STYLE = {
  bgColor: 'bg-slate-700',
  textColor: 'text-slate-300',
};

function getCharacterStyle(displayName: string, colorSeed: number) {
  if (displayName === 'Narrator') {
    return { color: 'bg-slate-600', textColor: 'text-slate-100' };
  }

  if (displayName === '待识别角色') {
    return { color: 'bg-orange-400', textColor: 'text-black' };
  }

  const availableColors = [
    'bg-red-500',
    'bg-blue-500',
    'bg-green-500',
    'bg-yellow-400',
    'bg-purple-600',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-teal-500',
  ];
  const availableTextColors = [
    'text-red-100',
    'text-blue-100',
    'text-green-100',
    'text-yellow-800',
    'text-purple-100',
    'text-pink-100',
    'text-indigo-100',
    'text-teal-100',
  ];
  const colorIndex = colorSeed % availableColors.length;

  return {
    color: availableColors[colorIndex],
    textColor: availableTextColors[colorIndex],
  };
}

function getProjectFromStore(projectId?: string) {
  const state = useStore.getState();
  const availableProjects = Array.isArray(state.projects) ? state.projects : [];
  const resolvedProjectId =
    projectId ||
    state.selectedProjectId ||
    (availableProjects.length === 1 ? availableProjects[0].id : undefined);
  if (!resolvedProjectId) {
    const preview = availableProjects
      .slice(0, 12)
      .map((project) => `${project.name}(${project.id})`)
      .join('，');
    throw new Error(
      `当前没有选中的项目。可用项目: ${preview || '无'}`
    );
  }

  const project = state.projects.find((item) => item.id === resolvedProjectId);
  if (!project) {
    throw new Error(`未找到项目: ${resolvedProjectId}`);
  }

  return { state, project };
}

function getPreferredSelectedChapterId(project: Project, state = useStore.getState()) {
  const candidates = [
    state.selectedProjectId === project.id ? state.selectedChapterId : undefined,
    project.lastViewedChapterId,
    project.chapters[0]?.id,
  ].filter((value): value is string => typeof value === 'string' && value.trim() !== '');

  return (
    candidates.find((candidate) => project.chapters.some((chapter) => chapter.id === candidate)) ||
    null
  );
}

function getPreferredMultiSelectedChapterIds(project: Project, state = useStore.getState()) {
  const selectedIds = Array.isArray(state.scriptEditorMultiSelectedChapterIds)
    ? state.scriptEditorMultiSelectedChapterIds
        .map((chapterId) => (typeof chapterId === 'string' ? chapterId.trim() : ''))
        .filter((chapterId): chapterId is string => chapterId.length > 0)
    : [];

  if (selectedIds.length === 0) {
    return [];
  }

  const selectedSet = new Set(selectedIds);
  return project.chapters
    .filter((chapter) => selectedSet.has(chapter.id))
    .map((chapter) => chapter.id);
}

function buildKnownCharacters(projectId: string): ActiveChapterSnapshotCharacter[] {
  return useStore
    .getState()
    .characters
    .filter(
      (character) =>
        (!character.projectId || character.projectId === projectId) &&
        character.status !== 'merged'
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
    .map((character) => ({
      id: character.id,
      name: character.name,
      cvName: character.cvName || '',
      description: character.description || '',
    }));
}

function toSnapshotChapter(
  project: Project,
  chapter: Project['chapters'][number],
  chapterIndex: number,
  knownCharacters: ActiveChapterSnapshotCharacter[],
): ChapterSnapshotCollectionItem {
  const characterNameById = new Map(
    knownCharacters.map((character) => [character.id, character.name] as const)
  );

  return {
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    chapterIndex,
    lineCount: chapter.scriptLines.length,
    lines: chapter.scriptLines.map((line, index) => {
      const text = String(line.text || '').trim();
      const originalText = String(line.originalText || '').trim();
      const isDialogue =
        (/^[“"「『].*[”"」』]$/.test(text) && !!originalText) ||
        (/^[“"「『]/.test(text) && originalText !== text);

      return {
        lineId: line.id,
        index,
        text,
        originalText,
        isDialogue,
        currentCharacterName: line.characterId ? characterNameById.get(line.characterId) || '' : '',
      };
    }),
  };
}

function resolveRequestedChapterCount(input: GetChapterSnapshotsInput) {
  if (Array.isArray(input.chapterIds) && input.chapterIds.length > 0) {
    return input.chapterIds.filter(
      (chapterId): chapterId is string =>
        typeof chapterId === 'string' && chapterId.trim() !== ''
    ).length;
  }

  if (Number.isInteger(input.count) && Number(input.count) > 0) {
    return Number(input.count);
  }

  return 1;
}

function resolveTargetChapters(project: Project, input: GetChapterSnapshotsInput) {
  const requestedChapterIds = Array.isArray(input.chapterIds)
    ? Array.from(
        new Set(
          input.chapterIds
            .map((chapterId) => (typeof chapterId === 'string' ? chapterId.trim() : ''))
            .filter(Boolean)
        )
      )
    : [];

  if (requestedChapterIds.length > 0) {
    return requestedChapterIds.map((chapterId) => {
      const chapterIndex = project.chapters.findIndex((chapter) => chapter.id === chapterId);
      if (chapterIndex === -1) {
        throw new Error(`未找到章节: ${chapterId}`);
      }

      return {
        chapter: project.chapters[chapterIndex],
        chapterIndex: chapterIndex + 1,
      };
    });
  }

  const preferredMultiSelectedChapterIds =
    typeof input.chapterId === 'string' && input.chapterId.trim()
      ? []
      : getPreferredMultiSelectedChapterIds(project);

  if (preferredMultiSelectedChapterIds.length > 0) {
    return preferredMultiSelectedChapterIds.map((chapterId) => {
      const chapterIndex = project.chapters.findIndex((chapter) => chapter.id === chapterId);
      if (chapterIndex === -1) {
        throw new Error(`未找到章节: ${chapterId}`);
      }

      return {
        chapter: project.chapters[chapterIndex],
        chapterIndex: chapterIndex + 1,
      };
    });
  }

  const selectedChapterId =
    (typeof input.chapterId === 'string' && input.chapterId.trim()) ||
    getPreferredSelectedChapterId(project);

  if (!selectedChapterId) {
    throw new Error('当前没有可读取的章节。');
  }

  const startIndex = project.chapters.findIndex((chapter) => chapter.id === selectedChapterId);
  if (startIndex === -1) {
    throw new Error(`未找到章节: ${selectedChapterId}`);
  }

  const requestedCount = Math.max(1, resolveRequestedChapterCount(input));
  const chapters = [];

  for (
    let chapterIndex = startIndex;
    chapterIndex < project.chapters.length && chapters.length < requestedCount;
    chapterIndex += 1
  ) {
    chapters.push({
      chapter: project.chapters[chapterIndex],
      chapterIndex: chapterIndex + 1,
    });
  }

  return chapters;
}

export function getChapterSnapshotsFromStore(
  input: GetChapterSnapshotsInput = {}
): ChapterSnapshotsCollection {
  const { state, project } = getProjectFromStore(input.projectId);
  const knownCharacters = buildKnownCharacters(project.id);
  const selectedChapterId = getPreferredSelectedChapterId(project, state);
  const multiSelectedChapterIds = getPreferredMultiSelectedChapterIds(project, state);
  const targetChapters = resolveTargetChapters(project, input);

  return {
    projectId: project.id,
    projectName: project.name,
    selectedChapterId,
    multiSelectedChapterIds,
    requestedChapterCount: resolveRequestedChapterCount(input),
    returnedChapterCount: targetChapters.length,
    knownCharacters,
    chapters: targetChapters.map(({ chapter, chapterIndex }) =>
      toSnapshotChapter(project, chapter, chapterIndex, knownCharacters)
    ),
  };
}

export function getActiveChapterSnapshotFromStore(input?: {
  projectId?: string;
  chapterId?: string;
}): ActiveChapterSnapshot {
  const collection = getChapterSnapshotsFromStore({
    projectId: input?.projectId,
    chapterId: input?.chapterId,
    count: 1,
  });
  const chapter = collection.chapters[0];

  if (!chapter) {
    throw new Error('当前没有可读取的章节。');
  }

  return {
    projectId: collection.projectId,
    projectName: collection.projectName,
    chapterId: chapter.chapterId,
    chapterTitle: chapter.chapterTitle,
    lineCount: chapter.lineCount,
    knownCharacters: collection.knownCharacters,
    lines: chapter.lines,
  };
}

function resolveCharacterForAssignment(
  project: Project,
  rawCharacterName: string,
  cvName: string | undefined,
  newCharacterMap: Map<string, Character>,
  createdCharacterIds: Set<string>,
): Character {
  const displayName = sanitizeCharacterDisplayName(rawCharacterName) || '待识别角色';
  const key = normalizeCharacterNameKey(displayName);

  const cached = newCharacterMap.get(key);
  if (cached) {
    return cached;
  }

  const state = useStore.getState();
  const existing = state.characters.find(
    (character) =>
      normalizeCharacterNameKey(character.name) === key &&
      (!character.projectId || character.projectId === project.id) &&
      character.status !== 'merged'
  );

  if (existing) {
    newCharacterMap.set(key, existing);
    return existing;
  }

  const style = getCharacterStyle(displayName, newCharacterMap.size);
  const created = state.addCharacter(
    {
      name: displayName,
      color: style.color,
      textColor: style.textColor,
      cvName: cvName || '',
      description: '',
      isStyleLockedToCv: false,
    },
    project.id
  );

  newCharacterMap.set(key, created);
  createdCharacterIds.add(created.id);
  return created;
}

export async function applyCodexAssignmentsBatchToStore(
  input: ApplyCodexAssignmentsBatchInput
): Promise<ApplyCodexAssignmentsBatchResult> {
  const state = useStore.getState();
  const project = state.projects.find((item) => item.id === input.projectId);
  if (!project) {
    throw new Error(`未找到项目: ${input.projectId}`);
  }

  const chapterAssignments = new Map<string, Map<string, CodexSyncAssignment>>();
  const chapterInputOrder: string[] = [];

  for (const chapterInput of input.chapters || []) {
    if (!chapterInput?.chapterId) continue;

    let assignmentMap = chapterAssignments.get(chapterInput.chapterId);
    if (!assignmentMap) {
      assignmentMap = new Map<string, CodexSyncAssignment>();
      chapterAssignments.set(chapterInput.chapterId, assignmentMap);
      chapterInputOrder.push(chapterInput.chapterId);
    }

    for (const assignment of chapterInput.assignments || []) {
      if (!assignment?.lineId) continue;
      assignmentMap.set(assignment.lineId, assignment);
    }
  }

  if (chapterAssignments.size === 0) {
    throw new Error('未提供可用的章节 assignments。');
  }

  for (const chapterId of chapterAssignments.keys()) {
    if (!project.chapters.some((chapter) => chapter.id === chapterId)) {
      throw new Error(`未找到章节: ${chapterId}`);
    }
  }

  const newCharacterMap = new Map<string, Character>();
  const createdCharacterIds = new Set<string>();
  const charactersWithCvToUpdate = new Map<string, string>();
  const chapterResultsById = new Map<string, ApplyCodexAssignmentsBatchChapterResult>();
  let totalAssignments = 0;
  let updatedLineCount = 0;
  let updatedChapterCount = 0;

  const updatedProject: Project = {
    ...project,
    chapters: project.chapters.map((currentChapter) => {
      const assignmentMap = chapterAssignments.get(currentChapter.id);
      if (!assignmentMap) return currentChapter;

      totalAssignments += assignmentMap.size;
      let chapterUpdatedLineCount = 0;

      const updatedLines = currentChapter.scriptLines.map((line) => {
        const assignment = assignmentMap.get(line.id);
        if (!assignment) return line;

        const character = resolveCharacterForAssignment(
          project,
          assignment.characterName,
          assignment.cvName,
          newCharacterMap,
          createdCharacterIds
        );

        if (
          assignment.cvName &&
          (!character.cvName ||
            character.cvName.toLowerCase() !== assignment.cvName.toLowerCase())
        ) {
          charactersWithCvToUpdate.set(character.id, assignment.cvName);
        }

        if (line.characterId !== character.id) {
          chapterUpdatedLineCount += 1;
          updatedLineCount += 1;
          return { ...line, characterId: character.id };
        }

        return line;
      });

      if (chapterUpdatedLineCount > 0) {
        updatedChapterCount += 1;
      }

      chapterResultsById.set(currentChapter.id, {
        chapterId: currentChapter.id,
        chapterTitle: currentChapter.title,
        totalAssignments: assignmentMap.size,
        updatedLineCount: chapterUpdatedLineCount,
      });

      return { ...currentChapter, scriptLines: updatedLines };
    }),
  };

  await useStore.getState().updateProject(updatedProject);

  let updatedCharacterCvCount = 0;
  if (charactersWithCvToUpdate.size > 0) {
    const refreshedProject =
      useStore.getState().projects.find((item) => item.id === project.id) || updatedProject;
    const projectCvStyles = refreshedProject.cvStyles || {};

    for (const [characterId, cvName] of charactersWithCvToUpdate.entries()) {
      const character = useStore.getState().characters.find((item) => item.id === characterId);
      if (!character) continue;

      const style = projectCvStyles[cvName] || DEFAULT_CV_STYLE;
      await useStore.getState().editCharacter(
        character,
        cvName,
        style.bgColor,
        style.textColor
      );
      updatedCharacterCvCount += 1;
    }
  }

  const chapters = chapterInputOrder
    .map((chapterId) => chapterResultsById.get(chapterId))
    .filter(
      (chapterResult): chapterResult is ApplyCodexAssignmentsBatchChapterResult =>
        !!chapterResult
    );

  return {
    projectId: project.id,
    processedChapterCount: chapters.length,
    updatedChapterCount,
    totalAssignments,
    updatedLineCount,
    createdCharacterCount: createdCharacterIds.size,
    updatedCharacterCvCount,
    chapters,
  };
}

export async function applyCodexAssignmentsToStore(
  input: ApplyCodexAssignmentsInput
): Promise<ApplyCodexAssignmentsResult> {
  const batchResult = await applyCodexAssignmentsBatchToStore({
    projectId: input.projectId,
    chapters: [
      {
        chapterId: input.chapterId,
        assignments: input.assignments,
      },
    ],
  });

  const chapterResult = batchResult.chapters[0];
  if (!chapterResult) {
    throw new Error(`未找到章节: ${input.chapterId}`);
  }

  return {
    projectId: batchResult.projectId,
    chapterId: chapterResult.chapterId,
    chapterTitle: chapterResult.chapterTitle,
    totalAssignments: chapterResult.totalAssignments,
    updatedLineCount: chapterResult.updatedLineCount,
    createdCharacterCount: batchResult.createdCharacterCount,
    updatedCharacterCvCount: batchResult.updatedCharacterCvCount,
  };
}
