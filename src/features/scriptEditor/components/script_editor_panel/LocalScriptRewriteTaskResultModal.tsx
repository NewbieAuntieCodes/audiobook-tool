import React, { useMemo } from 'react';
import { CheckCircleIcon } from '../../../../components/ui/icons';

interface LocalScriptRewriteTaskResultModalProps {
  task: LocalCodexScriptRewriteTask | null;
  onClose: () => void;
  onApply: (task: LocalCodexScriptRewriteTask) => void;
  canApplyToCurrentProject?: boolean;
  applyHint?: string;
}

const LINE_PREVIEW_STYLES: Record<
  LocalCodexScriptRewriteLine['kind'],
  { badge: string; label: string; speakerClass: string }
> = {
  narration: {
    badge: 'bg-slate-700 text-slate-100',
    label: '旁白',
    speakerClass: 'text-slate-300',
  },
  dialogue: {
    badge: 'bg-sky-700 text-sky-100',
    label: '对白',
    speakerClass: 'text-sky-300',
  },
  sfx: {
    badge: 'bg-rose-700 text-rose-100',
    label: '音效',
    speakerClass: 'text-rose-300',
  },
};

const normalizeSpeakerLabel = (speakerName: string) => {
  const trimmed = String(speakerName || '').trim();
  if (!trimmed || trimmed === 'Narrator') return '旁白';
  if (trimmed === '[音效]' || trimmed === '音效') return '音效';
  return trimmed;
};

const countSegmentLines = (
  segments: Array<{ lines: LocalCodexScriptRewriteLine[] }>
) => {
  return segments.reduce((total, segment) => total + segment.lines.length, 0);
};

const LocalScriptRewriteTaskResultModal: React.FC<
  LocalScriptRewriteTaskResultModalProps
> = ({
  task,
  onClose,
  onApply,
  canApplyToCurrentProject = true,
  applyHint = '',
}) => {
  const selectionSegments = useMemo(() => {
    if (!task) return [];
    if (Array.isArray(task.selection.segments) && task.selection.segments.length > 0) {
      return task.selection.segments;
    }
    return [
      {
        segmentId: 'segment_1',
        startLine: task.selection.startLine,
        endLine: task.selection.endLine,
        contextBefore: task.selection.contextBefore || '',
        contextAfter: task.selection.contextAfter || '',
        blocks: task.selection.blocks,
      },
    ];
  }, [task]);

  const resultSegments = useMemo(() => {
    if (!task?.result) return [];
    if (Array.isArray(task.result.segments) && task.result.segments.length > 0) {
      return task.result.segments;
    }
    return [
      {
        segmentId: selectionSegments[0]?.segmentId || 'segment_1',
        startLine: task.selection.startLine,
        endLine: task.selection.endLine,
        lines: task.result.lines,
      },
    ];
  }, [selectionSegments, task]);

  if (!task || task.status !== 'succeeded' || !task.result) {
    return null;
  }

  const totalBlockCount = selectionSegments.reduce(
    (total, segment) => total + segment.blocks.length,
    0
  );
  const totalLineCount = countSegmentLines(resultSegments);

  return (
    <div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/75 p-4">
      <div className="flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-800 shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-700 px-6 py-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-100">后台任务结果</h2>
            <p className="mt-1 text-sm text-slate-300">
              {task.projectName || task.projectId} · {task.chapterTitle || task.chapterId} ·{' '}
              {selectionSegments.length} 段 / {totalBlockCount} 块
            </p>
            <p className="mt-1 text-xs text-slate-400">
              模式 {task.mode}
              {task.durationMs ? ` · ${(task.durationMs / 1000).toFixed(1)} 秒` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-600"
          >
            关闭
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="flex min-h-0 flex-col rounded-lg border border-slate-700 bg-slate-900/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-200">原选中脚本段</h3>
              <span className="text-xs text-slate-400">
                {selectionSegments.length} 段 / {totalBlockCount} 块
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-slate-800 bg-slate-950/70 p-3">
              <div className="space-y-4">
                {selectionSegments.map((segment, segmentIndex) => (
                  <div
                    key={segment.segmentId}
                    className="rounded-lg border border-slate-700 bg-slate-900/80 p-3"
                  >
                    <div className="mb-3 flex items-center justify-between text-xs text-slate-300">
                      <span className="rounded-full bg-slate-700 px-2 py-0.5">
                        选区 {segmentIndex + 1}
                      </span>
                      <span>
                        第 {segment.startLine}-{segment.endLine} 块 · 共{' '}
                        {segment.blocks.length} 块
                      </span>
                    </div>
                    <div className="space-y-3">
                      {segment.blocks.map((block) => (
                        <div
                          key={block.lineId}
                          className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3"
                        >
                          <div className="mb-1 flex items-center gap-2 text-xs text-amber-200">
                            <span className="rounded-full bg-amber-500/20 px-2 py-0.5">
                              #{block.index}
                            </span>
                            <span>{normalizeSpeakerLabel(block.speakerName)}</span>
                            {block.soundType && (
                              <span className="rounded-full bg-slate-700 px-2 py-0.5 text-slate-200">
                                {block.soundType}
                              </span>
                            )}
                          </div>
                          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-100">
                            {block.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-col rounded-lg border border-slate-700 bg-slate-900/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-200">结构化结果</h3>
              <span className="text-xs text-slate-400">{totalLineCount} 行</span>
            </div>
            {task.result.summary && (
              <div className="mb-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                {task.result.summary}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-slate-800 bg-slate-950/70 p-3">
              <div className="space-y-4">
                {resultSegments.map((segment, segmentIndex) => (
                  <div
                    key={segment.segmentId}
                    className="rounded-lg border border-slate-700 bg-slate-900/80 p-3"
                  >
                    <div className="mb-3 flex items-center justify-between text-xs text-slate-300">
                      <span className="rounded-full bg-slate-700 px-2 py-0.5">
                        结果段 {segmentIndex + 1}
                      </span>
                      <span>
                        第 {segment.startLine}-{segment.endLine} 块 · 共{' '}
                        {segment.lines.length} 行
                      </span>
                    </div>
                    <div className="space-y-3">
                      {segment.lines.map((line, index) => {
                        const style = LINE_PREVIEW_STYLES[line.kind];
                        return (
                          <div
                            key={`${task.id}_${segment.segmentId}_${line.kind}_${index}_${line.text}`}
                            className="rounded-md border border-slate-800 bg-slate-900/80 p-3"
                          >
                            <div className="mb-2 flex items-center gap-2 text-xs">
                              <span
                                className={`rounded-full px-2 py-0.5 font-medium ${style.badge}`}
                              >
                                {style.label}
                              </span>
                              <span className={style.speakerClass}>
                                {line.speakerName}
                              </span>
                              {line.soundType && (
                                <span className="rounded-full bg-slate-700 px-2 py-0.5 text-slate-200">
                                  {line.soundType}
                                </span>
                              )}
                            </div>
                            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-100">
                              {line.text}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {applyHint && (
              <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                {applyHint}
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (!canApplyToCurrentProject) return;
                  onApply(task);
                }}
                disabled={!canApplyToCurrentProject}
                className={`inline-flex items-center rounded-md px-4 py-2 text-sm font-medium text-white ${
                  canApplyToCurrentProject
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'cursor-not-allowed bg-slate-600 text-slate-300'
                }`}
              >
                <CheckCircleIcon className="h-4 w-4" />
                <span className="ml-2">
                  {canApplyToCurrentProject ? '应用到当前项目' : '切换到目标小说后应用'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LocalScriptRewriteTaskResultModal;
