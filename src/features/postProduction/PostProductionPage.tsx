import React, { useState, useMemo, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { ChevronLeftIcon, ClearFormattingIcon, ArrowDownOnSquareIcon } from '../../components/ui/icons';
import { DialogueContent } from './components/DialogueContent';
import SoundLibraryPanel from './components/SoundLibraryPanel';
import AddSceneModal from './components/AddSceneModal';
import AddBgmModal from './components/AddBgmModal';
import AddSfxModal from './components/AddSfxModal';
import SoundGroupModal from './components/SoundGroupModal';
import EditMarkerModal from './components/EditMarkerModal';
import SoundAssistantSettingsModal from './components/SoundAssistantSettingsModal';
import PostTextAssistantModal from './components/PostTextAssistantModal';
import { usePostProduction } from './hooks/usePostProduction';
import { usePaginatedChapters } from '../../features/scriptEditor/hooks/usePaginatedChapters';
import { exportPostProductionToReaper } from '../../services/postProductionReaperExporter';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Timeline from './components/timeline/Timeline';
import ResizablePanels from '../../components/ui/ResizablePanels';
import ResizableVerticalPanels from '../../components/ui/ResizableVerticalPanels';
import { TextMarker } from '../../types';

const parseChapterFilter = (
    raw: string,
): { kind: 'none' } | { kind: 'single'; n: number } | { kind: 'range'; start: number; end: number } | { kind: 'keyword'; keyword: string } => {
    const s = (raw || '').trim();
    if (!s) return { kind: 'none' };

    const range = s.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
        const start = parseInt(range[1], 10);
        const end = parseInt(range[2], 10);
        if (Number.isFinite(start) && Number.isFinite(end)) {
            return start <= end ? { kind: 'range', start, end } : { kind: 'range', start: end, end: start };
        }
    }

    if (/^\d+$/.test(s)) {
        const n = parseInt(s, 10);
        if (Number.isFinite(n)) return { kind: 'single', n };
    }

    return { kind: 'keyword', keyword: s };
};

const PostProductionPage: React.FC = () => {
    const { navigateTo, soundLibrary, soundObservationList, characters, selectedChapterId: initialChapterId, postProductionLufsSettings, setSelectedChapterId } = useStore(state => ({
        navigateTo: state.navigateTo,
        soundLibrary: state.soundLibrary,
        soundObservationList: state.soundObservationList,
        characters: state.characters,
        selectedChapterId: state.selectedChapterId,
        postProductionLufsSettings: state.postProductionLufsSettings,
        setSelectedChapterId: state.setSelectedChapterId,
    }));

    const {
        currentProject,
        textMarkers,
        soundGroups,
        selectedRange,
        isSceneModalOpen,
        isBgmModalOpen,
        isSfxModalOpen,
        isSoundGroupModalOpen,
        editingMarker,
        suspendLayout,
        handleTextSelect,
        openSceneModal,
        closeSceneModal,
        openBgmModal,
        closeBgmModal,
        openSfxModal,
        closeSfxModal,
        openSoundGroupModal,
        closeSoundGroupModal,
        openEditModal,
        closeEditModal,
        handleSaveScene,
        handleSaveBgm,
        handleSaveSfx,
        handleInsertSoundGroup,
        handleUpsertSoundGroup,
        handleDeleteSoundGroup,
        handleDeleteMarker,
        handleRenameMarker,
        handleUpdateRangeFromSelection,
        handleUpdateAnchorFromSelection,
        handleChangeSfxGroupMarkerGroup,
        handleUpdateColor,
        handlePinSound,
        handleClearFormatting,
        updateLineText,
    } = usePostProduction();

    const [isSoundAssistantSettingsOpen, setIsSoundAssistantSettingsOpen] = useState(false);
    const [isPostTextAssistantOpen, setIsPostTextAssistantOpen] = useState(false);
    const [chapterFilter, setChapterFilter] = useState('');
    const [expandedChapterId, setExpandedChapterId] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<{ top: number; left: number; range: Range } | null>(null);
    const [isExportingToReaper, setIsExportingToReaper] = useState(false);
    const [reaperExportAudioFormat, setReaperExportAudioFormat] = useState<'wav' | 'mp3'>('mp3');


    useEffect(() => {
        const handleClickOutside = () => {
            setContextMenu(null);
        };
        if (contextMenu) {
            window.addEventListener('click', handleClickOutside, { once: true });
        }
        return () => {
            window.removeEventListener('click', handleClickOutside);
        };
    }, [contextMenu]);

    const handleContextMenuRequest = (event: React.MouseEvent, range: Range) => {
        setContextMenu({ top: event.clientY, left: event.clientX, range });
    };

    const projectCharacters = useMemo(() => {
        if (!currentProject) return [];
        return characters.filter(c => !c.projectId || c.projectId === currentProject.id);
    }, [currentProject, characters]);

    const silentCharIds = useMemo(() => {
        return projectCharacters.filter(c => c.name === '[静音]').map(c => c.id);
    }, [projectCharacters]);

    const chaptersForDisplay = useMemo(() => {
        if (!currentProject) return [];
        if (silentCharIds.length === 0) return currentProject.chapters;

        return currentProject.chapters.map(chapter => ({
            ...chapter,
            scriptLines: chapter.scriptLines.filter(line => !line.characterId || !silentCharIds.includes(line.characterId))
        }));
    }, [currentProject, silentCharIds]);

    const filteredChaptersForDisplay = useMemo(() => {
        const parsed = parseChapterFilter(chapterFilter);
        if (parsed.kind === 'none') return chaptersForDisplay;
        const matches = (title: string, index: number) => {
            const chapterNum = index + 1;
            if (parsed.kind === 'range') {
                return chapterNum >= parsed.start && chapterNum <= parsed.end;
            }
            if (parsed.kind === 'single') {
                return chapterNum === parsed.n;
            }
            if (parsed.kind === 'keyword') {
                return title.includes(parsed.keyword);
            }
            return true;
        };
        return chaptersForDisplay.filter((ch, idx) => matches(ch.title, idx));
    }, [chaptersForDisplay, chapterFilter]);

    const chaptersForPostTextAssistant = useMemo(() => {
        const parsed = parseChapterFilter(chapterFilter);
        if (parsed.kind !== 'none') return filteredChaptersForDisplay;

        const selectedId = expandedChapterId || initialChapterId;
        if (!selectedId) return chaptersForDisplay;
        const selected = chaptersForDisplay.find((c) => c.id === selectedId);
        return selected ? [selected] : chaptersForDisplay;
    }, [chapterFilter, filteredChaptersForDisplay, expandedChapterId, initialChapterId, chaptersForDisplay]);

    const exportScopeLabel = useMemo(() => {
        const parsed = parseChapterFilter(chapterFilter);
        if (parsed.kind !== 'none') {
            return `筛选章节：${chapterFilter.trim()}`;
        }
        const selectedId = expandedChapterId || initialChapterId;
        if (!selectedId) return '全部章节';
        const idx = chaptersForDisplay.findIndex((c) => c.id === selectedId);
        const chapterNum = idx >= 0 ? idx + 1 : null;
        const title = chaptersForDisplay.find((c) => c.id === selectedId)?.title;
        if (title && chapterNum) return `当前章节：第${chapterNum}章 ${title}`;
        if (title) return `当前章节：${title}`;
        if (chapterNum) return `当前章节：第${chapterNum}章`;
        return '当前章节';
    }, [chapterFilter, expandedChapterId, initialChapterId, chaptersForDisplay]);

    const {
      currentPage,
      totalPages,
      paginatedChapters,
      handlePageChange,
    } = usePaginatedChapters({
      chapters: filteredChaptersForDisplay,
      projectId: currentProject?.id,
      initialSelectedChapterIdForViewing: initialChapterId,
      onSelectChapterForViewing: (id) => {
        if (id) {
          setExpandedChapterId(id);
          void setSelectedChapterId(id);
        }
      },
      multiSelectedChapterIds: [],
      setMultiSelectedChapterIdsContext: () => {},
      onPageChangeSideEffects: () => {},
      chaptersPerPage: 100,
    });
    
    useEffect(() => {
        if (initialChapterId) {
            setExpandedChapterId(initialChapterId);
            void setSelectedChapterId(initialChapterId);
        }
    }, [initialChapterId, setSelectedChapterId]);


    useEffect(() => {
        (window as any).__openEditMarker = openEditModal;
        return () => { delete (window as any).__openEditMarker; };
    }, [openEditModal]);

    const handleExportToReaper = async () => {
        if (!currentProject) return;
    
        const parsed = parseChapterFilter(chapterFilter);
        const chaptersToExport =
            parsed.kind === 'none'
                ? (() => {
                      const selectedId = expandedChapterId || initialChapterId;
                      if (!selectedId) return chaptersForDisplay;
                      const selected = chaptersForDisplay.find((c) => c.id === selectedId);
                      return selected ? [selected] : chaptersForDisplay;
                  })()
                : filteredChaptersForDisplay;
    
        if (chaptersToExport.length === 0) {
            alert('未找到可导出的章节（请检查“章节筛选”或当前展开的章节）。');
            return;
        }
    
        const hasAudio = chaptersToExport.some(c => c.scriptLines.some(l => l.audioBlobId));
        if (!hasAudio) {
            alert('项目内没有已对轨的音频可供导出。');
            return;
        }
        
        setIsExportingToReaper(true);
        try {
            await exportPostProductionToReaper(
                currentProject,
                chaptersToExport,
                characters,
                soundLibrary,
                postProductionLufsSettings,
                { audioFormat: reaperExportAudioFormat, mp3BitrateKbps: 192 },
            );
        } catch (error) {
            console.error("导出到Reaper时出错:", error);
            alert(`导出到Reaper时出错: ${error instanceof Error ? error.message : '未知错误'}`);
        } finally {
            setIsExportingToReaper(false);
        }
    };

    if (!currentProject) {
        return (
            <div className="p-6 h-full flex flex-col items-center justify-center bg-slate-900 text-slate-100">
                <h1 className="text-2xl font-bold text-sky-400">后期制作</h1>
                <p className="mt-4 text-slate-400">请先从项目面板选择一个项目。</p>
                 <button onClick={() => navigateTo('dashboard')} className="mt-6 flex items-center text-sm text-sky-300 hover:text-sky-100 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-md">
                   <ChevronLeftIcon className="w-4 h-4 mr-1" /> 返回项目面板
                 </button>
            </div>
        );
    }
    
    // FIX: The type checker was inferring `m.name` as potentially `undefined`, causing `new Set` to be of type `Set<unknown>`.
    // Added a type guard `(m): m is TextMarker & { name: string } => ...` to ensure that `m.name` is a `string` before mapping, satisfying the type requirements for creating a `Set<string>`.
    const existingSceneNames = useMemo(() => Array.from(new Set(textMarkers.filter((m): m is TextMarker & { name: string } => m.type === 'scene' && !!m.name).map(m => m.name))), [textMarkers]);

    const soundGroupUsageCountById = useMemo(() => {
        const map: Record<string, number> = {};
        for (const m of textMarkers) {
            if (m.type !== 'sfxGroup') continue;
            const gid = (m.groupId || '').trim();
            if (!gid) continue;
            map[gid] = (map[gid] || 0) + 1;
        }
        return map;
    }, [textMarkers]);

    return (
        <div className="h-full flex flex-col bg-slate-900 text-slate-100">
            <header className="flex items-center justify-between p-3 border-b border-slate-800 flex-shrink-0">
                <h1 className="text-xl font-bold text-sky-400 truncate pr-4">
                    后期制作: <span className="text-slate-200">{currentProject.name}</span>
                </h1>
                <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-2">
                        <label htmlFor="chapter-filter" className="text-sm text-slate-300 whitespace-nowrap">章节筛选:</label>
                        <input
                            id="chapter-filter"
                            value={chapterFilter}
                            onChange={(e) => setChapterFilter(e.target.value)}
                            placeholder="例如 6 或 3-8 或 关键词"
                            className="w-44 px-2 py-1.5 text-sm bg-slate-700 text-slate-100 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500"
                        />
                    </div>
                    <button onClick={() => setIsPostTextAssistantOpen(true)} className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-700 rounded-md">后期文本辅助</button>
                    <button onClick={openSceneModal} disabled={!selectedRange} className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50">添加场景</button>
                    <button onClick={() => openBgmModal()} disabled={!selectedRange} className="px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 rounded-md disabled:opacity-50">添加 BGM</button>
                    <button onClick={() => openSfxModal()} disabled={!selectedRange} title={!selectedRange ? '请先在文本中点击定位或选择一段文本' : ''} className="px-3 py-1.5 text-sm bg-rose-600 hover:bg-rose-700 rounded-md disabled:opacity-50">添加音效</button>
                    <button onClick={() => openSoundGroupModal()} disabled={!selectedRange} title={!selectedRange ? '请先在文本中点击定位或选择一段文本' : ''} className="px-3 py-1.5 text-sm bg-cyan-600 hover:bg-cyan-700 rounded-md disabled:opacity-50">插入音效组</button>
                    <button onClick={handleClearFormatting} disabled={!selectedRange} className="flex items-center px-3 py-1.5 text-sm bg-yellow-600 hover:bg-yellow-700 rounded-md disabled:opacity-50">
                        <ClearFormattingIcon className="w-4 h-4 mr-1.5" />
                        清除格式
                    </button>
                    <button onClick={() => setIsSoundAssistantSettingsOpen(true)} className="px-3 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 rounded-md">音效助手设置</button>
                    <div className="flex items-center space-x-2">
                        <label htmlFor="reaper-export-audio-format" className="text-sm text-slate-300 whitespace-nowrap">Reaper 素材:</label>
                        <select
                            id="reaper-export-audio-format"
                            value={reaperExportAudioFormat}
                            onChange={(e) => setReaperExportAudioFormat(e.target.value as 'wav' | 'mp3')}
                            className="px-2 py-1.5 text-sm bg-slate-700 text-slate-100 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500"
                            title={reaperExportAudioFormat === 'mp3' ? 'MP3 文件更小，但有损压缩；极少数情况下可能出现微小对齐差异' : 'WAV 文件更大，但最利于精准对齐与后期处理'}
                        >
                            <option value="mp3">MP3（更小/192kbps）</option>
                            <option value="wav">WAV（更大/更准）</option>
                        </select>
                    </div>
                    <button
                        onClick={handleExportToReaper}
                        disabled={isExportingToReaper}
                        className="flex items-center text-sm text-teal-300 hover:text-teal-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md disabled:opacity-50"
                        aria-label="导出到 Reaper"
                        title={`导出到 Reaper（${exportScopeLabel}）`}
                    >
                        {isExportingToReaper ? <LoadingSpinner /> : <ArrowDownOnSquareIcon className="w-4 h-4 mr-1" />}
                        {isExportingToReaper ? '导出中...' : '导出到 Reaper'}
                    </button>
                    <button onClick={() => navigateTo('editor')} className="flex items-center text-sm text-sky-300 hover:text-sky-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md">
                        <ChevronLeftIcon className="w-4 h-4 mr-1" /> 返回
                    </button>
                </div>
            </header>
            
            <div className="flex-grow overflow-hidden">
                <ResizableVerticalPanels
                    initialTopHeightPercent={65}
                    topPanel={
                        <ResizablePanels
                            leftPanel={<SoundLibraryPanel />}
                            rightPanel={
                                <DialogueContent
                                    chapters={paginatedChapters}
                                    allProjectChapters={currentProject.chapters}
                                    characters={projectCharacters}
                                    onTextSelect={handleTextSelect}
                                    textMarkers={textMarkers}
                                    suspendLayout={suspendLayout}
                                    soundLibrary={soundLibrary}
                                    soundObservationList={soundObservationList}
                                    expandedChapterId={expandedChapterId}
                                    setExpandedChapterId={(id) => {
                                        setExpandedChapterId(id);
                                        if (id) {
                                            void setSelectedChapterId(id);
                                        }
                                    }}
                                    currentPage={currentPage}
                                    totalPages={totalPages}
                                    onPageChange={handlePageChange}
                                    onContextMenuRequest={handleContextMenuRequest}
                                    currentProject={currentProject}
                                    onPinSound={handlePinSound}
                                    onUpdateLineText={updateLineText}
                                    onOpenEditMarker={openEditModal}
                                />
                            }
                            initialLeftWidthPercent={25}
                        />
                    }
                    bottomPanel={<Timeline />}
                />
            </div>


            {contextMenu && (
                <div
                    style={{ top: contextMenu.top, left: contextMenu.left }}
                    className="absolute z-50 bg-slate-700 rounded-md shadow-lg border border-slate-600 text-sm p-1"
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        onClick={() => {
                            openSfxModal(contextMenu.range);
                            setContextMenu(null);
                        }}
                        className="block w-full text-left px-3 py-1.5 text-slate-100 hover:bg-sky-600 rounded-md"
                    >
                        在此处添加音效...
                    </button>
                    <button
                        onClick={() => {
                            openBgmModal(contextMenu.range);
                            setContextMenu(null);
                        }}
                        className="block w-full text-left px-3 py-1.5 text-slate-100 hover:bg-sky-600 rounded-md"
                    >
                        在此处添加BGM...
                    </button>
                    <button
                        onClick={() => {
                            openSoundGroupModal(contextMenu.range);
                            setContextMenu(null);
                        }}
                        className="block w-full text-left px-3 py-1.5 text-slate-100 hover:bg-sky-600 rounded-md"
                    >
                        在此处插入音效组...
                    </button>
                </div>
            )}
            
            <AddSceneModal 
                isOpen={isSceneModalOpen} 
                onClose={closeSceneModal}
                onSave={handleSaveScene}
                existingSceneNames={existingSceneNames}
            />
            <AddBgmModal
                isOpen={isBgmModalOpen}
                onClose={closeBgmModal}
                onSave={handleSaveBgm}
            />
            <AddSfxModal
                isOpen={isSfxModalOpen}
                onClose={closeSfxModal}
                onSave={handleSaveSfx}
            />
            <SoundGroupModal
                isOpen={isSoundGroupModalOpen}
                onClose={closeSoundGroupModal}
                onInsert={handleInsertSoundGroup}
                soundLibrary={soundLibrary}
                soundGroups={soundGroups}
                onUpsertGroup={handleUpsertSoundGroup}
                onDeleteGroup={handleDeleteSoundGroup}
                groupUsageCountById={soundGroupUsageCountById}
            />
            <EditMarkerModal
                isOpen={!!editingMarker && (editingMarker.type === 'scene' || editingMarker.type === 'sfxGroup')}
                marker={editingMarker && (editingMarker.type === 'scene' || editingMarker.type === 'sfxGroup') ? editingMarker : null}
                onClose={closeEditModal}
                onDelete={handleDeleteMarker}
                onRename={handleRenameMarker}
                onUpdateRangeFromSelection={handleUpdateRangeFromSelection}
                onUpdateAnchorFromSelection={handleUpdateAnchorFromSelection}
                onUpdateColor={handleUpdateColor}
                soundGroups={soundGroups}
                onChangeSfxGroup={handleChangeSfxGroupMarkerGroup}
                soundLibrary={soundLibrary}
            />
            <SoundAssistantSettingsModal
                isOpen={isSoundAssistantSettingsOpen}
                onClose={() => setIsSoundAssistantSettingsOpen(false)}
            />
            <PostTextAssistantModal
                isOpen={isPostTextAssistantOpen}
                onClose={() => setIsPostTextAssistantOpen(false)}
                chapters={chaptersForPostTextAssistant}
                projectId={currentProject.id}
                characters={projectCharacters}
            />
        </div>
    );
};

export default PostProductionPage;
