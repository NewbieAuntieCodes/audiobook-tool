import React from 'react';
import LoadingSpinner from '../../../../components/ui/LoadingSpinner';
import type { Chapter, Character, CVStylesMap } from '../../../../types';
import ScriptEditorEmptyState from './ScriptEditorEmptyState';
import ScriptEditorLineList from './ScriptEditorLineList';

interface ScriptEditorContentProps {
  chapterId: string;
  characters: Character[];
  characterIdsInChapter: Set<string>;
  customSoundTypes: string[];
  cvStyles: CVStylesMap;
  editableRawContent: string;
  hasScriptLines: boolean;
  isCurrentlyLoadingLines: boolean;
  isLoadingAiAnnotation: boolean;
  isRawContentDirty: boolean;
  isRewriteSelectionMode: boolean;
  onActivateShortcutMode: (lineId: string | null) => void;
  onAddCustomSoundType: (soundType: string) => void;
  onAssignCharacter: (
    chapterId: string,
    lineId: string,
    characterId: string
  ) => void;
  onDeleteCustomSoundType: (soundType: string) => void;
  onFocusChange: (lineId: string | null) => void;
  onMergeLines: (chapterId: string, lineId: string) => void;
  onMoveLine: (chapterId: string, lineId: string, direction: -1 | 1) => void;
  onOpenCvModal: (character: Character) => void;
  onRawContentChange: React.ChangeEventHandler<HTMLTextAreaElement>;
  onSaveRawContent: () => void;
  onSelectForRewrite: (
    lineId: string,
    event: React.MouseEvent<HTMLDivElement>
  ) => void;
  onUpdateSoundType: (
    chapterId: string,
    lineId: string,
    soundType: string
  ) => void;
  onUpdateText: (chapterId: string, lineId: string, newText: string) => void;
  rewriteSelectedBlocksCount: number;
  rewriteSelectedSegmentsCount: number;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  scriptLines: Chapter['scriptLines'];
  selectedRewriteLineIdSet: Set<string>;
  shortcutActiveLineId: string | null;
  rawContent: string;
}

export default function ScriptEditorContent({
  chapterId,
  characters,
  characterIdsInChapter,
  customSoundTypes,
  cvStyles,
  editableRawContent,
  hasScriptLines,
  isCurrentlyLoadingLines,
  isLoadingAiAnnotation,
  isRawContentDirty,
  isRewriteSelectionMode,
  onActivateShortcutMode,
  onAddCustomSoundType,
  onAssignCharacter,
  onDeleteCustomSoundType,
  onFocusChange,
  onMergeLines,
  onMoveLine,
  onOpenCvModal,
  onRawContentChange,
  onSaveRawContent,
  onSelectForRewrite,
  onUpdateSoundType,
  onUpdateText,
  rawContent,
  rewriteSelectedBlocksCount,
  rewriteSelectedSegmentsCount,
  scrollContainerRef,
  scriptLines,
  selectedRewriteLineIdSet,
  shortcutActiveLineId,
}: ScriptEditorContentProps) {
  return (
    <div
      ref={scrollContainerRef}
      className="flex-grow overflow-y-auto pt-3 pr-1"
    >
      {isCurrentlyLoadingLines ? (
        <div className="flex flex-col items-center justify-center h-64">
          <LoadingSpinner />
          <p className="mt-2 text-slate-400">
            {isLoadingAiAnnotation
              ? 'AI 正在生成带角色标注的台本...'
              : '正在解析章节文本...'}
          </p>
        </div>
      ) : hasScriptLines ? (
        <>
          {isRewriteSelectionMode && (
            <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              局部 AI 重画选择模式已开启。点击脚本块即可选中，按住 Shift 可扩展连续范围，按住 Ctrl 可补选不连续块。当前已选{' '}
              {rewriteSelectedSegmentsCount} 段 / {rewriteSelectedBlocksCount} 块。
            </div>
          )}
          <ScriptEditorLineList
            chapterId={chapterId}
            scriptLines={scriptLines}
            characters={characters}
            characterIdsInChapter={characterIdsInChapter}
            cvStyles={cvStyles}
            customSoundTypes={customSoundTypes}
            selectedRewriteLineIdSet={selectedRewriteLineIdSet}
            shortcutActiveLineId={shortcutActiveLineId}
            isRewriteSelectionMode={isRewriteSelectionMode}
            onUpdateText={onUpdateText}
            onAssignCharacter={onAssignCharacter}
            onMergeLines={onMergeLines}
            onUpdateSoundType={onUpdateSoundType}
            onFocusChange={onFocusChange}
            onActivateShortcutMode={onActivateShortcutMode}
            onAddCustomSoundType={onAddCustomSoundType}
            onDeleteCustomSoundType={onDeleteCustomSoundType}
            onOpenCvModal={onOpenCvModal}
            onMoveLine={onMoveLine}
            onSelectForRewrite={onSelectForRewrite}
          />
        </>
      ) : (
        <ScriptEditorEmptyState
          rawContent={rawContent}
          editableRawContent={editableRawContent}
          isRawContentDirty={isRawContentDirty}
          onSaveRawContent={onSaveRawContent}
          onRawContentChange={onRawContentChange}
        />
      )}
    </div>
  );
}
