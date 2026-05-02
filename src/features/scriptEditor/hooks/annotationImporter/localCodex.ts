import type { MutableRefObject } from 'react';
import type { Character, Project } from '../../../../types';
import {
  resolveLocalCodexExecutionSettings,
  type LocalCodexReasoningEffort,
} from '../../../../store/slices/uiSlice';
import type { CodexAnnotationChapterInput } from '../../services/codexAnnotationService';

export type LocalCodexLineInput = CodexAnnotationChapterInput['lines'][number] & {
  isDialogue: boolean;
};

export interface LocalCodexChapterInput {
  chapterId: string;
  chapterNumber: number;
  title: string;
  lines: LocalCodexLineInput[];
}

interface LocalCodexChapterSourceLine {
  lineId: string;
  index: number;
  text: string;
  originalText: string;
  characterId: string;
  isDialogue: boolean;
}

export interface LocalCodexChapterSource {
  chapterId: string;
  chapterNumber: number;
  title: string;
  lines: LocalCodexChapterSourceLine[];
}

interface LocalCodexBatchBudget {
  maxChapters: number;
  maxLines: number;
  maxEstimatedChars: number;
}

export interface LocalCodexBatchPlan {
  chapterIds: string[];
  chapterCount: number;
  lineCount: number;
  estimatedChars: number;
  firstChapterNumber: number;
  lastChapterNumber: number;
  firstChapterTitle: string;
  lastChapterTitle: string;
}

export interface ApplyAssignmentsOptions {
  closeImportModal?: boolean;
  updateSelectionAfterApply?: boolean;
}

export type LocalCodexTaskPhase =
  | 'idle'
  | 'queued'
  | 'running'
  | 'success'
  | 'error'
  | 'cancelled';

export type ResolvedLocalCodexExecutionSettings = ReturnType<
  typeof resolveLocalCodexExecutionSettings
>;

export interface LocalCodexTaskStatus {
  taskId: string;
  kind: 'role_sync';
  visible: boolean;
  phase: LocalCodexTaskPhase;
  title: string;
  message: string;
  detail: string;
  createdAt: number;
  updatedAt: number;
  currentChapterNumber: number;
  totalChapterCount: number;
  isCancelling: boolean;
  canResume: boolean;
  resumeLabel: string;
}

export const initialLocalCodexTaskStatus: LocalCodexTaskStatus = {
  taskId: 'local_codex_role_sync',
  kind: 'role_sync',
  visible: false,
  phase: 'idle',
  title: '',
  message: '',
  detail: '',
  createdAt: 0,
  updatedAt: 0,
  currentChapterNumber: 0,
  totalChapterCount: 0,
  isCancelling: false,
  canResume: false,
  resumeLabel: '',
};

export const LOCAL_CODEX_CANCELLED_ERROR = '__LOCAL_CODEX_CANCELLED__';
export const LOCAL_CODEX_BATCH_MAX_ATTEMPTS = 3;
export const LOCAL_CODEX_BATCH_RETRY_DELAYS_MS = [8000, 20000];

const LOCAL_CODEX_BATCH_BUDGETS: Record<
  LocalCodexReasoningEffort,
  LocalCodexBatchBudget
> = {
  minimal: { maxChapters: 12, maxLines: 260, maxEstimatedChars: 26000 },
  low: { maxChapters: 10, maxLines: 230, maxEstimatedChars: 23000 },
  medium: { maxChapters: 8, maxLines: 200, maxEstimatedChars: 20000 },
  high: { maxChapters: 6, maxLines: 170, maxEstimatedChars: 17000 },
  xhigh: { maxChapters: 5, maxLines: 140, maxEstimatedChars: 14500 },
};

export interface LocalCodexRunContext {
  projectId: string;
  projectName: string;
  orderedChapterIds: string[];
  processableChapterIds: string[];
  skippedChapterCount: number;
  batchPlans: LocalCodexBatchPlan[];
  localCodexExecutionSettings: ResolvedLocalCodexExecutionSettings;
  chapterSourceIndex: Map<string, LocalCodexChapterSource>;
}

export interface PendingLocalCodexResumeState {
  runContext: LocalCodexRunContext;
  startBatchIndex: number;
  processedChapterCount: number;
}

const LOCAL_CODEX_RETRYABLE_ERROR_PATTERNS = [
  /\b502\b/i,
  /\b503\b/i,
  /\b504\b/i,
  /\b408\b/i,
  /\b429\b/i,
  /bad gateway/i,
  /gateway timeout/i,
  /timed out/i,
  /timeout/i,
  /disconnect/i,
  /connection reset/i,
  /socket hang up/i,
  /econnreset/i,
  /etimedout/i,
  /eai_again/i,
  /fetch failed/i,
  /temporar(?:y|ily)/i,
  /no last agent message/i,
];

export const isRetryableLocalCodexError = (message: string) => {
  const normalized = String(message || '').trim();
  return (
    normalized !== '' &&
    LOCAL_CODEX_RETRYABLE_ERROR_PATTERNS.some((pattern) => pattern.test(normalized))
  );
};

export const summarizeLocalCodexError = (message: string) => {
  const normalized = String(message || '').replace(/\r/g, '').trim();
  if (!normalized) {
    return 'Unknown error';
  }

  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const preferredLine =
    lines.find((line) =>
      /unexpected status|bad gateway|gateway timeout|unauthorized|invalid api key|api key required|disconnect|timeout|timed out|socket hang up|econnreset|no last agent message/i.test(
        line
      )
    ) ||
    lines.find((line) => /error[:：]/i.test(line)) ||
    lines[0] ||
    normalized;

  return preferredLine.length > 220
    ? preferredLine.slice(0, 217) + '...'
    : preferredLine;
};

const isLocalCodexDialogueLine = (text: string, originalText: string) => {
  return (
    (/^[“"「『].*[”"」』]$/.test(text) && !!originalText) ||
    (/^[“"「『]/.test(text) && originalText !== text) ||
    (/^[【\[][\s\S]*[】\]]$/.test(text) && !!originalText && originalText !== text)
  );
};

export const waitForLocalCodexRetry = async (
  delayMs: number,
  cancelRequestedRef: MutableRefObject<boolean>
) => {
  const intervalMs = 250;
  let remainingMs = Math.max(0, delayMs);

  while (remainingMs > 0) {
    if (cancelRequestedRef.current) {
      throw new Error(LOCAL_CODEX_CANCELLED_ERROR);
    }
    const step = Math.min(intervalMs, remainingMs);
    await new Promise((resolve) => window.setTimeout(resolve, step));
    remainingMs -= step;
  }
};

const estimateLocalCodexChapterSize = (chapter: LocalCodexChapterInput) => {
  const linesEstimatedChars = chapter.lines.reduce((total, line) => {
    return (
      total +
      line.text.length +
      line.originalText.length +
      line.currentCharacterName.length +
      48
    );
  }, 0);

  return {
    lineCount: chapter.lines.length,
    estimatedChars: chapter.title.length + linesEstimatedChars + 240,
  };
};

export const estimateLocalCodexKnownCharactersSize = (
  knownCharacters: Array<{ name: string; cvName: string }>
) => {
  return knownCharacters.reduce((total, character) => {
    return total + character.name.length + character.cvName.length + 64;
  }, 320);
};

export const buildLocalCodexBatchPlans = (
  chapters: LocalCodexChapterInput[],
  reasoningEffort: LocalCodexReasoningEffort,
  knownCharactersEstimatedChars = 0
): LocalCodexBatchPlan[] => {
  const budget =
    LOCAL_CODEX_BATCH_BUDGETS[reasoningEffort] || LOCAL_CODEX_BATCH_BUDGETS.high;
  const promptOverheadChars = 1800;
  const effectiveMaxEstimatedChars = Math.max(
    2200,
    budget.maxEstimatedChars - promptOverheadChars - knownCharactersEstimatedChars
  );
  const batches: LocalCodexBatchPlan[] = [];
  let currentBatch: LocalCodexChapterInput[] = [];
  let currentLineCount = 0;
  let currentEstimatedChars = 0;

  const flushCurrentBatch = () => {
    if (currentBatch.length === 0) return;

    const firstChapter = currentBatch[0];
    const lastChapter = currentBatch[currentBatch.length - 1];
    batches.push({
      chapterIds: currentBatch.map((chapter) => chapter.chapterId),
      chapterCount: currentBatch.length,
      lineCount: currentLineCount,
      estimatedChars: currentEstimatedChars,
      firstChapterNumber: firstChapter.chapterNumber,
      lastChapterNumber: lastChapter.chapterNumber,
      firstChapterTitle: firstChapter.title,
      lastChapterTitle: lastChapter.title,
    });

    currentBatch = [];
    currentLineCount = 0;
    currentEstimatedChars = 0;
  };

  for (const chapter of chapters) {
    const chapterSize = estimateLocalCodexChapterSize(chapter);
    const wouldExceedBudget =
      currentBatch.length > 0 &&
      (currentBatch.length + 1 > budget.maxChapters ||
        currentLineCount + chapterSize.lineCount > budget.maxLines ||
        currentEstimatedChars + chapterSize.estimatedChars >
          effectiveMaxEstimatedChars);

    if (wouldExceedBudget) {
      flushCurrentBatch();
    }

    currentBatch.push(chapter);
    currentLineCount += chapterSize.lineCount;
    currentEstimatedChars += chapterSize.estimatedChars;
  }

  flushCurrentBatch();
  return batches;
};

export const summarizeLocalCodexBatch = (
  chapters: LocalCodexChapterInput[]
): LocalCodexBatchPlan | null => {
  if (chapters.length === 0) {
    return null;
  }

  const firstChapter = chapters[0];
  const lastChapter = chapters[chapters.length - 1];
  return {
    chapterIds: chapters.map((chapter) => chapter.chapterId),
    chapterCount: chapters.length,
    lineCount: chapters.reduce((total, chapter) => total + chapter.lines.length, 0),
    estimatedChars: chapters.reduce(
      (total, chapter) => total + estimateLocalCodexChapterSize(chapter).estimatedChars,
      0
    ),
    firstChapterNumber: firstChapter.chapterNumber,
    lastChapterNumber: lastChapter.chapterNumber,
    firstChapterTitle: firstChapter.title,
    lastChapterTitle: lastChapter.title,
  };
};

export const createLocalCodexChapterSourceIndex = (
  projectSnapshot: Project,
  orderedChapterIds: string[]
): Map<string, LocalCodexChapterSource> => {
  const requestedChapterIdSet = new Set(orderedChapterIds);
  const chapterSourceIndex = new Map<string, LocalCodexChapterSource>();

  projectSnapshot.chapters.forEach((chapter, chapterIndex) => {
    if (!requestedChapterIdSet.has(chapter.id)) {
      return;
    }

    const lines = chapter.scriptLines
      .filter((line) => (line.text || '').trim() !== '')
      .map((line, lineIndex) => {
        const text = String(line.text || '').trim();
        const originalText = String(line.originalText || '').trim();
        const isDialogue = isLocalCodexDialogueLine(text, originalText);

        return {
          lineId: line.id,
          index: lineIndex,
          text,
          originalText,
          characterId: typeof line.characterId === 'string' ? line.characterId : '',
          isDialogue,
        };
      });

    chapterSourceIndex.set(chapter.id, {
      chapterId: chapter.id,
      chapterNumber: chapterIndex + 1,
      title: chapter.title,
      lines,
    });
  });

  return chapterSourceIndex;
};

export const buildLocalCodexChaptersFromSourceIndex = (
  chapterIds: string[],
  activeCharacters: Character[],
  chapterSourceIndex: Map<string, LocalCodexChapterSource>
): LocalCodexChapterInput[] => {
  const characterNameById = new Map(
    activeCharacters.map((character) => [character.id, character.name] as const)
  );

  return chapterIds
    .map((chapterId) => {
      const source = chapterSourceIndex.get(chapterId);
      if (!source || source.lines.length === 0) {
        return null;
      }

      return {
        chapterId: source.chapterId,
        chapterNumber: source.chapterNumber,
        title: source.title,
        lines: source.lines.map((line) => ({
          lineId: line.lineId,
          index: line.index,
          text: line.text,
          originalText: line.originalText,
          currentCharacterName: line.characterId
            ? characterNameById.get(line.characterId) || ''
            : '',
          isDialogue: line.isDialogue,
        })),
      };
    })
    .filter((chapter): chapter is LocalCodexChapterInput => !!chapter);
};

export const formatLocalCodexBatchRange = (batchPlan: LocalCodexBatchPlan) => {
  if (batchPlan.firstChapterNumber === batchPlan.lastChapterNumber) {
    return `第 ${batchPlan.firstChapterNumber} 章《${
      batchPlan.firstChapterTitle || batchPlan.chapterIds[0]
    }》`;
  }

  return `第 ${batchPlan.firstChapterNumber}-${batchPlan.lastChapterNumber} 章（《${
    batchPlan.firstChapterTitle || batchPlan.chapterIds[0]
  }》 → 《${
    batchPlan.lastChapterTitle ||
    batchPlan.chapterIds[batchPlan.chapterIds.length - 1]
  }》）`;
};

const isMatchingRewriteTaskPriority = (
  task: LocalCodexScriptRewriteTask,
  priorities: readonly LocalCodexTaskPriority[]
) => priorities.includes(task.priority || 'normal');

const listPendingRewriteTasks = async (
  projectId: string,
  priorities: readonly LocalCodexTaskPriority[]
): Promise<LocalCodexScriptRewriteTask[]> => {
  if (
    typeof window === 'undefined' ||
    !window.electronAPI?.listLocalCodexTasks ||
    !projectId
  ) {
    return [];
  }

  const result = await window.electronAPI.listLocalCodexTasks({
    projectId,
    kind: 'script_rewrite',
  });
  if (!result.success || !Array.isArray(result.tasks)) {
    return [];
  }

  return result.tasks.filter(
    (task) =>
      (task.status === 'queued' || task.status === 'running') &&
      isMatchingRewriteTaskPriority(task, priorities)
  );
};

export const waitForRewriteTasksToDrain = async ({
  projectId,
  priorities,
  cancelRef,
  onWaiting,
}: {
  projectId: string;
  priorities: readonly LocalCodexTaskPriority[];
  cancelRef: MutableRefObject<boolean>;
  onWaiting: (tasks: LocalCodexScriptRewriteTask[]) => void;
}) => {
  while (true) {
    if (cancelRef.current) {
      throw new Error(LOCAL_CODEX_CANCELLED_ERROR);
    }

    const pendingTasks = await listPendingRewriteTasks(projectId, priorities);
    if (pendingTasks.length === 0) {
      return;
    }

    onWaiting(pendingTasks);
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
};
