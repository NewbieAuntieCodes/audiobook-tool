import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { Character, Project } from '../../../../types';
import {
  applyPreparedLocalRewriteSegments,
  createRewriteApplyPayloadFromTask,
  prepareLocalRewriteApplication,
  type ApplyLocalRewritePayload,
  type LocalRewriteAddCharacter,
} from './localRewriteApply';

interface UseLocalRewriteApplyActionsOptions {
  addCharacter: LocalRewriteAddCharacter;
  characters: Character[];
  currentProject: Project | null;
  handleRemoveRewriteTask: (taskId: string) => Promise<void>;
  resetLocalRewriteSelectionState: () => void;
  setActiveTaskResultId: (taskId: string | null) => void;
  setFocusedScriptLineId: Dispatch<SetStateAction<string | null>>;
  setIsTaskCenterOpen: Dispatch<SetStateAction<boolean>>;
  setRewriteTasks: Dispatch<SetStateAction<LocalCodexScriptRewriteTask[]>>;
  setSelectedChapterId: (chapterId: string) => void | Promise<void>;
  undoableProjectUpdate: (updater: (project: Project) => Project) => void;
}

export const useLocalRewriteApplyActions = ({
  addCharacter,
  characters,
  currentProject,
  handleRemoveRewriteTask,
  resetLocalRewriteSelectionState,
  setActiveTaskResultId,
  setFocusedScriptLineId,
  setIsTaskCenterOpen,
  setRewriteTasks,
  setSelectedChapterId,
  undoableProjectUpdate,
}: UseLocalRewriteApplyActionsOptions) => {
  const handleApplyLocalRewrite = useCallback(
    (payload: ApplyLocalRewritePayload): boolean => {
      try {
        const preparedApplication = prepareLocalRewriteApplication({
          addCharacter,
          characters,
          currentProject,
          payload,
        });

        undoableProjectUpdate((prevProject) => {
          return applyPreparedLocalRewriteSegments({
            chapterId: payload.chapterId,
            preparedSegments: preparedApplication.preparedSegments,
            project: prevProject,
          });
        });

        resetLocalRewriteSelectionState();
        setFocusedScriptLineId(preparedApplication.focusLineId);
        void setSelectedChapterId(payload.chapterId);
        alert(
          `已替换 ${preparedApplication.replacedSegmentCount} 段、共 ${preparedApplication.replacedBlockCount} 块，生成 ${preparedApplication.generatedLineCount} 行。` +
            (payload.summary ? `\n摘要：${payload.summary}` : '')
        );
        return true;
      } catch (error) {
        alert(error instanceof Error ? error.message : String(error));
        return false;
      }
    },
    [
      addCharacter,
      characters,
      currentProject,
      resetLocalRewriteSelectionState,
      setFocusedScriptLineId,
      setSelectedChapterId,
      undoableProjectUpdate,
    ]
  );

  const handleRewriteTaskEnqueued = useCallback(
    (task: LocalCodexScriptRewriteTask) => {
      setRewriteTasks((prevTasks) => {
        const nextTasks = prevTasks.filter((item) => item.id !== task.id);
        return [task, ...nextTasks];
      });
      setIsTaskCenterOpen(true);
      resetLocalRewriteSelectionState();
    },
    [resetLocalRewriteSelectionState, setIsTaskCenterOpen, setRewriteTasks]
  );

  const handleApplyRewriteTaskResult = useCallback(
    async (task: LocalCodexScriptRewriteTask) => {
      if (task.status !== 'succeeded' || !task.result) return;
      if (!currentProject || currentProject.id !== task.projectId) {
        alert(
          `该结果属于《${
            task.projectName || task.projectId
          }》，请先切换到目标小说后再应用。`
        );
        return;
      }

      const applied = handleApplyLocalRewrite(createRewriteApplyPayloadFromTask(task));
      if (!applied) {
        return;
      }

      setActiveTaskResultId(null);
      await handleRemoveRewriteTask(task.id);
    },
    [
      currentProject,
      handleApplyLocalRewrite,
      handleRemoveRewriteTask,
      setActiveTaskResultId,
    ]
  );

  return {
    handleApplyLocalRewrite,
    handleApplyRewriteTaskResult,
    handleRewriteTaskEnqueued,
  };
};
