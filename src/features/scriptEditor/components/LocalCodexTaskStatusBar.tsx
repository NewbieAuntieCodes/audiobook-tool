import React from 'react';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ListBulletIcon,
  PauseIcon,
  SparklesIcon,
  XMarkIcon,
} from '../../../components/ui/icons';

interface LocalCodexTaskStatus {
  taskId?: string;
  kind?: 'role_sync';
  visible: boolean;
  phase: 'idle' | 'queued' | 'running' | 'success' | 'error' | 'cancelled';
  title: string;
  message: string;
  detail: string;
  createdAt?: number;
  updatedAt?: number;
  currentChapterNumber: number;
  totalChapterCount: number;
  isCancelling: boolean;
  canResume: boolean;
  resumeLabel: string;
}

interface LocalCodexTaskStatusBarProps {
  status: LocalCodexTaskStatus;
  onCancel: () => void;
  onDismiss: () => void;
  onResume?: () => void;
}

const phaseStyles: Record<
  Exclude<LocalCodexTaskStatus['phase'], 'idle'>,
  {
    panelClassName: string;
    badgeClassName: string;
    badgeText: string;
    icon: React.ReactNode;
  }
> = {
  queued: {
    panelClassName: 'border-sky-500/40 bg-slate-900/95',
    badgeClassName: 'bg-sky-500/20 text-sky-200',
    badgeText: '排队中',
    icon: <ListBulletIcon className="h-5 w-5 text-sky-300" />,
  },
  running: {
    panelClassName: 'border-amber-500/40 bg-slate-900/95',
    badgeClassName: 'bg-amber-500/20 text-amber-200',
    badgeText: '后台处理中',
    icon: <ArrowPathIcon className="h-5 w-5 animate-spin text-amber-300" />,
  },
  success: {
    panelClassName: 'border-emerald-500/40 bg-slate-900/95',
    badgeClassName: 'bg-emerald-500/20 text-emerald-200',
    badgeText: '已完成',
    icon: <CheckCircleIcon className="h-5 w-5 text-emerald-300" />,
  },
  error: {
    panelClassName: 'border-rose-500/40 bg-slate-900/95',
    badgeClassName: 'bg-rose-500/20 text-rose-200',
    badgeText: '处理失败',
    icon: <XMarkIcon className="h-5 w-5 text-rose-300" />,
  },
  cancelled: {
    panelClassName: 'border-slate-500/40 bg-slate-900/95',
    badgeClassName: 'bg-slate-500/20 text-slate-200',
    badgeText: '已取消',
    icon: <PauseIcon className="h-5 w-5 text-slate-300" />,
  },
};

const LocalCodexTaskStatusBar: React.FC<LocalCodexTaskStatusBarProps> = ({
  status,
  onCancel,
  onDismiss,
  onResume,
}) => {
  if (!status.visible || status.phase === 'idle') {
    return null;
  }

  const phaseStyle = phaseStyles[status.phase];
  const progressMax = Math.max(1, status.totalChapterCount || 1);
  const progressValue = Math.min(progressMax, Math.max(0, status.currentChapterNumber || 0));
  const progressPercent = Math.round((progressValue / progressMax) * 100);

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[95] w-[360px] max-w-[calc(100vw-2rem)]">
      <div
        className={`pointer-events-auto rounded-xl border px-4 py-3 shadow-2xl backdrop-blur ${phaseStyle.panelClassName}`}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex-shrink-0">{phaseStyle.icon}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-semibold text-slate-100">{status.title}</h3>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${phaseStyle.badgeClassName}`}
                  >
                    {phaseStyle.badgeText}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-200">{status.message}</p>
                {status.detail && (
                  <p className="mt-1 text-xs leading-5 text-slate-400">{status.detail}</p>
                )}
              </div>
              {status.phase !== 'running' && (
                <button
                  type="button"
                  onClick={onDismiss}
                  className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
                  title="关闭提示"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              )}
            </div>

            {status.totalChapterCount > 0 && (
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
                  <span>
                    进度 {progressValue}/{progressMax}
                  </span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      status.phase === 'success'
                        ? 'bg-emerald-400'
                        : status.phase === 'error'
                        ? 'bg-rose-400'
                        : status.phase === 'cancelled'
                        ? 'bg-slate-400'
                        : 'bg-amber-400'
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            <div className="mt-3 flex items-center justify-end gap-2">
              {status.phase === 'running' || status.phase === 'queued' ? (
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={status.isCancelling}
                  className="inline-flex items-center gap-1.5 rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 transition-colors hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <SparklesIcon className="h-4 w-4" />
                  {status.isCancelling ? '正在取消...' : '取消任务'}
                </button>
              ) : (
                <>
                  {status.canResume && typeof onResume === 'function' && (
                    <button
                      type="button"
                      onClick={onResume}
                      className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-500"
                    >
                      <ArrowPathIcon className="h-4 w-4" />
                      {status.resumeLabel || '从失败批继续'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onDismiss}
                    className="inline-flex items-center rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 transition-colors hover:bg-slate-600"
                  >
                    关闭提示
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LocalCodexTaskStatusBar;
