import React, { useState, useCallback, useMemo } from 'react';
import { Chapter } from '../../../../types';
import { useEditorContext } from '../../contexts/EditorContext';

import { usePaginatedChapters } from '../../hooks/usePaginatedChapters';
import { useChapterTitleEditor } from '../../hooks/useChapterTitleEditor';
import { useChapterActions } from '../../hooks/useChapterActions';

import ChapterListHeader from './ChapterListHeader';
import ChapterListActions from './ChapterListActions';
import ChapterListItem from './ChapterListItem';
import ChapterPagination from './ChapterPagination';
import BatchModifyModal from './BatchModifyModal';
import MergeChaptersModal from './MergeChaptersModal';
import ExportScriptModal, { ExportOption } from './ExportScriptModal';
import { exportChaptersToDocx } from '../../services/docxExporter';
import BatchAddChaptersModal from './BatchAddChaptersModal';
// FIX: Import `useStore` to resolve "Cannot find name 'useStore'" error.
import { useStore } from '../../../../store/useStore';
import ExportChaptersPatchModal, { type ChaptersPatchExportOption } from './ExportChaptersPatchModal';
import { buildChaptersPatch, formatDateForFilename, parseChaptersPatchJson, sanitizeFilename } from '../../services/chaptersPatch';
import type { ChaptersPatchV1 } from '../../services/chaptersPatch';
import type { Character, ScriptLine } from '../../../../types';
import { normalizeCharacterNameKey } from '../../../../lib/characterName';

const ChapterListPanel: React.FC = () => {
    const {
        currentProject,
        characters,
        selectedChapterId,
        setSelectedChapterId,
        multiSelectedChapterIds,
        setMultiSelectedChapterIds,
        undoableParseProjectChapters,
        undoableUpdateChapterTitle,
        deleteChapters,
        mergeChapters,
        isLoadingAiAnnotation,
        isLoadingManualParse,
        isLoadingImportAnnotation,
        isLocalCodexTaskRunning,
        runAiAnnotationForChapters,
        runManualParseForChapters,
        openImportModal,
        cvFilter,
        setCvFilter,
        batchAddChapters,
        insertChapterAfter,
    } = useEditorContext();

    const [isBatchModifyModalOpen, setIsBatchModifyModalOpen] = useState(false);
    const [isBatchAddModalOpen, setIsBatchAddModalOpen] = useState(false);
    const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isExportPatchModalOpen, setIsExportPatchModalOpen] = useState(false);
    const [lastSelectedChapterForShiftClick, setLastSelectedChapterForShiftClick] = useState<string | null>(null);
    const importPatchInputRef = React.useRef<HTMLInputElement>(null);

    const openConfirmModal = useStore((s) => s.openConfirmModal);

    const filteredChapters = useMemo(() => {
        if (!currentProject) return [];
        if (!cvFilter) {
            return currentProject.chapters;
        }

        const characterIdsForCv = characters
            .filter(c => c.cvName === cvFilter && c.status !== 'merged')
            .map(c => c.id);
        
        const filterFn = (chapter: Chapter) => {
            if (chapter.id === selectedChapterId) return true;
            if (characterIdsForCv.length === 0) return false;
            return chapter.scriptLines.some(line => 
                line.characterId && characterIdsForCv.includes(line.characterId)
            );
        }

        return currentProject.chapters.filter(filterFn);
    }, [currentProject, cvFilter, characters, selectedChapterId]);

    const {
        currentPage,
        totalPages,
        paginatedChapters,
        handlePageChange,
        allVisibleChaptersSelected,
        handleToggleSelectAllOnPage,
    } = usePaginatedChapters({
        chapters: filteredChapters,
        projectId: currentProject?.id,
        initialSelectedChapterIdForViewing: selectedChapterId,
        onSelectChapterForViewing: setSelectedChapterId,
        multiSelectedChapterIds,
        setMultiSelectedChapterIdsContext: setMultiSelectedChapterIds,
        onPageChangeSideEffects: useCallback(() => {
            setLastSelectedChapterForShiftClick(null);
        }, []),
    });

    const chapterActions = useChapterActions({
        currentProject,
        multiSelectedChapterIds,
        selectedChapterIdForViewing: selectedChapterId,
        paginatedChapters,
        isLoadingAiAnnotation,
        isLoadingImportAnnotation,
        isLocalCodexTaskRunning,
        isLoadingManualParse,
        onRunAiAnnotationForChapters: runAiAnnotationForChapters,
        onRunManualParseForChapters: runManualParseForChapters,
        onOpenImportModal: openImportModal,
    });

    const { isAnyOperationLoading } = chapterActions;

    const {
        editingChapterId,
        isEditingTitle,
        editingTitleInput,
        handleStartEditChapterTitle,
        handleEditingTitleInputChange,
        handleSaveChapterTitle,
        handleCancelEditChapterTitle,
    } = useChapterTitleEditor({
        currentProjectChapters: currentProject?.chapters || [],
        onUpdateProjectChapterTitle: undoableUpdateChapterTitle,
        isAnyOperationLoading,
    });

    const handleToggleMultiSelect = useCallback((chapterId: string, event: React.MouseEvent) => {
        if (event.shiftKey && lastSelectedChapterForShiftClick && currentProject) {
            const allChapterIds = currentProject.chapters.map(ch => ch.id);
            const lastIndex = allChapterIds.indexOf(lastSelectedChapterForShiftClick);
            const currentIndex = allChapterIds.indexOf(chapterId);

            if (lastIndex !== -1 && currentIndex !== -1) {
                const start = Math.min(lastIndex, currentIndex);
                const end = Math.max(lastIndex, currentIndex);
                const idsToSelect = allChapterIds.slice(start, end + 1);
                
                setMultiSelectedChapterIds(prev => {
                    const selection = new Set(prev);
                    idsToSelect.forEach(id => selection.add(id));
                    return Array.from(selection);
                });
                return;
            }
        }
        
        setMultiSelectedChapterIds(prev =>
            prev.includes(chapterId)
                ? prev.filter(id => id !== chapterId)
                : [...prev, chapterId]
        );
        setLastSelectedChapterForShiftClick(chapterId);
    }, [lastSelectedChapterForShiftClick, currentProject, setMultiSelectedChapterIds]);


    const handleSelectForViewing = useCallback((chapterId: string) => {
        if (editingChapterId !== chapterId) {
            setSelectedChapterId(chapterId);
        }
    }, [editingChapterId, setSelectedChapterId]);

    const handleBatchDelete = useCallback(() => {
        if (multiSelectedChapterIds.length > 0) {
            deleteChapters(multiSelectedChapterIds);
        }
    }, [multiSelectedChapterIds, deleteChapters]);

    const canMerge = useMemo(() => {
        return multiSelectedChapterIds.length >= 2;
    }, [multiSelectedChapterIds.length]);

    const chaptersToMerge = useMemo(() => {
        if (!currentProject) return [];
        return currentProject.chapters
            .filter(ch => multiSelectedChapterIds.includes(ch.id))
            .sort((a, b) =>
                currentProject.chapters.findIndex(ch => ch.id === a.id) -
                currentProject.chapters.findIndex(ch => ch.id === b.id)
            );
    }, [multiSelectedChapterIds, currentProject]);

    const handleOpenMergeModal = useCallback(() => {
        if (!canMerge) {
            alert('请至少选择两个章节再进行合并');
            return;
        }
        setIsMergeModalOpen(true);
    }, [canMerge]);

    const handleConfirmMerge = useCallback((targetChapterId: string) => {
        if (multiSelectedChapterIds.length < 2) {
            alert('请至少选择两个章节');
            return;
        }
        mergeChapters(multiSelectedChapterIds, targetChapterId);
        setIsMergeModalOpen(false);
        alert('合并完成');
    }, [multiSelectedChapterIds, mergeChapters]);

    const handleExportConfirm = (option: ExportOption) => {
        if (!currentProject) return;
        let chaptersToExport: Chapter[] = [];
        switch (option) {
            case 'all': chaptersToExport = currentProject.chapters; break;
            case 'multi': if (multiSelectedChapterIds.length > 0) chaptersToExport = currentProject.chapters.filter(ch => multiSelectedChapterIds.includes(ch.id)); break;
            case 'view': if (selectedChapterId) { const chapter = currentProject.chapters.find(ch => ch.id === selectedChapterId); if (chapter) chaptersToExport = [chapter]; } break;
        }
        exportChaptersToDocx({ project: currentProject, chaptersToExport, characters });
        setIsExportModalOpen(false);
    };

    const handleExportPatchConfirm = (option: ChaptersPatchExportOption) => {
        if (!currentProject) return;
        let chaptersToExport: Chapter[] = [];
        switch (option) {
            case 'all':
                chaptersToExport = currentProject.chapters;
                break;
            case 'multi':
                if (multiSelectedChapterIds.length > 0) {
                    chaptersToExport = currentProject.chapters.filter(ch => multiSelectedChapterIds.includes(ch.id));
                }
                break;
            case 'view':
                if (selectedChapterId) {
                    const chapter = currentProject.chapters.find(ch => ch.id === selectedChapterId);
                    if (chapter) chaptersToExport = [chapter];
                }
                break;
        }

        if (chaptersToExport.length === 0) {
            alert('没有可导出的章节。');
            setIsExportPatchModalOpen(false);
            return;
        }

        const patch = buildChaptersPatch({ project: currentProject, chapters: chaptersToExport, characters });
        const filename = `${sanitizeFilename(currentProject.name)}_chapters_patch_${formatDateForFilename(patch.createdAt)}.json`;
        const blob = new Blob([JSON.stringify(patch, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setIsExportPatchModalOpen(false);
    };

    const handleOpenImportPatch = () => {
        if (!currentProject) return;
        importPatchInputRef.current?.click();
    };

    const ensureLineBooleans = (line: Partial<ScriptLine>): ScriptLine => {
        return {
            id: String(line.id || `line_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`),
            text: String(line.text || ''),
            originalText: line.originalText,
            characterId: line.characterId,
            // 画本同步不携带音频引用，避免导入后指向不存在的 audioBlob
            audioBlobId: undefined,
            isAiAudioLoading: false,
            isAiAudioSynced: false,
            isTextModifiedManual: Boolean(line.isTextModifiedManual),
            soundType: line.soundType,
            emotion: line.emotion,
            isMarkedForReturn: line.isMarkedForReturn,
            feedback: line.feedback,
            postSilence: line.postSilence,
            ignoredSoundKeywords: line.ignoredSoundKeywords,
            pinnedSounds: line.pinnedSounds,
        };
    };

    const handleImportPatchFile = async (file: File) => {
        if (!currentProject) return;

        let patch: ChaptersPatchV1;
        try {
            const text = await file.text();
            patch = parseChaptersPatchJson(text);
        } catch (e) {
            alert(`导入失败：${e instanceof Error ? e.message : String(e)}`);
            return;
        }

        const proceedImport = (replaceDuplicates: boolean) => {
            const state = useStore.getState();
            const normalizeName = (name: string) => normalizeCharacterNameKey(name);
            const UNKNOWN_ROLE_NAME = '待识别角色';

            const existingChars = state.characters.filter(c => c.projectId === currentProject.id && c.status !== 'merged');
            const charByName = new Map<string, Character>();
            existingChars.forEach(c => charByName.set(normalizeName(c.name), c));

            const patchCharByName = new Map<string, { color: string; textColor?: string; cvName?: string; description?: string; isStyleLockedToCv?: boolean }>();
            patch.characters.forEach(c => {
                patchCharByName.set(normalizeName(c.name), {
                    color: c.color,
                    textColor: c.textColor,
                    cvName: c.cvName,
                    description: c.description,
                    isStyleLockedToCv: c.isStyleLockedToCv,
                });
            });

            const neededNames = new Set<string>();
            patch.chapters.forEach(ch => {
                ch.scriptLines.forEach(l => {
                    const name = (l.characterName || '').trim();
                    if (name) neededNames.add(name);
                });
            });

            for (const name of neededNames) {
                const key = normalizeName(name);
                if (charByName.has(key)) continue;
                const meta = patchCharByName.get(key);
                const created = state.addCharacter(
                    {
                        name,
                        color: meta?.color || 'bg-slate-600',
                        textColor: meta?.textColor || 'text-slate-100',
                        cvName: meta?.cvName || '',
                        description: meta?.description || '',
                        isStyleLockedToCv: meta?.isStyleLockedToCv ?? false,
                    },
                    currentProject.id
                );
                charByName.set(key, created);
            }

            // Ensure Unknown role exists (invariant: never unassigned)
            const unknownKey = normalizeName(UNKNOWN_ROLE_NAME);
            if (!charByName.has(unknownKey)) {
                const created = state.addCharacter(
                    {
                        name: UNKNOWN_ROLE_NAME,
                        color: 'bg-orange-400',
                        textColor: 'text-black',
                        cvName: '',
                        description: '由系统自动识别但尚未分配的角色',
                        isStyleLockedToCv: false,
                    },
                    currentProject.id
                );
                charByName.set(unknownKey, created);
            }
            const unknownId = charByName.get(unknownKey)!.id;

            const existingChapterById = new Map(currentProject.chapters.map(ch => [ch.id, ch] as const));
            const incomingChapters = patch.chapters;

            const chaptersToAppend: Chapter[] = [];
            const chaptersToReplace = new Map<string, Chapter>();

            for (const incoming of incomingChapters) {
                const mappedLines: ScriptLine[] = (incoming.scriptLines || []).map(ls => {
                    const name = (ls.characterName || '').trim();
                    const mappedCharId = name ? charByName.get(normalizeName(name))?.id : unknownId;
                    const base: Partial<ScriptLine> = { ...ls, characterId: mappedCharId };
                    delete (base as any).characterName;
                    return ensureLineBooleans(base);
                });

                const newChapter: Chapter = {
                    id: incoming.id,
                    title: incoming.title,
                    rawContent: (incoming.rawContent || '').trim() ? incoming.rawContent : mappedLines.map(l => l.text).join('\n'),
                    scriptLines: mappedLines,
                };

                if (existingChapterById.has(incoming.id)) {
                    if (replaceDuplicates) chaptersToReplace.set(incoming.id, newChapter);
                } else {
                    chaptersToAppend.push(newChapter);
                }
            }

            undoableProjectUpdate(prev => {
                const replaced = prev.chapters.map(ch => chaptersToReplace.get(ch.id) || ch);
                const nextChapters = [...replaced, ...chaptersToAppend];
                return { ...prev, chapters: nextChapters, lastModified: Date.now() };
            });

            const importedCount = chaptersToAppend.length + chaptersToReplace.size;
            alert(`导入完成：新增 ${chaptersToAppend.length} 章，替换 ${chaptersToReplace.size} 章（共 ${importedCount} 章）。`);
        };

        if (patch.source.projectId !== currentProject.id) {
            openConfirmModal(
                '项目不匹配',
                <div className="text-slate-200 text-sm space-y-2">
                    <div>补丁来源项目ID：<span className="text-sky-300">{patch.source.projectId}</span></div>
                    <div>当前项目ID：<span className="text-sky-300">{currentProject.id}</span></div>
                    <div className="text-slate-400">若不是同一份“基准工程”，章节/行ID可能不一致，建议不要导入。</div>
                </div>,
                () => proceedImport(false),
                '仍要导入',
                '取消',
            );
            return;
        }

        const existingIds = new Set(currentProject.chapters.map(c => c.id));
        const duplicates = patch.chapters.filter(ch => existingIds.has(ch.id));

        if (duplicates.length > 0) {
            openConfirmModal(
                '发现重复章节',
                <div className="text-slate-200 text-sm space-y-2">
                    <div>有 <span className="text-sky-300">{duplicates.length}</span> 个章节ID已存在。</div>
                    <div className="text-slate-400">建议：如果对方确实改了这些章节，选择“覆盖”；否则选“跳过重复”。</div>
                </div>,
                () => proceedImport(true),
                '覆盖重复',
                '跳过重复',
                () => proceedImport(false),
            );
            return;
        }

        proceedImport(false);
    };

    if (!currentProject) {
        return <div className="p-4 h-full flex items-center justify-center bg-slate-800 text-slate-400">项目加载中...</div>;
    }

    const currentChapterIndex = currentProject.chapters.findIndex(c => c.id === selectedChapterId);

    return (
        <div className="p-4 h-full flex flex-col bg-slate-800 text-slate-100">
            <ChapterListHeader project={currentProject} currentPage={currentPage} totalPages={totalPages} filteredCount={filteredChapters.length} />
            <ChapterListActions project={currentProject} onParseProject={undoableParseProjectChapters} chapterActions={chapterActions} onOpenExportModal={() => setIsExportModalOpen(true)} />
            <div className="grid grid-cols-2 gap-2 mb-3">
                <button
                    onClick={() => setIsExportPatchModalOpen(true)}
                    className="flex items-center justify-center px-2 py-2 bg-sky-700 hover:bg-sky-800 text-white rounded-md text-xs font-medium transition-colors"
                    title="导出章节补丁（JSON），用于网盘同步画本结果（颜色/角色描述等不会丢）"
                >
                    同步导出
                </button>
                <button
                    onClick={handleOpenImportPatch}
                    className="flex items-center justify-center px-2 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-md text-xs font-medium transition-colors"
                    title="导入章节补丁（JSON）并追加到当前项目（重复章节可选择覆盖/跳过）"
                >
                    同步导入
                </button>
                <input
                    ref={importPatchInputRef}
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleImportPatchFile(f);
                        e.currentTarget.value = '';
                    }}
                />
            </div>
            <div className="flex items-center space-x-2 mb-2 pt-3 border-t border-slate-700">
                <input type="checkbox" id="select-all-on-page" checked={allVisibleChaptersSelected} onChange={handleToggleSelectAllOnPage} disabled={isAnyOperationLoading || paginatedChapters.length === 0} className="form-checkbox h-4 w-4 text-sky-500 bg-slate-700 border-slate-600 rounded focus:ring-sky-400 cursor-pointer disabled:opacity-50" />
                <label htmlFor="select-all-on-page" className="text-sm text-slate-300 select-none">全选当前页 ({multiSelectedChapterIds.length} / {currentProject.chapters.length})</label>
                <button onClick={() => setIsBatchModifyModalOpen(true)} className="ml-auto text-xs text-sky-300 hover:text-sky-100 bg-slate-700 px-2 py-1 rounded">批量操作...</button>
            </div>
            <div className="flex-grow overflow-y-auto space-y-1 pr-1 -mr-1">
                {paginatedChapters.map(chapter => {
                    const chapterIndex = currentProject.chapters.findIndex(c => c.id === chapter.id);
                    return (
                    <ChapterListItem key={chapter.id} chapter={chapter} chapterIndex={chapterIndex} isSelectedForViewing={selectedChapterId === chapter.id} isMultiSelected={multiSelectedChapterIds.includes(chapter.id)} isAnyOperationLoading={isAnyOperationLoading} onToggleMultiSelect={(event) => { event.stopPropagation(); handleToggleMultiSelect(chapter.id, event); }} onSelectForViewing={() => handleSelectForViewing(chapter.id)} isEditingThisItem={editingChapterId === chapter.id} editingTitleValue={editingTitleInput} onStartEditTitle={() => handleStartEditChapterTitle(chapter)} onTitleInputChange={handleEditingTitleInputChange} onSaveTitle={() => handleSaveChapterTitle(chapter.id)} onCancelEditTitle={handleCancelEditChapterTitle} onInsertChapterAfter={() => insertChapterAfter(chapter.id)} />
                )})}
            </div>
            <ChapterPagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} isAnyOperationLoading={isAnyOperationLoading} isEditingTitle={isEditingTitle} />
            <BatchModifyModal isOpen={isBatchModifyModalOpen} onClose={() => setIsBatchModifyModalOpen(false)} selectedCount={multiSelectedChapterIds.length} onBatchDelete={handleBatchDelete} onBatchMerge={handleOpenMergeModal} canMerge={canMerge} onBatchAdd={() => { setIsBatchModifyModalOpen(false); setIsBatchAddModalOpen(true); }} />
            <BatchAddChaptersModal isOpen={isBatchAddModalOpen} onClose={() => setIsBatchAddModalOpen(false)} onSave={async (count) => { if (currentProject) { setCvFilter(null); await batchAddChapters(count); const pid = currentProject?.id; if (pid) { const latest = useStore.getState().projects.find(p => p.id === pid); const lastId = latest?.chapters[latest.chapters.length - 1]?.id; if (lastId) setSelectedChapterId(lastId); } } setIsBatchAddModalOpen(false); }} />
            <MergeChaptersModal isOpen={isMergeModalOpen} onClose={() => setIsMergeModalOpen(false)} chaptersToMerge={chaptersToMerge} allChapters={currentProject.chapters} onConfirmMerge={handleConfirmMerge} />
            <ExportScriptModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} onConfirm={handleExportConfirm} multiSelectCount={multiSelectedChapterIds.length} currentChapterIndex={currentChapterIndex > -1 ? currentChapterIndex : null} currentChapterTitle={currentProject.chapters.find(c => c.id === selectedChapterId)?.title || null} projectTitle={currentProject.name} />
            <ExportChaptersPatchModal isOpen={isExportPatchModalOpen} onClose={() => setIsExportPatchModalOpen(false)} onConfirm={handleExportPatchConfirm} multiSelectCount={multiSelectedChapterIds.length} currentChapterIndex={currentChapterIndex > -1 ? currentChapterIndex : null} currentChapterTitle={currentProject.chapters.find(c => c.id === selectedChapterId)?.title || null} projectTitle={currentProject.name} />
        </div>
    );
};

export default ChapterListPanel;
