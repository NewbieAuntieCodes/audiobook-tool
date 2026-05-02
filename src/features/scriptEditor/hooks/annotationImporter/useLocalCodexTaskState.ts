import { useCallback, useEffect, useRef, useState } from 'react';
import {
  initialLocalCodexTaskStatus,
  type LocalCodexTaskStatus,
  type PendingLocalCodexResumeState,
} from './localCodex';

export function useLocalCodexTaskState() {
  const [localCodexTaskStatus, setLocalCodexTaskStatus] =
    useState<LocalCodexTaskStatus>(initialLocalCodexTaskStatus);
  const cancelLocalCodexRequestedRef = useRef(false);
  const pendingLocalCodexResumeRef =
    useRef<PendingLocalCodexResumeState | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      cancelLocalCodexRequestedRef.current = true;
      const cancelPromise = window.electronAPI?.cancelLocalCodexRoleSync?.();
      void cancelPromise?.catch(() => {});
    };
  }, []);

  const updateLocalCodexTaskStatus = useCallback(
    (
      updater:
        | LocalCodexTaskStatus
        | ((prev: LocalCodexTaskStatus) => LocalCodexTaskStatus)
    ) => {
      if (!isMountedRef.current) {
        return;
      }

      setLocalCodexTaskStatus((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        const now = Date.now();
        return {
          ...next,
          taskId: next.taskId || prev.taskId || initialLocalCodexTaskStatus.taskId,
          kind: 'role_sync',
          createdAt: next.createdAt || (prev.visible ? prev.createdAt : now),
          updatedAt: now,
        };
      });
    },
    []
  );

  const dismissLocalCodexTaskStatus = useCallback(() => {
    pendingLocalCodexResumeRef.current = null;
    updateLocalCodexTaskStatus((prev) =>
      prev.phase === 'running'
        ? prev
        : {
            ...initialLocalCodexTaskStatus,
          }
    );
  }, [updateLocalCodexTaskStatus]);

  const cancelLocalCodexTask = useCallback(async () => {
    cancelLocalCodexRequestedRef.current = true;
    updateLocalCodexTaskStatus((prev) => ({
      ...prev,
      isCancelling: true,
      canResume: false,
      resumeLabel: '',
      detail: prev.detail || '正在取消当前任务…',
    }));

    try {
      await window.electronAPI?.cancelLocalCodexRoleSync?.();
    } catch (error) {
      console.error('Cancel local Codex task failed:', error);
    }
  }, [updateLocalCodexTaskStatus]);

  const isLocalCodexTaskRunning =
    localCodexTaskStatus.phase === 'running' ||
    localCodexTaskStatus.phase === 'queued';

  return {
    localCodexTaskStatus,
    updateLocalCodexTaskStatus,
    dismissLocalCodexTaskStatus,
    cancelLocalCodexTask,
    isLocalCodexTaskRunning,
    cancelLocalCodexRequestedRef,
    pendingLocalCodexResumeRef,
  };
}
