import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import AudioScriptLine from './components/AudioScriptLine';
import GlobalAudioPlayer from './components/GlobalAudioPlayer';
import ExportAudioModal from './components/ExportAudioModal';
import { exportAudioWithMarkers } from '../../lib/wavExporter';
import { db } from '../../db';
import { ScriptLine, Chapter, Character } from '../../types';
import { useAudioFileMatcher } from './hooks/useAudioFileMatcher';
import { useAsrAutoAligner } from './hooks/useAsrAutoAligner';
import ResizablePanels from '../../components/ui/ResizablePanels';
import { usePaginatedChapters } from '../scriptEditor/hooks/usePaginatedChapters';
import SilenceSettingsModal from './components/SilenceSettingsModal';
import AudioWaveformEditor from './components/AudioWaveformEditor';
import { ChevronLeftIcon } from '../../components/ui/icons';
import AudioAlignmentHeader from './components/AudioAlignmentHeader';
import ChapterListPanel from './components/ChapterListPanel';
import ScriptLineList from './components/ScriptLineList';
import { exportToReaperProject } from '../../services/reaperExporter';

const AudioAlignmentPage: React.FC = () => {
  const store = useStore(state => ({
    projects: state.projects,
    characters: state.characters,
    selectedProjectId: state.selectedProjectId,
    selectedChapterId: state.selectedChapterId,
    setSelectedChapterId: state.setSelectedChapterId,
    playingLineInfo: state.playingLineInfo,
    assignAudioToLine: state.assignAudioToLine,
    resegmentAndRealignAudio: state.resegmentAndRealignAudio,
    navigateTo: state.navigateTo,
    openConfirmModal: state.openConfirmModal,
    clearAudioFromChapters: state.clearAudioFromChapters,
    waveformEditorState: state.waveformEditor,
    openWaveformEditor: state.openWaveformEditor,
    closeWaveformEditor: state.closeWaveformEditor,
    cvFilter: state.audioAlignmentCvFilter,
    setCvFilter: state.setAudioAlignmentCvFilter,
    characterFilter: state.audioAlignmentCharacterFilter,
    setCharacterFilter: state.setAudioAlignmentCharacterFilter,
    activeRecordingLineId: state.activeRecordingLineId,
    setActiveRecordingLineId: state.setActiveRecordingLineId,
    webSocketStatus: state.webSocketStatus,
    webSocketConnect: state.webSocketConnect,
    multiSelectedChapterIds: state.audioAlignmentMultiSelectedChapterIds,
    setMultiSelectedChapterIds: state.setAudioAlignmentMultiSelectedChapterIds,
    lufsSettings: state.lufsSettings,
    setLufsSettings: state.setLufsSettings,
    isRecordingMode: state.isRecordingMode,
    setRecordingMode: state.setRecordingMode,
  }));

  const {
    projects, characters, selectedProjectId, selectedChapterId, setSelectedChapterId,
    assignAudioToLine, resegmentAndRealignAudio, navigateTo,
    openConfirmModal, clearAudioFromChapters, waveformEditorState, openWaveformEditor,
    closeWaveformEditor, cvFilter, setCvFilter, characterFilter, setCharacterFilter,
    activeRecordingLineId, setActiveRecordingLineId, webSocketStatus, webSocketConnect,
    multiSelectedChapterIds, setMultiSelectedChapterIds, lufsSettings, setLufsSettings,
    isRecordingMode, setRecordingMode
  } = store;

  const lineRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingToReaper, setIsExportingToReaper] = useState(false);
  const [isSilenceSettingsModalOpen, setIsSilenceSettingsModalOpen] = useState(false);
  const [lastSelectedChapterForShiftClick, setLastSelectedChapterForShiftClick] = useState<string | null>(null);
  const currentProject = projects.find(p => p.id === selectedProjectId);

  useEffect(() => {
    if (activeRecordingLineId) {
      const lineElement = lineRefs.current.get(activeRecordingLineId);
      if (lineElement) {
        lineElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeRecordingLineId]);
  
  const {
    isSmartMatchLoading,
    handleFileSelectionForSmartMatch,
    isChapterMatchLoading,
    handleFileSelectionForChapterMatch,
    isReturnMatchLoading,
    handleFileSelectionForReturnMatch,
  } = useAudioFileMatcher({
    currentProject,
    characters,
    assignAudioToLine,
    multiSelectedChapterIds,
  });

  const {
    isAsrSupported,
    isAsrAlignLoading,
    handleFileSelectionForAsrAlign,
  } = useAsrAutoAligner({
    currentProject,
    selectedChapterId,
    characters,
    assignAudioToLine,
  });

  const { projectCharacters, projectCvNames } = useMemo<{ projectCharacters: Character[], projectCvNames: string[] }>(() => {
    if (!currentProject) {
        return { projectCharacters: [], projectCvNames: [] };
    }
    const projChars = characters.filter(c => !c.projectId || c.projectId === selectedProjectId);
    const cvs = projChars.reduce<string[]>((acc, c) => {
        if (c.cvName && !acc.includes(c.cvName)) {
            acc.push(c.cvName);
        }
        return acc;
    }, []).sort();
    return { projectCharacters: projChars, projectCvNames: cvs };
  }, [currentProject, characters, selectedProjectId]);

  const selectedChapter = currentProject?.chapters.find(c => c.id === selectedChapterId);
  const selectedChapterIndex = currentProject?.chapters.findIndex(c => c.id === selectedChapterId);

  const nonAudioCharacterIds = useMemo(() => {
    return characters
      .filter(c => c.name === '[静音]' || c.name === '音效' || c.name === '[音效]')
      .map(c => c.id);
  }, [characters]);

  const visibleScriptLines = useMemo(() => {
    if (!selectedChapter) return [];
    if (nonAudioCharacterIds.length === 0) return selectedChapter.scriptLines;
    return selectedChapter.scriptLines.filter(line => !nonAudioCharacterIds.includes(line.characterId || ''));
  }, [selectedChapter, nonAudioCharacterIds]);
  
  const {
      currentPage,
      totalPages,
      paginatedChapters,
      handlePageChange,
      allVisibleChaptersSelected,
      handleToggleSelectAllOnPage,
  } = usePaginatedChapters({
      chapters: currentProject?.chapters || [],
      projectId: currentProject?.id,
      initialSelectedChapterIdForViewing: selectedChapterId,
      onSelectChapterForViewing: setSelectedChapterId,
      multiSelectedChapterIds: multiSelectedChapterIds,
      setMultiSelectedChapterIdsContext: setMultiSelectedChapterIds,
      onPageChangeSideEffects: useCallback(() => setLastSelectedChapterForShiftClick(null), []),
      chaptersPerPage: 100,
  });

  const onGoBack = () => {
    selectedProjectId ? navigateTo("editor") : navigateTo("dashboard");
  }

  const handleExportToReaper = async () => {
    if (!currentProject) return;
    const chaptersToExport = multiSelectedChapterIds.length > 0
        ? currentProject.chapters.filter(c => multiSelectedChapterIds.includes(c.id))
        : (selectedChapter ? [selectedChapter] : []);

    if (chaptersToExport.length === 0) {
        alert('没有可导出的章节。');
        return;
    }

    const hasAudio = chaptersToExport.some(c => c.scriptLines.some(l => l.audioBlobId));
    if (!hasAudio) {
        alert('所选章节内没有已对轨的音频可供导出。');
        return;
    }
    
    setIsExportingToReaper(true);
    try {
        await exportToReaperProject(currentProject, chaptersToExport, characters);
    } catch (error) {
        console.error("导出到Reaper时出错:", error);
        alert(`导出到Reaper时出错: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
        setIsExportingToReaper(false);
    }
  };

  const handleExport = async (scope: 'current' | 'all') => {
    if (!currentProject) return;
    setIsExportModalOpen(false);
    setIsExporting(true);

    try {
        const chaptersToExport = scope === 'current'
            ? selectedChapter ? [selectedChapter] : []
            : currentProject.chapters;

        if (chaptersToExport.length === 0) {
            alert('没有可导出的章节。');
            return;
        }

        const linesWithAudio = [];
        for (const chapter of chaptersToExport) {
            for (const line of chapter.scriptLines) {
                if (line.audioBlobId) {
                    const audioBlobFromDb = await db.audioBlobs.get(line.audioBlobId);
                    if (audioBlobFromDb) {
                        linesWithAudio.push({
                            line,
                            audioBlob: audioBlobFromDb.data,
                        });
                    }
                }
            }
        }

        if (linesWithAudio.length === 0) {
            alert('所选范围内没有已对轨的音频可供导出。');
            return;
        }

        const waveBlob = await exportAudioWithMarkers(
            linesWithAudio,
            currentProject,
            characters,
            { enabled: lufsSettings.enabled, target: lufsSettings.target }
        );
        
        const url = URL.createObjectURL(waveBlob);
        const a = document.createElement('a');
        a.href = url;
        const fileNameScope = scope === 'current' && selectedChapter ? selectedChapter.title.replace(/[<>:"/\\|?*]+/g, '_') : 'AllChapters';
        a.download = `${currentProject.name}_${fileNameScope}_Marked.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

    } catch (error) {
        console.error("导出音频时出错:", error);
        alert(`导出音频时出错: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
        setIsExporting(false);
    }
  };

  const multiSelectCount = multiSelectedChapterIds.length;
  const handleReconnect = useCallback(() => {
    if (webSocketConnect) {
      webSocketConnect();
    }
  }, [webSocketConnect]);
  
  const hasAudioInSelection = useMemo(() => {
      if (!currentProject) return false;
      if (multiSelectCount > 0) {
          return currentProject.chapters
              .filter(c => multiSelectedChapterIds.includes(c.id))
              .some(c => c.scriptLines.some(l => l.audioBlobId));
      }
      return selectedChapter?.scriptLines.some(l => l.audioBlobId) || false;
  }, [selectedChapter, multiSelectedChapterIds, currentProject, multiSelectCount]);

  const handleClearAudio = () => {
      if (!currentProject) return;
      const idsToClear = multiSelectCount > 0 ? multiSelectedChapterIds : (selectedChapterId ? [selectedChapterId] : []);
      if (idsToClear.length === 0) return;

      const chaptersToClear = currentProject.chapters.filter(c => idsToClear.includes(c.id));
      const chapterTitles = chaptersToClear.map(c => `"${c.title}"`).join(', ');

      openConfirmModal(
        "清除音频确认",
        <>您确定要清除 {chaptersToClear.length > 1 ? `这 ${chaptersToClear.length} 个章节` : `章节`} <strong className="text-sky-300">{chapterTitles}</strong> 的所有已对轨音频吗？<br/>此操作无法撤销。</>,
        () => {
          clearAudioFromChapters(currentProject.id, idsToClear);
        },
        "全部清除",
        "取消"
      );
  };

  const handleCalibrationSave = async (sourceAudioId: string, markers: number[]) => {
    if (currentProject) {
        await resegmentAndRealignAudio(currentProject.id, sourceAudioId, markers);
    }
    closeWaveformEditor();
  };

  const handleToggleMultiSelect = useCallback((chapterId: string, event: React.MouseEvent) => {
    if (!currentProject) return;

    if (event.shiftKey && lastSelectedChapterForShiftClick) {
        const allChapterIds = currentProject.chapters.map(ch => ch.id);
        const lastIndex = allChapterIds.indexOf(lastSelectedChapterForShiftClick);
        const currentIndex = allChapterIds.indexOf(chapterId);

        if (lastIndex !== -1 && currentIndex !== -1) {
            const start = Math.min(lastIndex, currentIndex);
            const end = Math.max(lastIndex, currentIndex);
            const idsToSelect = allChapterIds.slice(start, end + 1);
            
            setMultiSelectedChapterIds(
                Array.from(new Set([...multiSelectedChapterIds, ...idsToSelect]))
            );
            return;
        }
    }
    
    // FIX: The `setMultiSelectedChapterIds` function from the Zustand store does not support functional updates.
    // The new state is calculated from the `multiSelectedChapterIds` state variable before being passed to the setter.
    const newIds = multiSelectedChapterIds.includes(chapterId)
      ? multiSelectedChapterIds.filter(id => id !== chapterId)
      : [...multiSelectedChapterIds, chapterId];
    setMultiSelectedChapterIds(newIds);
    setLastSelectedChapterForShiftClick(chapterId);
}, [lastSelectedChapterForShiftClick, currentProject, setMultiSelectedChapterIds, multiSelectedChapterIds]);
  
  if (!currentProject) {
    return (
      <div className="p-6 h-full flex flex-col items-center justify-center bg-slate-900 text-slate-100">
        <h1 className="text-2xl font-bold text-sky-400">音频对轨</h1>
        <p className="mt-4 text-slate-400">请先从项目面板选择一个项目。</p>
        <button
            onClick={onGoBack}
            className="mt-6 flex items-center text-sm text-sky-300 hover:text-sky-100 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-md"
        >
          <ChevronLeftIcon className="w-4 h-4 mr-1" /> 返回项目面板
        </button>
      </div>
    );
  }
  
  const hasAudioInProject = currentProject.chapters.some(c => c.scriptLines.some(l => l.audioBlobId));
  
  return (
    <div className="h-full flex flex-col bg-slate-900 text-slate-100">
        <AudioAlignmentHeader
            currentProjectName={currentProject.name}
            webSocketStatus={webSocketStatus}
            isRecordingMode={isRecordingMode}
            onToggleRecordingMode={() => setRecordingMode(!isRecordingMode)}
            cvFilter={cvFilter}
            onCvFilterChange={setCvFilter}
            characterFilter={characterFilter}
            onCharacterFilterChange={setCharacterFilter}
            projectCharacters={projectCharacters}
            projectCvNames={projectCvNames}
            onOpenSilenceSettings={() => setIsSilenceSettingsModalOpen(true)}
            lufsSettings={lufsSettings}
            onLufsSettingsChange={setLufsSettings}
            isSmartMatchLoading={isSmartMatchLoading}
            isChapterMatchLoading={isChapterMatchLoading}
            onOpenExportModal={() => setIsExportModalOpen(true)}
            isExporting={isExporting}
            isExportingToReaper={isExportingToReaper}
            onExportToReaper={handleExportToReaper}
            onClearAudio={handleClearAudio}
            hasAudioInSelection={hasAudioInSelection}
            multiSelectCount={multiSelectCount}
            onGoBack={onGoBack}
            onFileSelectionForSmartMatch={handleFileSelectionForSmartMatch}
            onFileSelectionForChapterMatch={handleFileSelectionForChapterMatch}
            isReturnMatchLoading={isReturnMatchLoading}
            onFileSelectionForReturnMatch={handleFileSelectionForReturnMatch}
            isAsrAlignSupported={isAsrSupported}
            isAsrAlignLoading={isAsrAlignLoading}
            onFileSelectionForAsrAlign={handleFileSelectionForAsrAlign}
            onReconnect={handleReconnect}
        />
        <div className="flex flex-grow overflow-hidden">
            <ResizablePanels
            leftPanel={
                <ChapterListPanel
                    currentProjectChapters={currentProject.chapters}
                    paginatedChapters={paginatedChapters}
                    multiSelectedChapterIds={multiSelectedChapterIds}
                    selectedChapterId={selectedChapterId}
                    handleToggleMultiSelect={handleToggleMultiSelect}
                    setSelectedChapterId={setSelectedChapterId}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    handlePageChange={handlePageChange}
                    allVisibleChaptersSelected={allVisibleChaptersSelected}
                    handleToggleSelectAllOnPage={handleToggleSelectAllOnPage}
                />
            }
            rightPanel={
                <main 
                    className="flex-grow p-4 overflow-y-auto transition-all" 
                    style={{ paddingBottom: store.playingLineInfo ? '8rem' : '1rem' }}
                >
                    <ScriptLineList
                        selectedChapter={selectedChapter}
                        selectedChapterIndex={selectedChapterIndex!}
                        visibleScriptLines={visibleScriptLines}
                        characters={characters}
                        isRecordingMode={isRecordingMode}
                        cvFilter={cvFilter}
                        characterFilter={characterFilter}
                        activeRecordingLineId={activeRecordingLineId}
                        setActiveRecordingLineId={setActiveRecordingLineId}
                        openWaveformEditor={openWaveformEditor}
                        lineRefs={lineRefs}
                        projectId={currentProject.id}
                    />
                </main>
            }
            initialLeftWidthPercent={25}
            />
        </div>
        <GlobalAudioPlayer />
        <ExportAudioModal
            isOpen={isExportModalOpen}
            onClose={() => setIsExportModalOpen(false)}
            onExport={handleExport}
            currentChapterIndex={selectedChapterIndex! > -1 ? selectedChapterIndex : null}
            currentChapterTitle={selectedChapter?.title || null}
            projectTitle={currentProject.name}
            hasAudioInProject={hasAudioInProject}
        />
      
       {currentProject && (
          <SilenceSettingsModal
              isOpen={isSilenceSettingsModalOpen}
              onClose={() => setIsSilenceSettingsModalOpen(false)}
              project={currentProject}
          />
       )}
       {waveformEditorState.isOpen && waveformEditorState.sourceAudioInfo && (
          <AudioWaveformEditor
            isOpen={waveformEditorState.isOpen}
            onClose={closeWaveformEditor}
            sourceAudioInfo={waveformEditorState.sourceAudioInfo}
            currentLineId={waveformEditorState.lineId}
            currentLineIndex={waveformEditorState.lineIndex}
            onSave={handleCalibrationSave}
          />
       )}
    </div>
  );
};

export default AudioAlignmentPage;
