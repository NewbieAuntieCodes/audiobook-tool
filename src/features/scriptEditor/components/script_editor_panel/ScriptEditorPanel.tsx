import React, { useEffect, useRef } from 'react';
import { useEditorContext } from '../../contexts/EditorContext';
import { useScriptLineEditor } from '../../hooks/useScriptLineEditor';
import ScriptEditorContent from './ScriptEditorContent';
import LocalScriptRewriteModal from './LocalScriptRewriteModal';
import LocalCodexTaskCenter from './LocalCodexTaskCenter';
import LocalScriptRewriteTaskResultModal from './LocalScriptRewriteTaskResultModal';
import ScriptEditorHeader from './ScriptEditorHeader';
import { useLocalRewriteApplyActions } from './useLocalRewriteApplyActions';
import { useLocalRewriteTaskCenter } from './useLocalRewriteTaskCenter';
import { useRewriteSelectionController } from './useRewriteSelectionController';
import { useScriptEditorHeaderState } from './useScriptEditorHeaderState';
import { useScriptEditorKeyboardShortcuts } from './useScriptEditorKeyboardShortcuts';
import { useScriptEditorPanelViewModel } from './useScriptEditorPanelViewModel';
import { useScriptEditorSplitActions } from './useScriptEditorSplitActions';
import { useScriptEditorTaskCenterActions } from './useScriptEditorTaskCenterActions';
import useStore from '../../../../store/useStore';

const ScriptEditorPanel: React.FC = () => {
  const {
    currentProject,
    characters,
    cvStyles,
    undoableUpdateChapterTitle,
    undoableUpdateChapterRawContent,
    undoableProjectUpdate,
    undo,
    redo,
    canUndo,
    canRedo,
    selectedChapterId,
    setSelectedChapterId,
    openShortcutSettingsModal,
    isLoadingAiAnnotation,
    isLoadingManualParse,
    localCodexTaskStatus,
    cancelLocalCodexTask,
    resumeLocalCodexTask,
    dismissLocalCodexTaskStatus,
    openCvModal,
    addCustomSoundType,
    deleteCustomSoundType,
    splitChapterAtLine,
  } = useEditorContext();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const addCharacter = useStore((state) => state.addCharacter);

  const {
    canMergeAdjacentSameCharacterInChapter,
    characterIdsInChapter,
    customSoundTypes,
    displayTitle,
    hasScriptLines,
    isCurrentlyLoadingLines,
    selectedChapter,
    selectedChapterIndex,
  } = useScriptEditorPanelViewModel({
    currentProject,
    isLoadingAiAnnotation,
    isLoadingManualParse,
    selectedChapterId,
  });
  const {
    canStartLocalRewrite,
    handleCloseLocalRewriteModal,
    handleExitRewriteSelectionMode,
    handleLocalRewriteButtonClick,
    handleSelectRewriteLine,
    isLocalRewriteModalOpen,
    isRewriteSelectionMode,
    resetLocalRewriteSelectionState,
    rewriteSelectedBlocks,
    rewriteSelectedSegments,
    selectedRewriteLineIdSet,
  } = useRewriteSelectionController({
    characters,
    selectedChapter,
  });
  const {
    editableRawContent,
    handleHeaderTitleBlur,
    handleHeaderTitleClick,
    handleHeaderTitleInputChange,
    handleHeaderTitleKeyDown,
    handleRawContentChange,
    handleSaveRawContent,
    headerTitleInput,
    headerTitleInputRef,
    isEditingHeaderTitle,
    isRawContentDirty,
  } = useScriptEditorHeaderState({
    selectedChapter,
    resetLocalRewriteSelectionState,
    undoableUpdateChapterRawContent,
    undoableUpdateChapterTitle,
  });

  const {
    activeTaskCount,
    activeTaskResult,
    activeTaskResultApplyHint,
    canApplyActiveTaskResult,
    currentProjectTaskCount,
    handleCancelRewriteTask,
    handlePrioritizeRewriteTask,
    handleRemoveRewriteTask,
    isTaskCenterOpen,
    setActiveTaskResultId,
    setIsTaskCenterOpen,
    setRewriteTasks,
    setTaskProjectFilter,
    taskCenterItems,
    taskProjectFilter,
    totalTaskCount,
  } = useLocalRewriteTaskCenter({
    currentProject,
    localCodexTaskStatus,
  });

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [selectedChapterId]);

  const {
    handleUpdateScriptLineText,
    handleAssignCharacterToLine,
    handleSplitScriptLine,
    handleMergeAdjacentLines,
    handleMergeAllAdjacentSameCharacterLines,
    handleUpdateSoundType,
    handleMoveScriptLine,
    handleUpdateScriptLineEmotion,
  } = useScriptLineEditor(
    currentProject,
    characters,
    undoableProjectUpdate,
    selectedChapterId,
  );
  const { shortcutActiveLineId, setShortcutActiveLineId } =
    useScriptEditorKeyboardShortcuts({
      currentProject,
      onAssignCharacterToLine: handleAssignCharacterToLine,
    });
  const {
    canSplitChapter,
    canSplitFocusedLine,
    handleSplitChapterMouseDown,
    handleSplitMouseDown,
    setFocusedScriptLineId,
  } = useScriptEditorSplitActions({
    handleSplitScriptLine,
    selectedChapter,
    splitChapterAtLine,
  });

  const {
    handleApplyLocalRewrite,
    handleApplyRewriteTaskResult,
    handleRewriteTaskEnqueued,
  } = useLocalRewriteApplyActions({
    addCharacter,
    characters,
    currentProject,
    handleRemoveRewriteTask,
    resetLocalRewriteSelectionState,
    setActiveTaskResultId,
    setFocusedScriptLineId,
    setIsTaskCenterOpen,
    setRewriteTasks,
    setSelectedChapterId,
    undoableProjectUpdate,
  });
  const {
    handleCancelTask,
    handleCloseTaskResult,
    handleOpenTaskResult,
    handlePrioritizeTask,
    handleRemoveTask,
    handleResumeTask,
    handleToggleTaskCenter,
  } = useScriptEditorTaskCenterActions({
    cancelLocalCodexTask,
    dismissLocalCodexTaskStatus,
    handleCancelRewriteTask,
    handlePrioritizeRewriteTask,
    handleRemoveRewriteTask,
    resumeLocalCodexTask,
    setActiveTaskResultId,
    setIsTaskCenterOpen,
  });

  if (!selectedChapter || selectedChapterIndex < 0) {
    return (
      <div className="p-6 h-full flex items-center justify-center text-slate-400 bg-slate-800">
        <p>选择一个章节开始编辑或查看其内容。</p>
      </div>
    );
  }

  return (
    <div className="p-4 h-full flex flex-col bg-slate-800 text-slate-100">
      <ScriptEditorHeader
        isEditingHeaderTitle={isEditingHeaderTitle}
        headerTitleInput={headerTitleInput}
        headerTitleInputRef={headerTitleInputRef}
        selectedChapterTitle={selectedChapter.title}
        displayTitle={displayTitle}
        isCurrentlyLoadingLines={!!isCurrentlyLoadingLines}
        hasScriptLines={hasScriptLines}
        canMergeAdjacentSameCharacterInChapter={canMergeAdjacentSameCharacterInChapter}
        canUndo={canUndo}
        canRedo={canRedo}
        canSplitFocusedLine={canSplitFocusedLine}
        canStartLocalRewrite={canStartLocalRewrite}
        isRewriteSelectionMode={isRewriteSelectionMode}
        rewriteSelectedSegmentsCount={rewriteSelectedSegments.length}
        rewriteSelectedBlocksCount={rewriteSelectedBlocks.length}
        canSplitChapter={canSplitChapter}
        onHeaderTitleInputChange={handleHeaderTitleInputChange}
        onHeaderTitleBlur={handleHeaderTitleBlur}
        onHeaderTitleKeyDown={handleHeaderTitleKeyDown}
        onHeaderTitleClick={handleHeaderTitleClick}
        onMergeAdjacent={() => handleMergeAllAdjacentSameCharacterLines(selectedChapter.id)}
        onOpenShortcutSettingsModal={openShortcutSettingsModal}
        onUndo={undo}
        onRedo={redo}
        onSplitMouseDown={handleSplitMouseDown}
        onLocalRewriteButtonClick={handleLocalRewriteButtonClick}
        onExitRewriteSelectionMode={handleExitRewriteSelectionMode}
        onSplitChapterMouseDown={handleSplitChapterMouseDown}
      />
      <ScriptEditorContent
        chapterId={selectedChapter.id}
        characters={characters}
        characterIdsInChapter={characterIdsInChapter}
        customSoundTypes={customSoundTypes}
        cvStyles={cvStyles}
        editableRawContent={editableRawContent}
        hasScriptLines={hasScriptLines}
        isCurrentlyLoadingLines={isCurrentlyLoadingLines}
        isLoadingAiAnnotation={isLoadingAiAnnotation}
        isRawContentDirty={isRawContentDirty}
        isRewriteSelectionMode={isRewriteSelectionMode}
        onActivateShortcutMode={setShortcutActiveLineId}
        onAddCustomSoundType={addCustomSoundType}
        onAssignCharacter={handleAssignCharacterToLine}
        onDeleteCustomSoundType={deleteCustomSoundType}
        onFocusChange={setFocusedScriptLineId}
        onMergeLines={handleMergeAdjacentLines}
        onMoveLine={handleMoveScriptLine}
        onOpenCvModal={openCvModal}
        onRawContentChange={handleRawContentChange}
        onSaveRawContent={handleSaveRawContent}
        onSelectForRewrite={handleSelectRewriteLine}
        onUpdateSoundType={handleUpdateSoundType}
        onUpdateText={handleUpdateScriptLineText}
        rawContent={selectedChapter.rawContent}
        rewriteSelectedBlocksCount={rewriteSelectedBlocks.length}
        rewriteSelectedSegmentsCount={rewriteSelectedSegments.length}
        scrollContainerRef={scrollContainerRef}
        scriptLines={selectedChapter.scriptLines}
        selectedRewriteLineIdSet={selectedRewriteLineIdSet}
        shortcutActiveLineId={shortcutActiveLineId}
      />
      <LocalScriptRewriteModal
        isOpen={isLocalRewriteModalOpen}
        onClose={handleCloseLocalRewriteModal}
        projectId={currentProject.id}
        projectName={currentProject.name}
        chapterId={selectedChapter.id}
        chapterTitle={selectedChapter.title}
        characters={characters}
        selectedSegments={rewriteSelectedSegments}
        onApplyRewrite={(payload) =>
          handleApplyLocalRewrite({
            chapterId: selectedChapter.id,
            ...payload,
          })
        }
        onEnqueueTask={handleRewriteTaskEnqueued}
      />
      <LocalCodexTaskCenter
        tasks={taskCenterItems}
        totalTaskCount={totalTaskCount}
        activeTaskCount={activeTaskCount}
        projectFilter={taskProjectFilter}
        currentProjectLabel={currentProject.name}
        currentProjectTaskCount={currentProjectTaskCount}
        allProjectTaskCount={totalTaskCount}
        isOpen={isTaskCenterOpen}
        onToggleOpen={handleToggleTaskCenter}
        onProjectFilterChange={setTaskProjectFilter}
        onCancelTask={handleCancelTask}
        onRemoveTask={handleRemoveTask}
        onResumeTask={handleResumeTask}
        onOpenTaskResult={handleOpenTaskResult}
        onPrioritizeTask={handlePrioritizeTask}
      />
      <LocalScriptRewriteTaskResultModal
        task={activeTaskResult}
        onClose={handleCloseTaskResult}
        canApplyToCurrentProject={canApplyActiveTaskResult}
        applyHint={activeTaskResultApplyHint}
        onApply={(task) => {
          void handleApplyRewriteTaskResult(task);
        }}
      />
    </div>
  );
};

export default ScriptEditorPanel;
