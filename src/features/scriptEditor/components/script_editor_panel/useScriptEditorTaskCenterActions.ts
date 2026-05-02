import { useCallback, type Dispatch, type SetStateAction } from 'react';

interface UseScriptEditorTaskCenterActionsOptions {
  cancelLocalCodexTask: () => Promise<void>;
  dismissLocalCodexTaskStatus: () => void;
  handleCancelRewriteTask: (taskId: string) => Promise<void>;
  handlePrioritizeRewriteTask: (taskId: string) => Promise<void>;
  handleRemoveRewriteTask: (taskId: string) => Promise<void>;
  resumeLocalCodexTask: () => Promise<void>;
  setActiveTaskResultId: (taskId: string | null) => void;
  setIsTaskCenterOpen: Dispatch<SetStateAction<boolean>>;
}

export const useScriptEditorTaskCenterActions = ({
  cancelLocalCodexTask,
  dismissLocalCodexTaskStatus,
  handleCancelRewriteTask,
  handlePrioritizeRewriteTask,
  handleRemoveRewriteTask,
  resumeLocalCodexTask,
  setActiveTaskResultId,
  setIsTaskCenterOpen,
}: UseScriptEditorTaskCenterActionsOptions) => {
  const handleToggleTaskCenter = useCallback(() => {
    setIsTaskCenterOpen((prevOpen) => !prevOpen);
  }, [setIsTaskCenterOpen]);

  const handleCancelTask = useCallback(
    (taskId: string, kind: LocalCodexTaskKind) => {
      if (kind === 'role_sync') {
        void cancelLocalCodexTask();
        return;
      }
      void handleCancelRewriteTask(taskId);
    },
    [cancelLocalCodexTask, handleCancelRewriteTask]
  );

  const handleRemoveTask = useCallback(
    (taskId: string, kind: LocalCodexTaskKind) => {
      if (kind === 'role_sync') {
        dismissLocalCodexTaskStatus();
        return;
      }
      void handleRemoveRewriteTask(taskId);
    },
    [dismissLocalCodexTaskStatus, handleRemoveRewriteTask]
  );

  const handleResumeTask = useCallback(
    (_taskId: string, kind: LocalCodexTaskKind) => {
      if (kind === 'role_sync') {
        void resumeLocalCodexTask();
      }
    },
    [resumeLocalCodexTask]
  );

  const handleOpenTaskResult = useCallback(
    (taskId: string, kind: LocalCodexTaskKind) => {
      if (kind !== 'script_rewrite') {
        return;
      }
      setActiveTaskResultId(taskId);
      setIsTaskCenterOpen(true);
    },
    [setActiveTaskResultId, setIsTaskCenterOpen]
  );

  const handlePrioritizeTask = useCallback(
    (taskId: string, kind: LocalCodexTaskKind) => {
      if (kind !== 'script_rewrite') {
        return;
      }
      void handlePrioritizeRewriteTask(taskId);
    },
    [handlePrioritizeRewriteTask]
  );

  const handleCloseTaskResult = useCallback(() => {
    setActiveTaskResultId(null);
  }, [setActiveTaskResultId]);

  return {
    handleCancelTask,
    handleCloseTaskResult,
    handleOpenTaskResult,
    handlePrioritizeTask,
    handleRemoveTask,
    handleResumeTask,
    handleToggleTaskCenter,
  };
};
