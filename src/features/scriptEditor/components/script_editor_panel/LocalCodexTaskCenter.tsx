import React from 'react';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ListBulletIcon,
  PauseIcon,
  SparklesIcon,
  XMarkIcon,
} from '../../../../components/ui/icons';

export interface LocalCodexTaskCenterItem {
  id: string;
  kind: LocalCodexTaskKind;
  status: LocalCodexTaskStatus;
  priority: LocalCodexTaskPriority;
  createdAt: number;
  updatedAt: number;
  durationMs?: number;
  title: string;
  subtitle: string;
  detail: string;
  summary?: string;
  error?: string;
  canCancel: boolean;
  canRemove: boolean;
  canResume: boolean;
  canOpenResult: boolean;
  canPrioritize: boolean;
  resumeLabel?: string;
}

export type LocalCodexTaskCenterProjectFilter = 'current' | 'all';

interface LocalCodexTaskCenterProps {
  tasks: LocalCodexTaskCenterItem[];
  totalTaskCount: number;
  activeTaskCount: number;
  projectFilter: LocalCodexTaskCenterProjectFilter;
  currentProjectLabel?: string;
  currentProjectTaskCount: number;
  allProjectTaskCount: number;
  isOpen: boolean;
  onToggleOpen: () => void;
  onProjectFilterChange: (filter: LocalCodexTaskCenterProjectFilter) => void;
  onCancelTask: (taskId: string, kind: LocalCodexTaskKind) => void;
  onRemoveTask: (taskId: string, kind: LocalCodexTaskKind) => void;
  onResumeTask: (taskId: string, kind: LocalCodexTaskKind) => void;
  onOpenTaskResult: (taskId: string, kind: LocalCodexTaskKind) => void;
  onPrioritizeTask: (taskId: string, kind: LocalCodexTaskKind) => void;
}

const TASK_STATUS_STYLES: Record<
  LocalCodexTaskStatus,
  {
    badgeClassName: string;
    label: string;
    icon: React.ReactNode;
  }
> = {
  queued: {
    badgeClassName: 'bg-sky-500/20 text-sky-200',
    label: '排队中',
    icon: <ListBulletIcon className="h-4 w-4 text-sky-300" />,
  },
  running: {
    badgeClassName: 'bg-amber-500/20 text-amber-200',
    label: '运行中',
    icon: <ArrowPathIcon className="h-4 w-4 animate-spin text-amber-300" />,
  },
  succeeded: {
    badgeClassName: 'bg-emerald-500/20 text-emerald-200',
    label: '已完成',
    icon: <CheckCircleIcon className="h-4 w-4 text-emerald-300" />,
  },
  failed: {
    badgeClassName: 'bg-rose-500/20 text-rose-200',
    label: '失败',
    icon: <XMarkIcon className="h-4 w-4 text-rose-300" />,
  },
  cancelled: {
    badgeClassName: 'bg-slate-500/20 text-slate-200',
    label: '已取消',
    icon: <PauseIcon className="h-4 w-4 text-slate-300" />,
  },
};

const formatTaskTime = (timestamp: number) => {
  if (!timestamp) return '--';
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const LocalCodexTaskCenter: React.FC<LocalCodexTaskCenterProps> = ({
  tasks,
  totalTaskCount,
  activeTaskCount,
  projectFilter,
  currentProjectLabel,
  currentProjectTaskCount,
  allProjectTaskCount,
  isOpen,
  onToggleOpen,
  onProjectFilterChange,
  onCancelTask,
  onRemoveTask,
  onResumeTask,
  onOpenTaskResult,
  onPrioritizeTask,
}) => {
  if (totalTaskCount === 0 && !isOpen) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-24 right-5 z-[94] w-[440px] max-w-[calc(100vw-2rem)]">
      <div className="pointer-events-auto">
        <button
          type="button"
          onClick={onToggleOpen}
          className="ml-auto flex items-center gap-2 rounded-full border border-slate-600 bg-slate-900/95 px-4 py-2 text-sm font-medium text-slate-100 shadow-xl backdrop-blur transition-colors hover:border-slate-500 hover:bg-slate-800"
        >
          <SparklesIcon className="h-4 w-4" />
          AI 任务中心
          {totalTaskCount > 0 && (
            <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-200">
              {activeTaskCount > 0
                ? `${activeTaskCount} 进行中 / ${totalTaskCount}`
                : totalTaskCount}
            </span>
          )}
        </button>

        {isOpen && (
          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/95 shadow-2xl backdrop-blur">
            <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">本地 Codex 任务中心</h3>
                <p className="mt-1 text-xs text-slate-400">
                  角色标注和局部重画共用同一执行通道。高优先级任务会在批次边界插队。
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onProjectFilterChange('all')}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      projectFilter === 'all'
                        ? 'bg-sky-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100'
                    }`}
                  >
                    全部小说 · {allProjectTaskCount}
                  </button>
                  <button
                    type="button"
                    onClick={() => onProjectFilterChange('current')}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      projectFilter === 'current'
                        ? 'bg-sky-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100'
                    }`}
                    title={
                      currentProjectLabel
                        ? `只查看当前小说《${currentProjectLabel}》的任务`
                        : '只查看当前小说任务'
                    }
                  >
                    当前小说 · {currentProjectTaskCount}
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={onToggleOpen}
                className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
                title="收起任务中心"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-3">
              {tasks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700 px-4 py-6 text-center text-sm text-slate-400">
                  {projectFilter === 'current'
                    ? `当前小说${
                        currentProjectLabel ? `《${currentProjectLabel}》` : ''
                      }还没有本地 Codex 任务。切到“全部小说”可查看其他排队任务。`
                    : '当前还没有本地 Codex 任务。'}
                </div>
              ) : (
                <div className="space-y-3">
                  {tasks.map((task) => {
                    const statusStyle = TASK_STATUS_STYLES[task.status];
                    return (
                      <div
                        key={`${task.kind}_${task.id}`}
                        className="rounded-xl border border-slate-700 bg-slate-800/90 p-3"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex-shrink-0">{statusStyle.icon}</div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="truncate text-sm font-medium text-slate-100">
                                {task.title}
                              </div>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusStyle.badgeClassName}`}
                              >
                                {statusStyle.label}
                              </span>
                              <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[11px] text-slate-200">
                                {task.kind === 'role_sync' ? '步骤2 标注' : '局部重画'}
                              </span>
                              {task.priority === 'high' && (
                                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] text-amber-200">
                                  高优先级
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-xs text-slate-400">{task.subtitle}</div>
                            <div className="mt-1 text-xs leading-5 text-slate-500">
                              创建于 {formatTaskTime(task.createdAt)}
                              {task.durationMs ? ` · ${(task.durationMs / 1000).toFixed(1)} 秒` : ''}
                            </div>
                            {task.detail && (
                              <div className="mt-2 text-xs leading-5 text-slate-400">
                                {task.detail}
                              </div>
                            )}
                            {task.summary && !task.error && (
                              <div className="mt-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 text-xs leading-5 text-emerald-100">
                                {task.summary}
                              </div>
                            )}
                            {task.error && (
                              <div className="mt-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-2 text-xs leading-5 text-rose-200">
                                {task.error}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                          {task.canPrioritize && (
                            <button
                              type="button"
                              onClick={() => onPrioritizeTask(task.id, task.kind)}
                              className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-500"
                            >
                              优先执行
                            </button>
                          )}
                          {task.canOpenResult && (
                            <button
                              type="button"
                              onClick={() => onOpenTaskResult(task.id, task.kind)}
                              className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-sky-500"
                            >
                              查看结果
                            </button>
                          )}
                          {task.canResume && (
                            <button
                              type="button"
                              onClick={() => onResumeTask(task.id, task.kind)}
                              className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-500"
                            >
                              {task.resumeLabel || '继续执行'}
                            </button>
                          )}
                          {task.canCancel && (
                            <button
                              type="button"
                              onClick={() => onCancelTask(task.id, task.kind)}
                              className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 transition-colors hover:bg-slate-600"
                            >
                              取消任务
                            </button>
                          )}
                          {task.canRemove && (
                            <button
                              type="button"
                              onClick={() => onRemoveTask(task.id, task.kind)}
                              className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 transition-colors hover:bg-slate-600"
                            >
                              移除
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LocalCodexTaskCenter;
