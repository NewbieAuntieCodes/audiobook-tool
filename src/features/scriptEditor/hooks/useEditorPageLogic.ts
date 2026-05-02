import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { Project, Character, ScriptLine, Chapter, PinnedSound } from '../../../types';
import mammoth from 'mammoth';

// Hooks
import { useEnhancedEditorCoreLogic } from './useEnhancedEditorCoreLogic';
import { useScriptLineEditor } from './useScriptLineEditor';
import { useAiChapterAnnotator } from './useAiChapterAnnotator';
import { useManualChapterParser } from './useManualChapterParser';
import { useAnnotationImporter } from './useAnnotationImporter';
import { useCharacterSidePanel } from './useCharacterSidePanel';
import { useDeepSeekCharacterProfile } from './useDeepSeekCharacterProfile';

// Context
import { EditorContextType } from '../contexts/EditorContext';

// Utils
import { parseImportedScriptToChapters } from '../../../lib/scriptImporter';
import { parseHtmlWorkbook } from '../../../lib/htmlScriptParser';
import {
  logLocalCodexPerf,
  startLocalCodexPerfSpan,
} from '../../../lib/localCodexPerfDebug';
import useStore from '../../../store/useStore';

interface EditorPageProps {
  projectId: string;
  projects: Project[];
  characters: Character[];
  onProjectUpdate: (project: Project) => void;
  onAddCharacter: (characterData: Pick<Character, 'name' | 'color' | 'textColor' | 'cvName' | 'description' | 'profile' | 'isStyleLockedToCv'>, projectId: string) => Character;
  onOpenCharacterAndCvStyleModal: (character: Character | null) => void;
  onEditCharacter: (characterBeingEdited: Character, updatedCvName?: string, updatedCvBgColor?: string, updatedCvTextColor?: string) => Promise<void>;
}

export const useEditorPageLogic = (props: EditorPageProps) => {
  const {
    projectId,
    projects,
    characters,
    onProjectUpdate,
    onAddCharacter,
    onOpenCharacterAndCvStyleModal,
    onEditCharacter,
  } = props;

  const { openConfirmModal, soundLibrary, soundObservationList, addIgnoredSoundKeyword, bulkAssignCvToCharacters } = useStore(state => ({
    openConfirmModal: state.openConfirmModal,
    soundLibrary: state.soundLibrary,
    soundObservationList: state.soundObservationList,
    addIgnoredSoundKeyword: state.addIgnoredSoundKeyword,
    bulkAssignCvToCharacters: state.bulkAssignCvToCharacters,
  }));
  const coreLogic = useEnhancedEditorCoreLogic({ projectId, projects, onProjectUpdate });
  const { currentProject, selectedChapterId, multiSelectedChapterIds, setMultiSelectedChapterIds, applyUndoableProjectUpdate } = coreLogic;
  const scriptImportInputRef = useRef<HTMLInputElement>(null);
  const openShortcutSettingsModal = useStore(state => state.openShortcutSettingsModal);

  const { projectCharacters, allCvNames, cvStyles } = useMemo(() => {
    const projChars = characters.filter(c => (!c.projectId || c.projectId === projectId) && c.status !== 'merged');
    const cvs = Array.from(new Set(projChars.map(c => c.cvName).filter((n): n is string => !!n))).sort();
    const styles = currentProject?.cvStyles || {};
    return { projectCharacters: projChars, allCvNames: cvs, cvStyles: styles };
  }, [characters, projectId, currentProject]);

  const handleAddCharacterForProject = useCallback((charData: Pick<Character, 'name' | 'color' | 'textColor' | 'cvName' | 'description' | 'profile' | 'isStyleLockedToCv'>) => {
    return onAddCharacter(charData, projectId);
  }, [onAddCharacter, projectId]);

  const onUpdateCharacterCV = async (characterId: string, cvName: string, cvBgColor: string, cvTextColor: string) => {
    const char = characters.find(c => c.id === characterId);
    if (char) {
      await onEditCharacter(char, cvName, cvBgColor, cvTextColor);
    }
  };

  const { addCustomSoundType, deleteCustomSoundType, batchAddChapters } = useStore(state => ({
    addCustomSoundType: state.addCustomSoundType,
    deleteCustomSoundType: state.deleteCustomSoundType,
    batchAddChapters: state.batchAddChapters,
  }));

  const setMultiSelectedChapterIdsAfterProcessing = useCallback((ids: string[]) => {
      setMultiSelectedChapterIds(ids);
  }, [setMultiSelectedChapterIds]);

  const { isLoadingAiAnnotation, handleRunAiAnnotationForChapters } = useAiChapterAnnotator({ currentProject, onAddCharacter: handleAddCharacterForProject, applyUndoableProjectUpdate, setMultiSelectedChapterIdsAfterProcessing });
  const { isLoadingManualParse, handleManualParseChapters } = useManualChapterParser({ currentProject, characters: projectCharacters, onAddCharacter: handleAddCharacterForProject, applyUndoableProjectUpdate, setMultiSelectedChapterIdsAfterProcessing });
  const {
    isLoadingImportAnnotation,
    isImportModalOpen,
    isLocalCodexTaskRunning,
    localCodexTaskStatus,
    dismissLocalCodexTaskStatus,
    cancelLocalCodexTask,
    resumeLocalCodexTask,
    setIsImportModalOpen,
    handleOpenImportModalTrigger,
    handleImportPreAnnotatedScript,
    handleAutoImportWithCodex,
    handleAutoImportWithDeepSeek,
    handleAutoImportWithLocalCodex,
  } = useAnnotationImporter({ currentProject, onAddCharacter: handleAddCharacterForProject, applyUndoableProjectUpdate, selectedChapterId, multiSelectedChapterIds, setMultiSelectedChapterIdsAfterProcessing });
  const { handleUpdateScriptLineText, handleAssignCharacterToLine, handleSplitScriptLine, handleMergeAdjacentLines, handleDeleteScriptLine, handleUpdateSoundType } = useScriptLineEditor(currentProject, projectCharacters, applyUndoableProjectUpdate, selectedChapterId);
  
  const applyCharacterCvUpdates = useCallback(async (charactersWithCvToUpdate: Map<string, string>) => {
    const finishPerf = startLocalCodexPerfSpan('useEditorPageLogic.applyCharacterCvUpdates', {
      projectId: currentProject?.id || '',
      incomingCharacterCount: charactersWithCvToUpdate.size,
    });
    if (!currentProject || charactersWithCvToUpdate.size === 0) {
      finishPerf({
        skipped: true,
        reason: !currentProject ? 'missing_project' : 'empty_assignments',
      });
      return;
    }

    const { characters, projects } = useStore.getState();
    const project = projects.find(p => p.id === currentProject.id);
    const projectCvStyles = project?.cvStyles || {};
    const finishBuildAssignmentsPerf = startLocalCodexPerfSpan(
      'useEditorPageLogic.applyCharacterCvUpdates.buildAssignments',
      {
        projectId: currentProject.id,
        incomingCharacterCount: charactersWithCvToUpdate.size,
      }
    );
    const assignments = Array.from(charactersWithCvToUpdate.entries())
      .map(([charId, cvName]) => {
        const charToUpdate = characters.find(c => c.id === charId);
        if (!charToUpdate) return null;

        const style = projectCvStyles[cvName] || {
          bgColor: 'bg-slate-700',
          textColor: 'text-slate-300',
        };

        return {
          characterId: charId,
          cvName,
          bgColor: style.bgColor,
          textColor: style.textColor,
        };
      })
      .filter(
        (
          item
        ): item is {
          characterId: string;
          cvName: string;
          bgColor: string;
          textColor: string;
        } => !!item
      );
    finishBuildAssignmentsPerf({
      assignmentCount: assignments.length,
    });

    if (assignments.length === 0) {
      finishPerf({
        skipped: true,
        reason: 'no_valid_assignments',
      });
      return;
    }

    const finishBulkAssignPerf = startLocalCodexPerfSpan(
      'useEditorPageLogic.applyCharacterCvUpdates.bulkAssignCvToCharacters',
      {
        projectId: currentProject.id,
        assignmentCount: assignments.length,
      }
    );
    await bulkAssignCvToCharacters(currentProject.id, assignments);
    finishBulkAssignPerf({
      assignmentCount: assignments.length,
    });
    finishPerf({
      assignmentCount: assignments.length,
    });
  }, [bulkAssignCvToCharacters, currentProject]);

  const handleImportAndCvUpdate = useCallback(async (annotatedText: string) => {
    const charactersWithCvToUpdate = await handleImportPreAnnotatedScript(annotatedText);
    await applyCharacterCvUpdates(charactersWithCvToUpdate);
  }, [applyCharacterCvUpdates, handleImportPreAnnotatedScript]);

  const handleAutoImportWithCodexAndCvUpdate = useCallback(async () => {
    const charactersWithCvToUpdate = await handleAutoImportWithCodex();
    await applyCharacterCvUpdates(charactersWithCvToUpdate);
  }, [applyCharacterCvUpdates, handleAutoImportWithCodex]);

  const handleAutoImportWithLocalCodexAndCvUpdate = useCallback(async () => {
    const finishPerf = startLocalCodexPerfSpan(
      'useEditorPageLogic.handleAutoImportWithLocalCodexAndCvUpdate'
    );
    logLocalCodexPerf(
      'useEditorPageLogic.handleAutoImportWithLocalCodexAndCvUpdate.beforeHandleAutoImportWithLocalCodex'
    );
    const charactersWithCvToUpdate = await handleAutoImportWithLocalCodex();
    logLocalCodexPerf(
      'useEditorPageLogic.handleAutoImportWithLocalCodexAndCvUpdate.afterHandleAutoImportWithLocalCodex',
      {
        charactersWithCvToUpdateCount: charactersWithCvToUpdate.size,
      }
    );
    logLocalCodexPerf(
      'useEditorPageLogic.handleAutoImportWithLocalCodexAndCvUpdate.beforeApplyCharacterCvUpdates',
      {
        charactersWithCvToUpdateCount: charactersWithCvToUpdate.size,
      }
    );
    await applyCharacterCvUpdates(charactersWithCvToUpdate);
    logLocalCodexPerf(
      'useEditorPageLogic.handleAutoImportWithLocalCodexAndCvUpdate.afterApplyCharacterCvUpdates',
      {
        charactersWithCvToUpdateCount: charactersWithCvToUpdate.size,
      }
    );
    finishPerf({
      charactersWithCvToUpdateCount: charactersWithCvToUpdate.size,
    });
  }, [applyCharacterCvUpdates, handleAutoImportWithLocalCodex]);

  const handleAutoImportWithDeepSeekAndCvUpdate = useCallback(async (mode: 'flash' | 'pro') => {
    const charactersWithCvToUpdate = await handleAutoImportWithDeepSeek(mode);
    await applyCharacterCvUpdates(charactersWithCvToUpdate);
  }, [applyCharacterCvUpdates, handleAutoImportWithDeepSeek]);

  const handleResumeLocalCodexTaskAndCvUpdate = useCallback(async () => {
    const finishPerf = startLocalCodexPerfSpan(
      'useEditorPageLogic.handleResumeLocalCodexTaskAndCvUpdate'
    );
    logLocalCodexPerf(
      'useEditorPageLogic.handleResumeLocalCodexTaskAndCvUpdate.beforeResumeLocalCodexTask'
    );
    const charactersWithCvToUpdate = await resumeLocalCodexTask();
    logLocalCodexPerf(
      'useEditorPageLogic.handleResumeLocalCodexTaskAndCvUpdate.afterResumeLocalCodexTask',
      {
        charactersWithCvToUpdateCount: charactersWithCvToUpdate.size,
      }
    );
    logLocalCodexPerf(
      'useEditorPageLogic.handleResumeLocalCodexTaskAndCvUpdate.beforeApplyCharacterCvUpdates',
      {
        charactersWithCvToUpdateCount: charactersWithCvToUpdate.size,
      }
    );
    await applyCharacterCvUpdates(charactersWithCvToUpdate);
    logLocalCodexPerf(
      'useEditorPageLogic.handleResumeLocalCodexTaskAndCvUpdate.afterApplyCharacterCvUpdates',
      {
        charactersWithCvToUpdateCount: charactersWithCvToUpdate.size,
      }
    );
    finishPerf({
      charactersWithCvToUpdateCount: charactersWithCvToUpdate.size,
    });
  }, [applyCharacterCvUpdates, resumeLocalCodexTask]);

  const { characterForSidePanel, handleOpenCharacterSidePanel, handleCloseCharacterSidePanel } = useCharacterSidePanel(projectCharacters);
  const {
    characterProfileGenerationId,
    generateCharacterProfileWithDeepSeek,
  } = useDeepSeekCharacterProfile({
    currentProject,
    characters: projectCharacters,
  });
  const [isAddChaptersModalOpen, setIsAddChaptersModalOpen] = useState(false);

  const handleOpenScriptImport = useCallback(async () => {
    if (!currentProject) return;

    const insertionIndex = selectedChapterId
        ? currentProject.chapters.findIndex(ch => ch.id === selectedChapterId)
        : 0;
    const finalInsertionIndex = insertionIndex === -1 ? 0 : insertionIndex;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        const fileNameLower = file.name.toLowerCase();
        
        if (fileNameLower.endsWith('.doc') && !fileNameLower.endsWith('.docx')) {
            alert("不支持旧版 .doc 格式。请在Word中打开该文件，并将其另存为 .docx 格式后再上传。");
            return;
        }

        let parsedResult: { 
            newChapters: Chapter[]; 
            charactersWithCvToUpdate: Map<string, string>; 
            characterDescriptions: Map<string, string>;
        };

        try {
            const headTextRaw = await file.slice(0, 1024).text();
            const headText = headTextRaw.replace(/^\uFEFF/, '');
            const magicBytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
            const isZipLike = magicBytes[0] === 0x50 && magicBytes[1] === 0x4B;
            const isHtmlLike = /<(?:!doctype\s+html|html|head|meta\s+charset)/i.test(headText);

            if ((isHtmlLike && fileNameLower.endsWith('.docx')) || (!isZipLike && fileNameLower.endsWith('.docx'))) {
                const htmlString = await file.text();
                parsedResult = parseHtmlWorkbook(htmlString, handleAddCharacterForProject);
            } else if (isZipLike && fileNameLower.endsWith('.docx')) {
                const arrayBuffer = await file.arrayBuffer();
                const result = await mammoth.extractRawText({ arrayBuffer });
                parsedResult = parseImportedScriptToChapters(result.value, handleAddCharacterForProject);
            } else if (fileNameLower.endsWith('.txt')) {
                const rawText = await file.text();
                parsedResult = parseImportedScriptToChapters(rawText, handleAddCharacterForProject);
            } else {
                alert("不支持的文件格式或文件内容无法识别。请上传 .txt, .docx, 或由本应用导出的画本文件。");
                return;
            }
        } catch (error: unknown) {
            console.error("读取或解析文件时出错:", error);
            // FIX: The 'error' variable is of type 'unknown'. Use 'instanceof Error' to safely access the 'message' property.
            // Fix: Add instanceof Error check to safely access properties on the 'unknown' error object.
            const detailedMessage = error instanceof Error ? error.message : String(error);
            let errorMessage = `读取或解析文件时出错: ${detailedMessage}`;
            if (typeof detailedMessage === 'string' && detailedMessage.toLowerCase().includes('central directory')) {
                errorMessage = '无法读取该 .docx 文件。文件可能已损坏，或者它是一个旧版 .doc 文件但扩展名被错误地改成了 .docx。';
            }
            alert(errorMessage);
            return;
        }

        const { newChapters, charactersWithCvToUpdate, characterDescriptions } = parsedResult;

        if (charactersWithCvToUpdate.size > 0) {
            const defaultCvBg = 'bg-slate-700';
            const defaultCvText = 'text-slate-300';
            const updatePromises = Array.from(charactersWithCvToUpdate.entries()).map(([charId, cvName]) => {
                const style = cvStyles[cvName] || { bgColor: defaultCvBg, textColor: defaultCvText };
                return onUpdateCharacterCV(charId, cvName, style.bgColor, style.textColor);
            });
            await Promise.all(updatePromises);
        }
        
        if (characterDescriptions && characterDescriptions.size > 0) {
            const currentCharacters = useStore.getState().characters;
            let descriptionsUpdatedCount = 0;
            const projId = currentProject.id;
            for (const [name, description] of characterDescriptions.entries()) {
                const charToUpdate = currentCharacters.find(c => c.name === name && c.projectId === projId)
                    || currentCharacters.find(c => c.name === name);
                if (charToUpdate && charToUpdate.description !== description) {
                    const updatedCharacterData = { ...charToUpdate, description };
                    await onEditCharacter(updatedCharacterData, updatedCharacterData.cvName, undefined, undefined);
                    descriptionsUpdatedCount++;
                }
            }
            if (descriptionsUpdatedCount > 0) {
                alert(`${descriptionsUpdatedCount} 个角色的描述已从文件更新。`);
            }
        }

        if (newChapters.length > 0) {
            applyUndoableProjectUpdate(prev => {
                const updatedChapters = [...prev.chapters];
                updatedChapters.splice(finalInsertionIndex, 0, ...newChapters);
                return { ...prev, chapters: updatedChapters };
            });
            alert(`成功导入 ${newChapters.length} 个新章节。`);
        } else {
            if (!characterDescriptions || characterDescriptions.size === 0) {
              alert('在导入的文件中未找到可识别的新章节。');
            }
        }
    };
    input.click();
  }, [currentProject, selectedChapterId, applyUndoableProjectUpdate, handleAddCharacterForProject, onUpdateCharacterCV, onEditCharacter, cvStyles]);

  const handleSaveNewChapters = (pastedText: string) => {
    const { newChapters } = parseImportedScriptToChapters(pastedText, handleAddCharacterForProject);
    if (newChapters.length > 0) {
      coreLogic.setCvFilter(null);
      applyUndoableProjectUpdate(prev => ({
        ...prev,
        chapters: [...prev.chapters, ...newChapters],
      }));
      coreLogic.setCvFilter(null);
    }
    setIsAddChaptersModalOpen(false);
  };

  const undoableDeleteChapters = useCallback((chapterIds: string[]) => {
    const orphanCandidateIds = new Set<string>();
    const stillUsedIds = new Set<string>();
    if (currentProject) {
      const deletingChapters = currentProject.chapters.filter(ch => chapterIds.includes(ch.id));
      for (const ch of deletingChapters) {
        for (const line of ch.scriptLines) {
          if (line.characterId) orphanCandidateIds.add(line.characterId);
        }
      }
      if (orphanCandidateIds.size > 0) {
        const remainingChapters = currentProject.chapters.filter(ch => !chapterIds.includes(ch.id));
        for (const ch of remainingChapters) {
          for (const line of ch.scriptLines) {
            const cid = line.characterId;
            if (cid && orphanCandidateIds.has(cid)) {
              stillUsedIds.add(cid);
              if (stillUsedIds.size === orphanCandidateIds.size) break;
            }
          }
          if (stillUsedIds.size === orphanCandidateIds.size) break;
        }
      }
    }
    applyUndoableProjectUpdate(prev => {
        const currentSelectedChapterId = selectedChapterId;
        const newSelectedChapterId = chapterIds.includes(currentSelectedChapterId ?? '') ? null : currentSelectedChapterId;
        if (newSelectedChapterId !== currentSelectedChapterId) coreLogic.setSelectedChapterId(newSelectedChapterId);
        setMultiSelectedChapterIds(currentIds => currentIds.filter(id => !chapterIds.includes(id)));
        return { ...prev, chapters: prev.chapters.filter(ch => !chapterIds.includes(ch.id)) };
    });
    if (orphanCandidateIds.size > 0) {
      const candidateMinusStillUsed = Array.from(orphanCandidateIds).filter(id => !stillUsedIds.has(id));
      if (candidateMinusStillUsed.length > 0) {
        const charMap = new Map(characters.map(c => [c.id, c]));
        const PROTECTED_NAMES = new Set<string>(['[静音]', '[音效]', '音效', '待识别角色', 'Narrator']);
        const toDelete = candidateMinusStillUsed.filter(id => {
          const ch = charMap.get(id) as Character | undefined;
          if (!ch) return false;
          if (ch.projectId !== currentProject?.id) return false;
          return !PROTECTED_NAMES.has(ch.name);
        });
        if (toDelete.length > 0) useStore.getState().deleteCharacters(toDelete);
      }
    }
  }, [applyUndoableProjectUpdate, selectedChapterId, coreLogic, setMultiSelectedChapterIds, currentProject, characters]);

  const deleteChapters = useCallback((chapterIds: string[]) => {
    openConfirmModal(`删除 ${chapterIds.length} 个章节确认`, `您确定要删除选中的章节吗？此操作可通过“撤销”恢复。`, () => undoableDeleteChapters(chapterIds), "删除", "取消");
  }, [openConfirmModal, undoableDeleteChapters]);

  const undoableMergeChapters = (chapterIds: string[], targetChapterId: string) => {
      applyUndoableProjectUpdate(prev => {
        const targetChapter = prev.chapters.find(ch => ch.id === targetChapterId);
        if (!targetChapter) return prev;
        const chaptersToMerge = prev.chapters.filter(ch => chapterIds.includes(ch.id)).sort((a,b) => prev.chapters.findIndex(c => c.id === a.id) - prev.chapters.findIndex(c => c.id === b.id));
        let mergedRawContent = chaptersToMerge.map(ch => ch.rawContent).join('\n\n').trim();
        let mergedScriptLines: ScriptLine[] = chaptersToMerge.flatMap(ch => ch.scriptLines);
        const newChapters = prev.chapters.map(ch => ch.id === targetChapterId ? { ...targetChapter, rawContent: mergedRawContent, scriptLines: mergedScriptLines } : ch).filter(ch => !chapterIds.includes(ch.id) || ch.id === targetChapterId);
        return { ...prev, chapters: newChapters };
      });
      coreLogic.setSelectedChapterId(targetChapterId);
      setMultiSelectedChapterIds([]);
  };

  const handleAddCustomSoundType = useCallback((soundType: string) => {
    if (projectId) addCustomSoundType(projectId, soundType);
  }, [projectId, addCustomSoundType]);

  const handleDeleteCustomSoundType = useCallback((soundType: string) => {
    if (projectId) deleteCustomSoundType(projectId, soundType);
  }, [projectId, deleteCustomSoundType]);

  const handleBatchAddChapters = useCallback((count: number) => {
      if(projectId) batchAddChapters(projectId, count);
  }, [projectId, batchAddChapters]);

// FIX: The `handlePinSound` function was missing from the `useEditorPageLogic` hook, causing a type error.
// The function has been implemented to update the `pinnedSounds` property on a script line and added to the `EditorContext` value.
  const handlePinSound = useCallback((chapterId: string, lineId: string, charIndex: number, keyword: string, soundId: number | null, soundName: string | null) => {
    applyUndoableProjectUpdate(prevProject => {
        const updatedProject = {
            ...prevProject,
            chapters: prevProject.chapters.map(ch => {
                if (ch.id !== chapterId) return ch;
                return {
                    ...ch,
                    scriptLines: ch.scriptLines.map(line => {
                        if (line.id === lineId) {
                            const existingPinned = line.pinnedSounds || [];
                            const filtered = existingPinned.filter(p => !(p.keyword === keyword && p.index === charIndex));
                            if (soundId !== null && soundName !== null) {
                                const newPin: PinnedSound = { keyword, index: charIndex, soundId, soundName };
                                return { ...line, pinnedSounds: [...filtered, newPin] };
                            } else {
                                return { ...line, pinnedSounds: filtered.length > 0 ? filtered : undefined };
                            }
                        }
                        return line;
                    })
                };
            })
        };
        return updatedProject;
    });
  }, [applyUndoableProjectUpdate]);
  
  const contextValue = useMemo<EditorContextType>(() => ({
    currentProject,
    selectedChapterId,
    setSelectedChapterId: coreLogic.setSelectedChapterId,
    multiSelectedChapterIds,
    setMultiSelectedChapterIds,
    selectedLineForPlayback: coreLogic.selectedLineForPlayback,
    setSelectedLineForPlayback: coreLogic.setSelectedLineForPlayback,
    characterFilterMode: coreLogic.characterFilterMode,
    setCharacterFilterMode: coreLogic.setCharacterFilterMode,
    cvFilter: coreLogic.cvFilter,
    setCvFilter: coreLogic.setCvFilter,
    undo: coreLogic.undo,
    redo: coreLogic.redo,
    canUndo: coreLogic.canUndo,
    canRedo: coreLogic.canRedo,
    characters: projectCharacters,
    allCvNames,
    cvStyles,
    undoableProjectUpdate: applyUndoableProjectUpdate,
    undoableParseProjectChapters: coreLogic.parseProjectChaptersAndUpdateHistory,
    undoableUpdateChapterTitle: coreLogic.updateChapterTitleInHistory,
    undoableUpdateChapterRawContent: coreLogic.undoableUpdateChapterRawContent,
    deleteChapters,
    mergeChapters: undoableMergeChapters,
    insertChapterAfter: coreLogic.insertChapterAfter,
    batchAddChapters: handleBatchAddChapters,
    isLoadingAiAnnotation,
    isLoadingManualParse,
    isLoadingImportAnnotation,
    isLocalCodexTaskRunning,
    localCodexTaskStatus,
    cancelLocalCodexTask,
    resumeLocalCodexTask: handleResumeLocalCodexTaskAndCvUpdate,
    dismissLocalCodexTaskStatus,
    runAiAnnotationForChapters: handleRunAiAnnotationForChapters,
    runManualParseForChapters: handleManualParseChapters,
    openImportModal: handleOpenImportModalTrigger,
    openAddChaptersModal: () => setIsAddChaptersModalOpen(true),
    openScriptImport: handleOpenScriptImport,
    saveNewChapters: handleSaveNewChapters,
    openShortcutSettingsModal,
    addCustomSoundType: handleAddCustomSoundType,
    deleteCustomSoundType: handleDeleteCustomSoundType,
    addIgnoredSoundKeyword,
    openCharacterSidePanel: handleOpenCharacterSidePanel,
    openCvModal: onOpenCharacterAndCvStyleModal,
    openCharacterEditModal: onOpenCharacterAndCvStyleModal,
    generateCharacterProfileWithDeepSeek,
    characterProfileGenerationId,
    soundLibrary,
    soundObservationList,
    handlePinSound,
    splitChapterAtLine: coreLogic.splitChapterAtLine,
  }), [currentProject, selectedChapterId, multiSelectedChapterIds, setMultiSelectedChapterIds, coreLogic.setSelectedChapterId, coreLogic.selectedLineForPlayback, coreLogic.setSelectedLineForPlayback, coreLogic.characterFilterMode, coreLogic.setCharacterFilterMode, coreLogic.cvFilter, coreLogic.setCvFilter, coreLogic.undo, coreLogic.redo, coreLogic.canUndo, coreLogic.canRedo, projectCharacters, allCvNames, cvStyles, applyUndoableProjectUpdate, deleteChapters, undoableMergeChapters, handleBatchAddChapters, isLoadingAiAnnotation, isLoadingManualParse, isLoadingImportAnnotation, isLocalCodexTaskRunning, localCodexTaskStatus, cancelLocalCodexTask, handleResumeLocalCodexTaskAndCvUpdate, dismissLocalCodexTaskStatus, handleRunAiAnnotationForChapters, handleManualParseChapters, handleOpenImportModalTrigger, handleOpenScriptImport, handleSaveNewChapters, openShortcutSettingsModal, handleAddCustomSoundType, handleDeleteCustomSoundType, addIgnoredSoundKeyword, handleOpenCharacterSidePanel, onOpenCharacterAndCvStyleModal, generateCharacterProfileWithDeepSeek, characterProfileGenerationId, soundLibrary, soundObservationList, handlePinSound, coreLogic.parseProjectChaptersAndUpdateHistory, coreLogic.updateChapterTitleInHistory, coreLogic.undoableUpdateChapterRawContent, coreLogic.insertChapterAfter, coreLogic.splitChapterAtLine]);

  return {
    contextValue,
    isLoadingProject: coreLogic.isLoadingProject,
    currentProject,
    characterForSidePanel,
    handleCloseCharacterSidePanel,
    isAddChaptersModalOpen,
    setIsAddChaptersModalOpen,
    handleSaveNewChapters,
    scriptImportInputRef,
    isImportModalOpen,
    isLocalCodexTaskRunning,
    localCodexTaskStatus,
    dismissLocalCodexTaskStatus,
    cancelLocalCodexTask,
    handleResumeLocalCodexTaskAndCvUpdate,
    setIsImportModalOpen,
    handleImportAndCvUpdate,
    handleAutoImportWithCodexAndCvUpdate,
    handleAutoImportWithDeepSeekAndCvUpdate,
    handleAutoImportWithLocalCodexAndCvUpdate,
  };
};
