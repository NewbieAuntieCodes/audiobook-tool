import { useCallback, type MutableRefObject } from 'react';
import type { Project } from '../../../../types';
import useStore from '../../../../store/useStore';
import {
  logLocalCodexPerf,
  startLocalCodexPerfSpan,
} from '../../../../lib/localCodexPerfDebug';
import type { CodexLineAssignment } from '../../services/codexAnnotationService';
import { executeLocalCodexBatchWithRetry } from './localCodexBatchExecutor';
import { buildLocalCodexRunContext } from './localCodexRunContextBuilder';
import {
  buildLocalCodexCancelledStatus,
  buildLocalCodexFailedStatus,
  buildLocalCodexInitialRunningStatus,
  buildLocalCodexProjectSwitchedStatus,
  buildLocalCodexReadyStatus,
  buildLocalCodexSuccessStatus,
  buildLocalCodexWaitingForPrerequisiteTasksStatus,
  buildLocalCodexYieldingToHighPriorityStatus,
  resolveLocalCodexFailureResumeState,
} from './localCodexTaskStatusBuilders';
import {
  LOCAL_CODEX_CANCELLED_ERROR,
  waitForRewriteTasksToDrain,
  type ApplyAssignmentsOptions,
  type LocalCodexRunContext,
  type LocalCodexTaskStatus,
  type PendingLocalCodexResumeState,
} from './localCodex';

interface UseLocalCodexImportProps {
  currentProject: Project | null;
  getTargetChapterIds: () => string[];
  resolveCurrentProjectSnapshot: () => Project | null;
  isLocalCodexTaskRunning: boolean;
  cancelLocalCodexRequestedRef: MutableRefObject<boolean>;
  pendingLocalCodexResumeRef: MutableRefObject<PendingLocalCodexResumeState | null>;
  updateLocalCodexTaskStatus: (
    updater:
      | LocalCodexTaskStatus
      | ((prev: LocalCodexTaskStatus) => LocalCodexTaskStatus)
  ) => void;
  setIsImportModalOpen: (isOpen: boolean) => void;
  setMultiSelectedChapterIdsAfterProcessing: (ids: string[]) => void;
  applyAssignmentsToChapters: (
    chapterIds: string[],
    assignments: readonly CodexLineAssignment[],
    options?: ApplyAssignmentsOptions
  ) => { charactersWithCvToUpdate: Map<string, string>; updatedCount: number };
}

export function useLocalCodexImport({
  currentProject,
  getTargetChapterIds,
  resolveCurrentProjectSnapshot,
  isLocalCodexTaskRunning,
  cancelLocalCodexRequestedRef,
  pendingLocalCodexResumeRef,
  updateLocalCodexTaskStatus,
  setIsImportModalOpen,
  setMultiSelectedChapterIdsAfterProcessing,
  applyAssignmentsToChapters,
}: UseLocalCodexImportProps) {
  const runLocalCodexRunContext = useCallback(
    async (
      runContext: LocalCodexRunContext,
      options: {
        startBatchIndex?: number;
        initialProcessedChapterCount?: number;
      } = {}
    ): Promise<Map<string, string>> => {
      const finishRunPerf = startLocalCodexPerfSpan(
        'useAnnotationImporter.runLocalCodexRunContext',
        {
          projectId: runContext.projectId,
          batchCount: runContext.batchPlans.length,
          processableChapterCount: runContext.processableChapterIds.length,
          startBatchIndex: options.startBatchIndex ?? 0,
          initialProcessedChapterCount: options.initialProcessedChapterCount ?? 0,
        }
      );
      const { startBatchIndex = 0, initialProcessedChapterCount = 0 } = options;

      if (!currentProject || currentProject.id !== runContext.projectId) {
        finishRunPerf({
          phase: 'error',
          reason: 'project_switched',
        });
        updateLocalCodexTaskStatus(
          buildLocalCodexProjectSwitchedStatus({
            runContext,
            processedChapterCount: initialProcessedChapterCount,
          })
        );
        return new Map();
      }

      if (typeof window === 'undefined' || !window.electronAPI?.runLocalCodexRoleSync) {
        finishRunPerf({
          phase: 'error',
          reason: 'electron_api_unavailable',
        });
        alert('当前 Electron 版本不支持“本地 Codex”按钮，请先重启到最新版本。');
        return new Map();
      }

      setIsImportModalOpen(false);
      pendingLocalCodexResumeRef.current = null;

      const accumulatedCharactersWithCvToUpdate = new Map<string, string>();
      let processedChapterCount = initialProcessedChapterCount;
      let totalAssignments = 0;
      let totalUpdatedCount = 0;
      let totalDurationMs = 0;
      let failedBatchIndex = startBatchIndex;

      cancelLocalCodexRequestedRef.current = false;
      updateLocalCodexTaskStatus(
        buildLocalCodexInitialRunningStatus({
          runContext,
          startBatchIndex,
          processedChapterCount,
        })
      );

      try {
        await waitForRewriteTasksToDrain({
          projectId: currentProject.id,
          priorities: ['normal', 'high'],
          cancelRef: cancelLocalCodexRequestedRef,
          onWaiting: (pendingTasks) => {
            updateLocalCodexTaskStatus(
              buildLocalCodexWaitingForPrerequisiteTasksStatus({
                runContext,
                processedChapterCount,
                pendingTasks,
              })
            );
          },
        });

        updateLocalCodexTaskStatus(
          buildLocalCodexReadyStatus({
            runContext,
            processedChapterCount,
          })
        );

        for (
          let batchIndex = startBatchIndex;
          batchIndex < runContext.batchPlans.length;
          batchIndex += 1
        ) {
          if (cancelLocalCodexRequestedRef.current) {
            throw new Error(LOCAL_CODEX_CANCELLED_ERROR);
          }

          if (processedChapterCount > initialProcessedChapterCount) {
            await waitForRewriteTasksToDrain({
              projectId: currentProject.id,
              priorities: ['high'],
              cancelRef: cancelLocalCodexRequestedRef,
              onWaiting: (pendingTasks) => {
                updateLocalCodexTaskStatus(
                  buildLocalCodexYieldingToHighPriorityStatus({
                    runContext,
                    processedChapterCount,
                    pendingTasks,
                  })
                );
              },
            });
          }

          failedBatchIndex = batchIndex;
          const batchResult = await executeLocalCodexBatchWithRetry({
            currentProject,
            runContext,
            batchIndex,
            processedChapterCount,
            cancelLocalCodexRequestedRef,
            updateLocalCodexTaskStatus,
            applyAssignmentsToChapters,
          });

          if (!batchResult) {
            continue;
          }

          batchResult.charactersWithCvToUpdate.forEach((cvName, characterId) => {
            accumulatedCharactersWithCvToUpdate.set(characterId, cvName);
          });
          processedChapterCount += batchResult.batchChapterIds.length;
          totalAssignments += batchResult.assignmentCount;
          totalUpdatedCount += batchResult.updatedCount;
          totalDurationMs += batchResult.durationMs;
        }

        if (processedChapterCount === 0) {
          finishRunPerf({
            phase: 'empty',
            processedChapterCount,
            totalAssignments,
          });
          alert('当前选择的章节没有可供本地 Codex 标注的台词行。');
          return new Map();
        }

        pendingLocalCodexResumeRef.current = null;
        setMultiSelectedChapterIdsAfterProcessing(runContext.orderedChapterIds);

        logLocalCodexPerf(
          'useAnnotationImporter.runLocalCodexRunContext.beforeSuccessStatus',
          {
            processedChapterCount,
            totalUpdatedCount,
            totalAssignments,
            accumulatedCharactersWithCvToUpdateCount:
              accumulatedCharactersWithCvToUpdate.size,
          }
        );
        updateLocalCodexTaskStatus(
          buildLocalCodexSuccessStatus({
            runContext,
            processedChapterCount,
            totalUpdatedCount,
            totalAssignments,
            totalDurationMs,
          })
        );
        logLocalCodexPerf('useAnnotationImporter.runLocalCodexRunContext.beforeReturn', {
          processedChapterCount,
          totalUpdatedCount,
          totalAssignments,
          accumulatedCharactersWithCvToUpdateCount:
            accumulatedCharactersWithCvToUpdate.size,
        });
        finishRunPerf({
          phase: 'success',
          processedChapterCount,
          totalUpdatedCount,
          totalAssignments,
          accumulatedCharactersWithCvToUpdateCount:
            accumulatedCharactersWithCvToUpdate.size,
        });
        return accumulatedCharactersWithCvToUpdate;
      } catch (error: unknown) {
        console.error('Local Codex annotation failed:', error);
        const isCancelled =
          error instanceof Error && error.message === LOCAL_CODEX_CANCELLED_ERROR;

        if (isCancelled) {
          pendingLocalCodexResumeRef.current = null;
          updateLocalCodexTaskStatus(
            buildLocalCodexCancelledStatus({
              runContext,
              processedChapterCount,
            })
          );
        } else {
          const { safeFailedBatchIndex, resumeLabel } = resolveLocalCodexFailureResumeState({
            runContext,
            failedBatchIndex,
          });

          pendingLocalCodexResumeRef.current = {
            runContext,
            startBatchIndex: safeFailedBatchIndex,
            processedChapterCount,
          };
          updateLocalCodexTaskStatus(
            buildLocalCodexFailedStatus({
              runContext,
              processedChapterCount,
              errorMessage: error instanceof Error ? error.message : 'Unknown error',
              resumeLabel,
            })
          );
        }
        finishRunPerf({
          phase: isCancelled ? 'cancelled' : 'error',
          processedChapterCount,
          totalUpdatedCount,
          totalAssignments,
          accumulatedCharactersWithCvToUpdateCount:
            accumulatedCharactersWithCvToUpdate.size,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
        return accumulatedCharactersWithCvToUpdate;
      } finally {
        cancelLocalCodexRequestedRef.current = false;
      }
    },
    [
      applyAssignmentsToChapters,
      cancelLocalCodexRequestedRef,
      currentProject,
      pendingLocalCodexResumeRef,
      setIsImportModalOpen,
      setMultiSelectedChapterIdsAfterProcessing,
      updateLocalCodexTaskStatus,
    ]
  );

  const handleAutoImportWithLocalCodex = useCallback(async (): Promise<Map<string, string>> => {
    const chapterIds = getTargetChapterIds();
    if (!currentProject || chapterIds.length === 0) {
      return new Map();
    }

    if (typeof window === 'undefined' || !window.electronAPI?.runLocalCodexRoleSync) {
      alert('当前 Electron 版本不支持“本地 Codex”按钮，请先重启到最新版本。');
      return new Map();
    }
    if (isLocalCodexTaskRunning) {
      return new Map();
    }

    const projectSnapshot = resolveCurrentProjectSnapshot();
    if (!projectSnapshot) {
      return new Map();
    }

    const storeState = useStore.getState();
    const initialActiveCharacters = storeState.characters.filter(
      (character) =>
        (!character.projectId || character.projectId === currentProject.id) &&
        character.status !== 'merged'
    );
    const runContext = buildLocalCodexRunContext({
      currentProject,
      projectSnapshot,
      chapterIds,
      activeCharacters: initialActiveCharacters,
      localCodexSettings: storeState.localCodexSettings,
    });

    if (!runContext) {
      alert('当前选择的章节没有可供本地 Codex 标注的台词行。');
      return new Map();
    }

    return runLocalCodexRunContext(runContext);
  }, [
    currentProject,
    getTargetChapterIds,
    isLocalCodexTaskRunning,
    resolveCurrentProjectSnapshot,
    runLocalCodexRunContext,
  ]);

  const resumeLocalCodexTask = useCallback(async (): Promise<Map<string, string>> => {
    if (isLocalCodexTaskRunning) {
      return new Map();
    }

    const pendingResume = pendingLocalCodexResumeRef.current;
    if (!pendingResume) {
      return new Map();
    }

    return runLocalCodexRunContext(pendingResume.runContext, {
      startBatchIndex: pendingResume.startBatchIndex,
      initialProcessedChapterCount: pendingResume.processedChapterCount,
    });
  }, [isLocalCodexTaskRunning, pendingLocalCodexResumeRef, runLocalCodexRunContext]);

  return {
    handleAutoImportWithLocalCodex,
    resumeLocalCodexTask,
  };
}
