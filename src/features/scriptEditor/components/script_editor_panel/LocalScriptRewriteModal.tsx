import React, { useEffect, useMemo, useState } from 'react';
import { Character } from '../../../../types';
import LocalScriptRewriteResultPanel from './LocalScriptRewriteResultPanel';
import LocalScriptRewriteSelectionPanel from './LocalScriptRewriteSelectionPanel';
import useStore from '../../../../store/useStore';
import {
  buildSelectionTextFromSegments,
  countSegmentLines,
} from './localScriptRewriteModalData';
import { useLocalScriptRewriteModalActions } from './useLocalScriptRewriteModalActions';
import { resolveLocalCodexExecutionSettings } from '../../../../store/slices/uiSlice';

interface LocalScriptRewriteModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  chapterId: string;
  chapterTitle: string;
  characters: Character[];
  selectedSegments: LocalCodexScriptRewriteSelectionSegment[];
  onApplyRewrite: (payload: {
    mode: LocalCodexScriptRewriteMode;
    summary: string;
    segments: LocalCodexScriptRewriteApplySegment[];
  }) => void;
  onEnqueueTask: (task: LocalCodexScriptRewriteTask) => void;
}

type RewritePresetMode = 'correction' | 'crowd_split' | 'conservative';

const REWRITE_PRESET_MODES: Record<
  RewritePresetMode,
  {
    label: string;
    description: string;
    instructions: string;
  }
> = {
  correction: {
    label: '纠错',
    description:
      '修明显画错的角色。适合确认某几句说话人不对；若是群聊短句，也会谨慎拆开。',
    instructions:
      '模式：纠错。请结合选中行前后上下文复查角色分配。若当前角色合理则保持不变；只修改明显不合理的行。若连续短对白明显来自群聊、评论区、弹幕、网友、玩家或不同围观者，并且当前都被标成同一个龙套/群杂角色，请谨慎拆给不同临时角色，例如 班群成员3、网友甲、玩家乙。不要为了增加声音数量而过度拆分。旁白保持 Narrator，音效保持音效角色。',
  },
  crowd_split: {
    label: '丰富群杂',
    description:
      '适合群聊、网友、玩家、观众、路人等多人短对白。目标是增加声音层次，而不是单纯纠错。',
    instructions:
      '模式：丰富群杂。请把明显来自不同发言人的短对白拆给不同临时角色，优先复用已有龙套/群杂角色；同一角色连续发言合理时不要强行拆。允许创建少量临时角色，例如 班群成员3、网友甲、玩家乙、路人丙。不要把正式主角误拆成临时角色。旁白保持 Narrator，音效保持音效角色。',
  },
  conservative: {
    label: '保守重画',
    description:
      '整段感觉不稳但不确定哪里错时使用。尽量复用当前角色，只做少量必要修正。',
    instructions:
      '模式：保守重画。请尽量复用当前角色和已有角色，只做必要调整。不要大幅重写文本，不要扩大角色数量。只有当上下文强烈说明当前角色不合理时才修改。',
  },
};

const REWRITE_MODE: {
  value: LocalCodexScriptRewriteMode;
  label: string;
  description: string;
} = {
  value: 'grouped_comments',
  label: '局部重画',
  description: '只处理当前选中的脚本行，并结合前后上下文返回结构化预览。',
};

const LocalScriptRewriteModal: React.FC<LocalScriptRewriteModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName,
  chapterId,
  chapterTitle,
  characters,
  selectedSegments,
  onApplyRewrite,
  onEnqueueTask,
}) => {
  const [customInstructions, setCustomInstructions] = useState('');
  const [presetMode, setPresetMode] = useState<RewritePresetMode>('correction');
  const [selectedText, setSelectedText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [previewSummary, setPreviewSummary] = useState('');
  const [previewSegments, setPreviewSegments] = useState<
    LocalCodexScriptRewriteResultSegment[]
  >([]);

  const { deepSeekSettings, localCodexSettings } = useStore((state) => ({
    deepSeekSettings: state.apiSettings.deepseek,
    localCodexSettings: state.localCodexSettings,
  }));
  const resolvedLocalCodexSettings = useMemo(
    () => resolveLocalCodexExecutionSettings(localCodexSettings),
    [localCodexSettings]
  );
  const canUseLocalCodex =
    typeof window !== 'undefined' &&
    typeof window.electronAPI?.runLocalCodexScriptRewrite === 'function';
  const canUseDeepSeekRewrite =
    typeof window !== 'undefined' &&
    typeof window.electronAPI?.runDeepSeekScriptRewrite === 'function';
  const canUseLocalCodexBackgroundQueue =
    typeof window !== 'undefined' &&
    typeof window.electronAPI?.enqueueLocalCodexScriptRewrite === 'function';
  const canUseBackgroundQueue = false;
  const executionSummary = canUseDeepSeekRewrite
    ? `DeepSeek ${deepSeekSettings.model || 'deepseek-v4-flash'}`
    : resolvedLocalCodexSettings.summary;

  const mode = REWRITE_MODE.value;
  const effectiveCustomInstructions = useMemo(() => {
    const presetInstructions = REWRITE_PRESET_MODES[presetMode].instructions;
    const trimmedCustomInstructions = customInstructions.trim();
    return trimmedCustomInstructions
      ? `${presetInstructions}\n\n用户额外要求：\n${trimmedCustomInstructions}`
      : presetInstructions;
  }, [customInstructions, presetMode]);
  const selectedBlocks = useMemo(
    () => selectedSegments.flatMap((segment) => segment.blocks),
    [selectedSegments]
  );
  const startLine = selectedSegments[0]?.startLine || 1;
  const endLine =
    selectedSegments[selectedSegments.length - 1]?.endLine || startLine;
  const segmentCount = selectedSegments.length;
  const blockCount = selectedBlocks.length;
  const selectionTextSeed = useMemo(
    () => buildSelectionTextFromSegments(selectedSegments),
    [selectedSegments]
  );
  const previewLineCount = useMemo(
    () => countSegmentLines(previewSegments),
    [previewSegments]
  );

  useEffect(() => {
    if (!isOpen) return;
    setCustomInstructions('');
    setPresetMode('correction');
    setSelectedText(selectionTextSeed);
    setIsGenerating(false);
    setIsSubmittingTask(false);
    setErrorMessage('');
    setPreviewSummary('');
    setPreviewSegments([]);
  }, [isOpen, chapterId, selectionTextSeed]);
  const { handleApplyRewrite, handleEnqueueTask, handleGeneratePreview } =
    useLocalScriptRewriteModalActions({
      canUseBackgroundQueue,
      canUseDeepSeekRewrite,
      canUseLocalCodex,
      chapterId,
      chapterTitle,
      characters,
      customInstructions: effectiveCustomInstructions,
      deepSeekSettings,
      endLine,
      mode,
      model: resolvedLocalCodexSettings.model,
      onApplyRewrite,
      onEnqueueTask,
      previewLineCount,
      previewSegments,
      previewSummary,
      projectId,
      projectName,
      reasoningEffort: resolvedLocalCodexSettings.reasoningEffort,
      selectedBlocks,
      selectedSegments,
      selectedText,
      setErrorMessage,
      setIsGenerating,
      setIsSubmittingTask,
      setPreviewSegments,
      setPreviewSummary,
      startLine,
    });
  const handleSelectedTextChange = (value: string) => {
    setSelectedText(value);
    setPreviewSummary('');
    setPreviewSegments([]);
    setErrorMessage('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-800 shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-700 px-6 py-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-100">
              局部 AI 重画本
            </h2>
            <p className="mt-1 text-sm text-slate-300">
              当前选中 {segmentCount} 段，共 {blockCount} 块，跨度第 {startLine}-{endLine}{' '}
              块。先生成结构化预览，确认后再应用到当前章节。
            </p>
            <p className="mt-1 text-xs text-slate-400">
              当前执行配置：{executionSummary}
              {canUseLocalCodexBackgroundQueue && canUseDeepSeekRewrite
                ? '；旧 Codex 后台队列已先隐藏'
                : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating || isSubmittingTask}
            className="rounded-md bg-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-600 disabled:opacity-50"
          >
            关闭
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 lg:grid-cols-[1.15fr_0.85fr]">
          <LocalScriptRewriteSelectionPanel
            selectedSegments={selectedSegments}
            selectedText={selectedText}
            onSelectedTextChange={handleSelectedTextChange}
          />
          <LocalScriptRewriteResultPanel
            canUseBackgroundQueue={canUseBackgroundQueue}
            canUseDeepSeekRewrite={canUseDeepSeekRewrite}
            canUseLocalCodex={canUseLocalCodex}
            customInstructions={customInstructions}
            errorMessage={errorMessage}
            hasSelectedSegments={selectedSegments.length > 0}
            hasSelectedText={selectedText.trim().length > 0}
            isGenerating={isGenerating}
            isSubmittingTask={isSubmittingTask}
            modeDescription={REWRITE_MODE.description}
            modeLabel={REWRITE_MODE.label}
            onApplyRewrite={handleApplyRewrite}
            onCustomInstructionsChange={setCustomInstructions}
            onEnqueueHighPriority={() => {
              void handleEnqueueTask('high');
            }}
            onEnqueueNormalPriority={() => {
              void handleEnqueueTask('normal');
            }}
            onGeneratePreview={() => {
              void handleGeneratePreview();
            }}
            onPresetModeChange={setPresetMode}
            presetMode={presetMode}
            presetModes={REWRITE_PRESET_MODES}
            previewLineCount={previewLineCount}
            previewSegments={previewSegments}
            previewSummary={previewSummary}
          />
        </div>
      </div>
    </div>
  );
};

export default LocalScriptRewriteModal;
