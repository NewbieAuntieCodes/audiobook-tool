import React from 'react';
import {
  SplitIcon,
  UndoIcon,
  RedoIcon,
  PencilIcon,
  ScissorsIcon,
  KeyboardIcon,
  ArrowsRightLeftIcon,
  WrenchIcon,
} from '../../../../components/ui/icons';

interface ScriptEditorHeaderProps {
  isEditingHeaderTitle: boolean;
  headerTitleInput: string;
  headerTitleInputRef: React.RefObject<HTMLInputElement | null>;
  selectedChapterTitle: string;
  displayTitle: string;
  isCurrentlyLoadingLines: boolean;
  hasScriptLines: boolean;
  canMergeAdjacentSameCharacterInChapter: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canSplitFocusedLine: boolean;
  canStartLocalRewrite: boolean;
  isRewriteSelectionMode: boolean;
  rewriteSelectedSegmentsCount: number;
  rewriteSelectedBlocksCount: number;
  canSplitChapter: boolean;
  onHeaderTitleInputChange: (value: string) => void;
  onHeaderTitleBlur: () => void;
  onHeaderTitleKeyDown: React.KeyboardEventHandler<HTMLInputElement>;
  onHeaderTitleClick: () => void;
  onMergeAdjacent: () => void;
  onOpenShortcutSettingsModal: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSplitMouseDown: React.MouseEventHandler<HTMLButtonElement>;
  onLocalRewriteButtonClick: () => void;
  onExitRewriteSelectionMode: () => void;
  onSplitChapterMouseDown: React.MouseEventHandler<HTMLButtonElement>;
}

export default function ScriptEditorHeader({
  isEditingHeaderTitle,
  headerTitleInput,
  headerTitleInputRef,
  selectedChapterTitle,
  displayTitle,
  isCurrentlyLoadingLines,
  hasScriptLines,
  canMergeAdjacentSameCharacterInChapter,
  canUndo,
  canRedo,
  canSplitFocusedLine,
  canStartLocalRewrite,
  isRewriteSelectionMode,
  rewriteSelectedSegmentsCount,
  rewriteSelectedBlocksCount,
  canSplitChapter,
  onHeaderTitleInputChange,
  onHeaderTitleBlur,
  onHeaderTitleKeyDown,
  onHeaderTitleClick,
  onMergeAdjacent,
  onOpenShortcutSettingsModal,
  onUndo,
  onRedo,
  onSplitMouseDown,
  onLocalRewriteButtonClick,
  onExitRewriteSelectionMode,
  onSplitChapterMouseDown,
}: ScriptEditorHeaderProps) {
  return (
    <div className="sticky top-0 bg-slate-800 py-2 z-10 border-b border-slate-700 flex justify-between items-center pr-2">
      {isEditingHeaderTitle ? (
        <input
          ref={headerTitleInputRef}
          type="text"
          value={headerTitleInput}
          onChange={(e) => onHeaderTitleInputChange(e.target.value)}
          onBlur={onHeaderTitleBlur}
          onKeyDown={onHeaderTitleKeyDown}
          spellCheck={false}
          className="text-xl font-semibold text-sky-300 bg-slate-700 border border-sky-500 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-sky-400 flex-grow mr-2"
          aria-label={`编辑章节标题: ${selectedChapterTitle}`}
        />
      ) : (
        <div
          className="flex items-center group cursor-pointer flex-grow min-w-0 mr-2"
          onClick={onHeaderTitleClick}
          title="点击编辑标题"
        >
          <h3
            className="text-xl font-semibold text-sky-300 truncate"
            title={displayTitle}
          >
            {displayTitle}
          </h3>
          <PencilIcon className="w-4 h-4 text-slate-400 ml-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
        </div>
      )}
      <div className="flex items-center space-x-2 flex-shrink-0">
        <button
          onClick={onMergeAdjacent}
          disabled={
            isEditingHeaderTitle ||
            isCurrentlyLoadingLines ||
            !hasScriptLines ||
            !canMergeAdjacentSameCharacterInChapter
          }
          title={
            canMergeAdjacentSameCharacterInChapter
              ? '合并本章相邻同角色行'
              : '本章没有可合并的相邻同角色行'
          }
          className="flex items-center px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowsRightLeftIcon className="w-4 h-4 mr-1.5" />
          合并相邻
        </button>
        <button
          onClick={onOpenShortcutSettingsModal}
          disabled={isEditingHeaderTitle}
          title="快捷键设置"
          className="flex items-center px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <KeyboardIcon className="w-4 h-4 mr-1.5" />
          快捷键
        </button>
        <button
          onClick={onUndo}
          disabled={!canUndo || isEditingHeaderTitle}
          title="撤销上一步操作"
          className="flex items-center px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <UndoIcon className="w-4 h-4 mr-1.5" />
          撤销
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo || isEditingHeaderTitle}
          title="重做上一步操作"
          className="flex items-center px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RedoIcon className="w-4 h-4 mr-1.5" />
          重做
        </button>
        <button
          onMouseDown={onSplitMouseDown}
          disabled={!canSplitFocusedLine || isEditingHeaderTitle}
          title={
            canSplitFocusedLine
              ? '在光标位置拆成两句'
              : '先在要拆分的句子中放置光标'
          }
          className="flex items-center px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <SplitIcon className="w-4 h-4 mr-1.5" />
          拆句
        </button>
        <button
          onClick={onLocalRewriteButtonClick}
          disabled={!canStartLocalRewrite || isEditingHeaderTitle}
          title={
            !canStartLocalRewrite
              ? '当前章节还没有可供选择的脚本块'
              : !isRewriteSelectionMode
              ? '进入局部 AI 重画选择模式'
              : rewriteSelectedSegmentsCount > 0
              ? '对已选脚本段生成局部 AI 重画预览'
              : '先在下方点选要重画的块'
          }
          className="flex items-center px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <WrenchIcon className="w-4 h-4 mr-1.5" />
          {!isRewriteSelectionMode
            ? '局部 AI 重画'
            : rewriteSelectedSegmentsCount > 0
            ? `重画已选 ${rewriteSelectedSegmentsCount} 段/${rewriteSelectedBlocksCount}块`
            : '请选择块'}
        </button>
        {isRewriteSelectionMode && (
          <button
            onClick={onExitRewriteSelectionMode}
            className="flex items-center px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded-md text-xs font-medium transition-colors"
            title="退出局部 AI 重画选择模式"
          >
            取消选择
          </button>
        )}
        <button
          onMouseDown={onSplitChapterMouseDown}
          disabled={!canSplitChapter || isEditingHeaderTitle}
          title={
            canSplitChapter
              ? '从当前句开始拆成新章节'
              : '先选择要作为新章节开头的句子'
          }
          className="flex items-center px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ScissorsIcon className="w-4 h-4 mr-1.5" />
          拆章节
        </button>
      </div>
    </div>
  );
}
