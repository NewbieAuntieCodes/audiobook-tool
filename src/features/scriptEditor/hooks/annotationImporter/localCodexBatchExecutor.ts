import type { MutableRefObject } from 'react';
import type { Project } from '../../../../types';
import {
  logLocalCodexPerf,
  startLocalCodexPerfSpan,
} from '../../../../lib/localCodexPerfDebug';
import useStore from '../../../../store/useStore';
import type { CodexLineAssignment } from '../../services/codexAnnotationService';
import {
  buildLocalCodexBatchAttemptStatus,
  buildLocalCodexBatchRetryStatus,
} from './localCodexTaskStatusBuilders';
import {
  LOCAL_CODEX_BATCH_MAX_ATTEMPTS,
  LOCAL_CODEX_BATCH_RETRY_DELAYS_MS,
  LOCAL_CODEX_CANCELLED_ERROR,
  buildLocalCodexChaptersFromSourceIndex,
  formatLocalCodexBatchRange,
  isRetryableLocalCodexError,
  summarizeLocalCodexBatch,
  waitForLocalCodexRetry,
  type ApplyAssignmentsOptions,
  type LocalCodexRunContext,
  type LocalCodexTaskStatus,
} from './localCodex';

interface ExecuteLocalCodexBatchWithRetryParams {
  currentProject: Pick<Project, 'id' | 'name'>;
  runContext: LocalCodexRunContext;
  batchIndex: number;
  processedChapterCount: number;
  cancelLocalCodexRequestedRef: MutableRefObject<boolean>;
  updateLocalCodexTaskStatus: (
    updater:
      | LocalCodexTaskStatus
      | ((prev: LocalCodexTaskStatus) => LocalCodexTaskStatus)
  ) => void;
  applyAssignmentsToChapters: (
    chapterIds: string[],
    assignments: readonly CodexLineAssignment[],
    options?: ApplyAssignmentsOptions
  ) => { charactersWithCvToUpdate: Map<string, string>; updatedCount: number };
}

export interface LocalCodexBatchExecutionResult {
  batchChapterIds: string[];
  assignmentCount: number;
  updatedCount: number;
  durationMs: number;
  charactersWithCvToUpdate: Map<string, string>;
}

export const executeLocalCodexBatchWithRetry = async ({
  currentProject,
  runContext,
  batchIndex,
  processedChapterCount,
  cancelLocalCodexRequestedRef,
  updateLocalCodexTaskStatus,
  applyAssignmentsToChapters,
}: ExecuteLocalCodexBatchWithRetryParams): Promise<LocalCodexBatchExecutionResult | null> => {
  const batchPlan = runContext.batchPlans[batchIndex];
  const latestStoreState = useStore.getState();
  const activeCharacters = latestStoreState.characters.filter(
    (character) =>
      (!character.projectId || character.projectId === currentProject.id) &&
      character.status !== 'merged'
  );
  const activeKnownCharacters = activeCharacters.map((character) => ({
    name: character.name,
    cvName: character.cvName || '',
  }));
  const chaptersForRequest = buildLocalCodexChaptersFromSourceIndex(
    batchPlan.chapterIds,
    activeCharacters,
    runContext.chapterSourceIndex
  );

  if (chaptersForRequest.length === 0) {
    return null;
  }

  const batchChapterIds = chaptersForRequest.map((chapter) => chapter.chapterId);
  const refreshedBatchPlan = summarizeLocalCodexBatch(chaptersForRequest) || batchPlan;
  const batchRange = formatLocalCodexBatchRange(refreshedBatchPlan);
  let completedAttemptCount = 0;
  let lastBatchErrorMessage = '';
  let successfulResult: Awaited<
    ReturnType<NonNullable<typeof window.electronAPI.runLocalCodexRoleSync>>
  > | null = null;

  for (let attempt = 1; attempt <= LOCAL_CODEX_BATCH_MAX_ATTEMPTS; attempt += 1) {
    completedAttemptCount = attempt;
    updateLocalCodexTaskStatus(
      buildLocalCodexBatchAttemptStatus({
        runContext,
        processedChapterCount,
        batchIndex,
        batchRange,
        batchChapterCount: chaptersForRequest.length,
        batchLineCount: refreshedBatchPlan.lineCount,
        attempt,
        maxAttempts: LOCAL_CODEX_BATCH_MAX_ATTEMPTS,
      })
    );

    const result = await window.electronAPI.runLocalCodexRoleSync({
      projectId: currentProject.id,
      projectName: currentProject.name,
      chapterIds: batchChapterIds,
      knownCharacters: activeKnownCharacters,
      chapters: chaptersForRequest,
      executionOptions: {
        model: runContext.localCodexExecutionSettings.model,
        reasoningEffort: runContext.localCodexExecutionSettings.reasoningEffort,
      },
    });

    if (result.success) {
      const assignments = Array.isArray(result.assignments) ? result.assignments : [];
      if (assignments.length > 0) {
        successfulResult = result;
        break;
      }
      lastBatchErrorMessage = `第 ${batchIndex + 1} 批 ${batchRange} 没有返回可用的标注结果。`;
    } else {
      if (cancelLocalCodexRequestedRef.current) {
        throw new Error(LOCAL_CODEX_CANCELLED_ERROR);
      }
      lastBatchErrorMessage = `第 ${batchIndex + 1} 批 ${batchRange} 处理失败：${
        result.error || '本地 Codex 没有返回成功结果。'
      }`;
    }

    if (
      attempt >= LOCAL_CODEX_BATCH_MAX_ATTEMPTS ||
      !isRetryableLocalCodexError(lastBatchErrorMessage)
    ) {
      throw new Error(lastBatchErrorMessage);
    }

    const retryDelayMs =
      LOCAL_CODEX_BATCH_RETRY_DELAYS_MS[
        Math.min(attempt - 1, LOCAL_CODEX_BATCH_RETRY_DELAYS_MS.length - 1)
      ];
    updateLocalCodexTaskStatus(
      buildLocalCodexBatchRetryStatus({
        runContext,
        processedChapterCount,
        batchIndex,
        retryDelayMs,
        batchRange,
        attempt,
        maxAttempts: LOCAL_CODEX_BATCH_MAX_ATTEMPTS,
        errorMessage: lastBatchErrorMessage,
      })
    );
    await waitForLocalCodexRetry(retryDelayMs, cancelLocalCodexRequestedRef);
  }

  if (!successfulResult) {
    throw new Error(
      lastBatchErrorMessage ||
        `第 ${batchIndex + 1} 批 ${batchRange} 在 ${completedAttemptCount} 次尝试后仍未成功。`
    );
  }

  const assignments = Array.isArray(successfulResult.assignments)
    ? successfulResult.assignments
    : [];
  if (assignments.length === 0) {
    throw new Error(`第 ${batchIndex + 1} 批 ${batchRange} 没有返回可用的标注结果。`);
  }

  logLocalCodexPerf(
    'useAnnotationImporter.runLocalCodexRunContext.beforeApplyAssignmentsToChapters',
    {
      batchIndex,
      batchChapterCount: batchChapterIds.length,
      assignmentCount: assignments.length,
      processedChapterCount,
    }
  );
  const finishApplyAssignmentsPerf = startLocalCodexPerfSpan(
    'useAnnotationImporter.runLocalCodexRunContext.applyAssignmentsToChapters',
    {
      batchIndex,
      batchChapterCount: batchChapterIds.length,
      assignmentCount: assignments.length,
    }
  );
  const { charactersWithCvToUpdate, updatedCount } = applyAssignmentsToChapters(
    batchChapterIds,
    assignments,
    {
      closeImportModal: false,
      updateSelectionAfterApply: false,
    }
  );
  finishApplyAssignmentsPerf({
    batchIndex,
    updatedCount,
    charactersWithCvToUpdateCount: charactersWithCvToUpdate.size,
  });
  logLocalCodexPerf(
    'useAnnotationImporter.runLocalCodexRunContext.afterApplyAssignmentsToChapters',
    {
      batchIndex,
      updatedCount,
      charactersWithCvToUpdateCount: charactersWithCvToUpdate.size,
      processedChapterCount,
    }
  );

  return {
    batchChapterIds,
    assignmentCount: assignments.length,
    updatedCount,
    durationMs:
      typeof successfulResult.meta?.durationMs === 'number'
        ? successfulResult.meta.durationMs
        : 0,
    charactersWithCvToUpdate,
  };
};
