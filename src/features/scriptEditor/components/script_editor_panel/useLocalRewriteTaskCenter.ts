import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Project } from '../../../../types';
import type { LocalCodexTaskStatus as RoleSyncTaskStatus } from '../../hooks/annotationImporter/localCodex';
import type {
  LocalCodexTaskCenterItem,
  LocalCodexTaskCenterProjectFilter,
} from './LocalCodexTaskCenter';

const REWRITE_MODE_LABELS: Record<LocalCodexScriptRewriteMode, string> = {
  faithful_parse: '忠实整理',
  atmosphere_keep: '保留氛围',
  compress_extract: '压缩提炼',
  grouped_comments: '群像评论',
};

const mapRoleSyncPhaseToTaskStatus = (
  phase: 'idle' | 'queued' | 'running' | 'success' | 'error' | 'cancelled'
): LocalCodexTaskStatus | null => {
  if (phase === 'idle') return null;
  if (phase === 'success') return 'succeeded';
  if (phase === 'error') return 'failed';
  return phase;
};

const isActiveLocalCodexTask = (task: LocalCodexScriptRewriteTask) =>
  task.status === 'queued' || task.status === 'running';

const countRewriteResultLines = (
  segments: Array<{ lines: LocalCodexScriptRewriteLine[] }>
) => segments.reduce((total, segment) => total + segment.lines.length, 0);

export const useLocalRewriteTaskCenter = ({
  currentProject,
  localCodexTaskStatus,
}: {
  currentProject: Project | null;
  localCodexTaskStatus: RoleSyncTaskStatus;
}) => {
  const [rewriteTasks, setRewriteTasks] = useState<LocalCodexScriptRewriteTask[]>(
    []
  );
  const [isTaskCenterOpen, setIsTaskCenterOpen] = useState(false);
  const [taskProjectFilter, setTaskProjectFilter] =
    useState<LocalCodexTaskCenterProjectFilter>('all');
  const [activeTaskResultId, setActiveTaskResultId] = useState<string | null>(null);

  const refreshRewriteTasks = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electronAPI?.listLocalCodexTasks) {
      setRewriteTasks([]);
      return;
    }

    try {
      const result = await window.electronAPI.listLocalCodexTasks({
        kind: 'script_rewrite',
      });
      if (result.success) {
        setRewriteTasks(Array.isArray(result.tasks) ? result.tasks : []);
      }
    } catch (error) {
      console.error('Refresh local Codex rewrite tasks failed:', error);
    }
  }, []);

  useEffect(() => {
    void refreshRewriteTasks();
  }, [refreshRewriteTasks]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshRewriteTasks();
    }, rewriteTasks.some(isActiveLocalCodexTask) ? 1500 : 4000);

    return () => window.clearInterval(intervalId);
  }, [refreshRewriteTasks, rewriteTasks]);

  const activeTaskResult = useMemo(
    () => rewriteTasks.find((task) => task.id === activeTaskResultId) || null,
    [activeTaskResultId, rewriteTasks]
  );
  const visibleRewriteTasks = useMemo(() => {
    if (taskProjectFilter === 'current' && currentProject?.id) {
      return rewriteTasks.filter((task) => task.projectId === currentProject.id);
    }
    return rewriteTasks;
  }, [currentProject?.id, rewriteTasks, taskProjectFilter]);
  const activeTaskResultApplyHint = useMemo(() => {
    if (!activeTaskResult) return '';
    if (!currentProject) {
      return `该结果属于《${
        activeTaskResult.projectName || activeTaskResult.projectId
      }》，请先切换到目标小说后再应用。`;
    }
    if (activeTaskResult.projectId !== currentProject.id) {
      return `该结果属于《${
        activeTaskResult.projectName || activeTaskResult.projectId
      }》，当前打开的是《${currentProject.name}》，请切换后再应用。`;
    }
    return '';
  }, [activeTaskResult, currentProject]);
  const canApplyActiveTaskResult =
    !!activeTaskResult &&
    !!currentProject &&
    activeTaskResult.projectId === currentProject.id;
  const roleSyncTaskItem = useMemo<LocalCodexTaskCenterItem | null>(() => {
    if (!localCodexTaskStatus.visible) {
      return null;
    }

    const mappedStatus = mapRoleSyncPhaseToTaskStatus(localCodexTaskStatus.phase);
    if (!mappedStatus) {
      return null;
    }

    const chapterProgressText =
      localCodexTaskStatus.totalChapterCount > 0
        ? `进度 ${localCodexTaskStatus.currentChapterNumber}/${localCodexTaskStatus.totalChapterCount}`
        : '';
    const detail = [localCodexTaskStatus.detail, chapterProgressText]
      .filter(Boolean)
      .join(' · ');

    return {
      id: localCodexTaskStatus.taskId || 'local_codex_role_sync',
      kind: 'role_sync',
      status: mappedStatus,
      priority: 'normal',
      createdAt: localCodexTaskStatus.createdAt || Date.now(),
      updatedAt:
        localCodexTaskStatus.updatedAt || localCodexTaskStatus.createdAt || Date.now(),
      title: localCodexTaskStatus.title || '步骤2 本地 Codex',
      subtitle: localCodexTaskStatus.message || '步骤2 本地 Codex 任务',
      detail,
      error:
        mappedStatus === 'failed'
          ? localCodexTaskStatus.detail || localCodexTaskStatus.message
          : undefined,
      canCancel: mappedStatus === 'queued' || mappedStatus === 'running',
      canRemove: mappedStatus !== 'queued' && mappedStatus !== 'running',
      canResume: !!localCodexTaskStatus.canResume,
      canOpenResult: false,
      canPrioritize: false,
      resumeLabel: localCodexTaskStatus.resumeLabel || '继续执行',
    };
  }, [localCodexTaskStatus]);
  const currentProjectRewriteTaskCount = useMemo(() => {
    if (!currentProject?.id) return 0;
    return rewriteTasks.filter((task) => task.projectId === currentProject.id).length;
  }, [currentProject?.id, rewriteTasks]);
  const totalTaskCount = rewriteTasks.length + (roleSyncTaskItem ? 1 : 0);
  const activeTaskCount =
    rewriteTasks.filter(isActiveLocalCodexTask).length +
    (roleSyncTaskItem &&
    (roleSyncTaskItem.status === 'queued' || roleSyncTaskItem.status === 'running')
      ? 1
      : 0);
  const currentProjectTaskCount =
    currentProjectRewriteTaskCount + (roleSyncTaskItem ? 1 : 0);
  const taskCenterItems = useMemo<LocalCodexTaskCenterItem[]>(() => {
    const rewriteTaskItems = visibleRewriteTasks.map<LocalCodexTaskCenterItem>((task) => {
      const modeLabel = REWRITE_MODE_LABELS[task.mode] || task.mode;
      const segmentCount = Array.isArray(task.selection.segments)
        ? task.selection.segments.length
        : 1;
      const blockCount = Array.isArray(task.selection.blocks)
        ? task.selection.blocks.length
        : Math.max(1, task.selection.endLine - task.selection.startLine + 1);
      const detailParts = [`模式 ${modeLabel}`];

      if (task.status === 'queued') {
        detailParts.push(task.priority === 'high' ? '已插队等待执行' : '等待前置任务完成');
      } else if (task.status === 'running') {
        detailParts.push('正在后台生成结构化画本');
      } else if (task.status === 'succeeded' && task.result) {
        detailParts.push(
          `生成 ${
            countRewriteResultLines(task.result.segments || []) ||
            task.result.lines.length
          } 行`
        );
      } else if (task.status === 'cancelled') {
        detailParts.push(task.error || '任务已取消');
      }

      return {
        id: task.id,
        kind: 'script_rewrite',
        status: task.status,
        priority: task.priority || 'normal',
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        durationMs: task.durationMs,
        title: task.chapterTitle || task.chapterId || '局部重画任务',
        subtitle: [
          task.projectName || task.projectId,
          `局部重画 · ${segmentCount} 段 / ${blockCount} 块 · 第 ${task.selection.startLine}-${task.selection.endLine} 块`,
        ]
          .filter(Boolean)
          .join(' · '),
        detail: detailParts.join(' · '),
        summary: task.status === 'succeeded' ? task.result?.summary || '' : undefined,
        error: task.status === 'failed' ? task.error || '任务执行失败' : undefined,
        canCancel: task.status === 'queued' || task.status === 'running',
        canRemove: task.status !== 'queued' && task.status !== 'running',
        canResume: false,
        canOpenResult: task.status === 'succeeded' && !!task.result,
        canPrioritize: task.status === 'queued' && task.priority !== 'high',
      };
    });

    const nextItems = roleSyncTaskItem
      ? [...rewriteTaskItems, roleSyncTaskItem]
      : rewriteTaskItems;

    return nextItems.sort((left, right) => {
      const leftTime = left.updatedAt || left.createdAt || 0;
      const rightTime = right.updatedAt || right.createdAt || 0;
      return rightTime - leftTime;
    });
  }, [roleSyncTaskItem, visibleRewriteTasks]);

  const handleCancelRewriteTask = useCallback(
    async (taskId: string) => {
      if (!window.electronAPI?.cancelLocalCodexTask) return;
      try {
        await window.electronAPI.cancelLocalCodexTask({ taskId });
        await refreshRewriteTasks();
      } catch (error) {
        console.error('Cancel rewrite task failed:', error);
      }
    },
    [refreshRewriteTasks]
  );

  const handleRemoveRewriteTask = useCallback(
    async (taskId: string) => {
      if (!window.electronAPI?.removeLocalCodexTask) return;
      try {
        await window.electronAPI.removeLocalCodexTask({ taskId });
        setActiveTaskResultId((prevId) => (prevId === taskId ? null : prevId));
        await refreshRewriteTasks();
      } catch (error) {
        console.error('Remove rewrite task failed:', error);
      }
    },
    [refreshRewriteTasks]
  );

  const handlePrioritizeRewriteTask = useCallback(
    async (taskId: string) => {
      if (!window.electronAPI?.prioritizeLocalCodexTask) return;
      try {
        await window.electronAPI.prioritizeLocalCodexTask({ taskId });
        await refreshRewriteTasks();
      } catch (error) {
        console.error('Prioritize rewrite task failed:', error);
      }
    },
    [refreshRewriteTasks]
  );

  return {
    activeTaskCount,
    activeTaskResult,
    activeTaskResultApplyHint,
    canApplyActiveTaskResult,
    currentProjectTaskCount,
    handleCancelRewriteTask,
    handlePrioritizeRewriteTask,
    handleRemoveRewriteTask,
    isTaskCenterOpen,
    rewriteTasks,
    setActiveTaskResultId,
    setIsTaskCenterOpen,
    setRewriteTasks,
    setTaskProjectFilter,
    taskCenterItems,
    taskProjectFilter,
    totalTaskCount,
  };
};
