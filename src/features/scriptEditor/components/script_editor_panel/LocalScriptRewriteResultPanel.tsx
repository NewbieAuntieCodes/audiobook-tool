import React from 'react';
import LoadingSpinner from '../../../../components/ui/LoadingSpinner';
import { CheckCircleIcon, SparklesIcon } from '../../../../components/ui/icons';

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

interface LocalScriptRewriteResultPanelProps {
  canUseBackgroundQueue: boolean;
  canUseDeepSeekRewrite: boolean;
  canUseLocalCodex: boolean;
  customInstructions: string;
  errorMessage: string;
  hasSelectedSegments: boolean;
  hasSelectedText: boolean;
  isGenerating: boolean;
  isSubmittingTask: boolean;
  modeDescription: string;
  modeLabel: string;
  onApplyRewrite: () => void;
  onCustomInstructionsChange: (value: string) => void;
  onEnqueueHighPriority: () => void;
  onEnqueueNormalPriority: () => void;
  onGeneratePreview: () => void;
  onPresetModeChange: (value: 'correction' | 'crowd_split' | 'conservative') => void;
  presetMode: 'correction' | 'crowd_split' | 'conservative';
  presetModes: Record<
    'correction' | 'crowd_split' | 'conservative',
    {
      label: string;
      description: string;
      instructions: string;
    }
  >;
  previewLineCount: number;
  previewSegments: LocalCodexScriptRewriteResultSegment[];
  previewSummary: string;
}

export default function LocalScriptRewriteResultPanel({
  canUseBackgroundQueue,
  canUseDeepSeekRewrite,
  canUseLocalCodex,
  customInstructions,
  errorMessage,
  hasSelectedSegments,
  hasSelectedText,
  isGenerating,
  isSubmittingTask,
  modeDescription,
  modeLabel,
  onApplyRewrite,
  onCustomInstructionsChange,
  onEnqueueHighPriority,
  onEnqueueNormalPriority,
  onGeneratePreview,
  onPresetModeChange,
  presetMode,
  presetModes,
  previewLineCount,
  previewSegments,
  previewSummary,
}: LocalScriptRewriteResultPanelProps) {
  const isActionDisabled =
    isGenerating || isSubmittingTask || !hasSelectedSegments || !hasSelectedText;

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4">
        <h3 className="mb-3 text-sm font-medium text-slate-200">重画设置</h3>
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-3">
          <div className="text-sm font-medium text-amber-100">{modeLabel}</div>
          <p className="mt-1 text-xs leading-5 text-amber-50/90">{modeDescription}</p>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
            {Object.entries(presetModes).map(([value, item]) => {
              const isSelected = presetMode === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    onPresetModeChange(value as 'correction' | 'crowd_split' | 'conservative')
                  }
                  disabled={isGenerating}
                  className={`rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-50 ${
                    isSelected
                      ? 'border-amber-300 bg-amber-400/20 text-amber-50'
                      : 'border-slate-600 bg-slate-900/60 text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <span className="block text-sm font-semibold">{item.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-300">
                    {item.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-slate-300">
            自定义要求
          </span>
          <textarea
            value={customInstructions}
            onChange={(event) => onCustomInstructionsChange(event.target.value)}
            disabled={isGenerating}
            placeholder="例如：这几句都是不同网友说话，请尽量拆给不同班群成员；或者：这段是同一个人连续发言，不要拆太多。"
            className="h-24 w-full resize-none rounded-md border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none"
          />
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onGeneratePreview}
            disabled={isActionDisabled}
            className="inline-flex items-center rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <LoadingSpinner />
                <span className="ml-2">生成中...</span>
              </>
            ) : (
              <>
                <SparklesIcon className="h-4 w-4" />
                <span className="ml-2">生成预览</span>
              </>
            )}
          </button>
          {canUseBackgroundQueue && (
            <>
              <button
                type="button"
                onClick={onEnqueueNormalPriority}
                disabled={isActionDisabled}
                className="inline-flex items-center rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {isSubmittingTask ? (
                  <>
                    <LoadingSpinner />
                    <span className="ml-2">入队中...</span>
                  </>
                ) : (
                  <>
                    <SparklesIcon className="h-4 w-4" />
                    <span className="ml-2">加入后台任务</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onEnqueueHighPriority}
                disabled={isActionDisabled}
                className="inline-flex items-center rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {isSubmittingTask ? (
                  <>
                    <LoadingSpinner />
                    <span className="ml-2">入队中...</span>
                  </>
                ) : (
                  <>
                    <SparklesIcon className="h-4 w-4" />
                    <span className="ml-2">插队优先执行</span>
                  </>
                )}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onApplyRewrite}
            disabled={isGenerating || isSubmittingTask || previewLineCount === 0}
            className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <CheckCircleIcon className="h-4 w-4" />
            <span className="ml-2">应用到当前章节</span>
          </button>
        </div>
        {!canUseDeepSeekRewrite && !canUseLocalCodex && (
          <p className="mt-3 text-xs text-rose-300">
            当前 Electron 版本未暴露“局部 AI 重画本”接口，请重启到最新版本。
          </p>
        )}
        {canUseDeepSeekRewrite && !canUseBackgroundQueue && (
          <p className="mt-3 text-xs text-slate-400">
            当前使用 DeepSeek 前台预览；本地 Codex 后台队列已先隐藏，避免误走旧通道。
          </p>
        )}
        {errorMessage && (
          <div className="mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {errorMessage}
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-slate-700 bg-slate-900/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-200">结构化预览</h3>
          <span className="text-xs text-slate-400">
            {previewLineCount > 0 ? `${previewLineCount} 行` : '尚未生成'}
          </span>
        </div>
        {previewSummary && (
          <div className="mb-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
            {previewSummary}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-slate-800 bg-slate-950/70 p-3">
          {previewSegments.length === 0 ? (
            <p className="text-sm text-slate-400">
              生成后会在这里展示 AI 按段整理出的画本行。
            </p>
          ) : (
            <div className="space-y-4">
              {previewSegments.map((segment, segmentIndex) => (
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
                          key={`${segment.segmentId}_${line.kind}_${index}_${line.text}`}
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
          )}
        </div>
      </div>
    </div>
  );
}
