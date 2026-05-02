import { useState, useCallback, useMemo, useEffect } from 'react';
import { useStore } from '../../../store/useStore';
import { TextMarker, PinnedSound, SoundGroup } from '../../../types';
import { ensureSoundLufs } from '../../../services/lufsService';
import {
    applyBgmWithEndMarkerToProject,
    applySfxToProject,
    clearFormattingInProject,
    findLineIdAndOffset,
} from './postProductionEditing';


export const usePostProduction = () => {
    const {
        selectedProjectId,
        projects,
        updateProjectTextMarkers,
        updateProject,
        soundLibrary,
        soundObservationList,
    } = useStore((state) => ({
        selectedProjectId: state.selectedProjectId,
        projects: state.projects,
        updateProjectTextMarkers: state.updateProjectTextMarkers,
        updateProject: state.updateProject,
        soundLibrary: state.soundLibrary,
        soundObservationList: state.soundObservationList,
    }));

    const [selectedRange, setSelectedRange] = useState<Range | null>(null);
    const [isSceneModalOpen, setIsSceneModalOpen] = useState(false);
    const [isBgmModalOpen, setIsBgmModalOpen] = useState(false);
    const [isSfxModalOpen, setIsSfxModalOpen] = useState(false);
    const [isSoundGroupModalOpen, setIsSoundGroupModalOpen] = useState(false);
    const [editingMarker, setEditingMarker] = useState<TextMarker | null>(null);

    const currentProject = useMemo(() => projects.find((p) => p.id === selectedProjectId), [projects, selectedProjectId]);
    const textMarkers = useMemo(() => currentProject?.textMarkers || [], [currentProject]);
    const soundGroups = useMemo(() => currentProject?.soundGroups || [], [currentProject]);

    // 暴露全局桥接（供分行操作直接提交完整 Project）
    useEffect(() => {
        (window as any).__pp_updateProject = updateProject;
        return () => { try { delete (window as any).__pp_updateProject; } catch {} };
    }, [updateProject]);

    const handleTextSelect = useCallback((range: Range | null) => {
        setSelectedRange(range);
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedRange(null);
        window.getSelection()?.removeAllRanges();
    }, []);

    const handleClearFormatting = useCallback(() => {
        if (!selectedRange || !currentProject) return;

        const nextProject = clearFormattingInProject({
            project: currentProject,
            range: selectedRange,
            soundLibraryItems: soundLibrary,
            soundObservationList,
        });
        if (!nextProject) {
            console.warn('[CF] Selection could not be mapped to a line element; aborting.');
            clearSelection();
            return;
        }

        if (nextProject !== currentProject) {
            updateProject(nextProject);
        }
        clearSelection();
    }, [selectedRange, currentProject, updateProject, clearSelection, soundLibrary, soundObservationList]);

    const handleSaveScene = useCallback((sceneName: string) => {
        if (!selectedRange || !currentProject) return;
        const { startContainer, startOffset, endContainer, endOffset } = selectedRange;
        const startResult = findLineIdAndOffset(startContainer, startOffset);
        const endResult = findLineIdAndOffset(endContainer, endOffset);

        if (startResult && endResult) {
            const newMarker: TextMarker = {
                id: `scene_${Date.now()}`,
                type: 'scene',
                name: sceneName,
                startLineId: startResult.lineId,
                startOffset: startResult.offset,
                endLineId: endResult.lineId,
                endOffset: endResult.offset,
            };
            updateProjectTextMarkers(currentProject.id, [...textMarkers, newMarker]);
        } else {
            alert('无法确定所选文本的起止位置，请重新选择');
        }
        setIsSceneModalOpen(false);
        clearSelection();
    }, [selectedRange, currentProject, textMarkers, updateProjectTextMarkers, clearSelection]);

    const handleSaveBgm = useCallback((bgmName: string) => {
        if (!selectedRange || !currentProject) {
            alert('请先框选一段文本以指定BGM范围。');
            return;
        }
        const name = bgmName.trim();
        if (!name) {
          alert('请输入背景音乐（BGM）名称或标识');
          return;
        }

        const { startContainer, startOffset, endContainer, endOffset } = selectedRange;
        const startResult = findLineIdAndOffset(startContainer, startOffset);
        const endResult = findLineIdAndOffset(endContainer, endOffset);

        console.log('[BGM] handleSaveBgm selection', {
            name,
            hasSelection: !!selectedRange,
            startResult,
            endResult,
        });

        if (startResult && endResult) {
            const newMarker: TextMarker = {
                id: `bgm_${Date.now()}`,
                type: 'bgm',
                name: name,
                startLineId: startResult.lineId,
                startOffset: startResult.offset,
                endLineId: endResult.lineId,
                endOffset: endResult.offset,
            };
            const nextMarkers = [...textMarkers, newMarker];
            console.log('[BGM] handleSaveBgm add marker', newMarker, 'allMarkersCount', nextMarkers.length);
            updateProjectTextMarkers(currentProject.id, nextMarkers);

            // 旧逻辑：在文本中插入 <名称>，用于 <♫-xxx> 高亮和范围计算
            const { lineId, offset } = startResult;
            let targetChapterId: string | null = null;
            let currentLineText: string | null = null;
            for (const ch of currentProject.chapters) {
                const line = ch.scriptLines.find(l => l.id === lineId);
                if (line) {
                    targetChapterId = ch.id;
                    currentLineText = line.text || '';
                    break;
                }
            }
            if (!targetChapterId || currentLineText === null) {
                alert('�Ҳ���Ŀ���ı��У�������');
            } else {
                const bracketedPlain = `<${name}>`;
                const newText = currentLineText.slice(0, offset) + bracketedPlain + currentLineText.slice(offset);
                console.log('[BGM] handleSaveBgm insert text', {
                    projectId: currentProject.id,
                    targetChapterId,
                    lineId,
                    offset,
                    before: currentLineText,
                    after: newText,
                });
                updateLineText(currentProject.id, targetChapterId, lineId, newText);
            }
        } else {
            alert('无法确定所选文本的起止位置，请重新选择');
        }

        setIsBgmModalOpen(false);
        clearSelection();
    }, [selectedRange, currentProject, textMarkers, updateProjectTextMarkers, clearSelection]);

    // 新的精确版：统一更新 Project（文本 + BGM 标记），避免异步状态覆盖
    const handleSaveBgmMerged = useCallback((bgmName: string) => {
        if (!selectedRange || !currentProject) {
            alert('���ȿ�ѡһ���ı���ָ��BGM��Χ��');
            return;
        }
        const name = bgmName.trim();
        if (!name) {
          alert('�����뱳�����֣�BGM�����ƻ��ʶ');
          return;
        }

        const { startContainer, startOffset, endContainer, endOffset } = selectedRange;
        const startResult = findLineIdAndOffset(startContainer, startOffset);
        const endResult = findLineIdAndOffset(endContainer, endOffset);

        console.log('[BGM] handleSaveBgmMerged selection', {
            name,
            hasSelection: !!selectedRange,
            startResult,
            endResult,
        });

        if (startResult && endResult) {
            const projectClone: Project = JSON.parse(JSON.stringify(currentProject));

            // 插入文本本身会改变后续字符的偏移量，特别是当起点和终点在同一行时。
            // 这里先算出插入字符串长度，再对 endOffset 做一次修正，保证高亮范围与肉眼看到的选区一致。
            const bracketedPlain = `<${name}>`;
            const insertionLineId = startResult.lineId;
            const insertionOffset = startResult.offset;
            let adjustedStartOffset = insertionOffset;
            let adjustedEndOffset = endResult.offset;

            if (endResult.lineId === insertionLineId && endResult.offset >= insertionOffset) {
                adjustedEndOffset += bracketedPlain.length;
            }

            const newMarker: TextMarker = {
                id: `bgm_${Date.now()}`,
                type: 'bgm',
                name: name,
                startLineId: insertionLineId,
                startOffset: adjustedStartOffset,
                endLineId: endResult.lineId,
                endOffset: adjustedEndOffset,
            };

            const existingMarkers = projectClone.textMarkers || [];
            projectClone.textMarkers = [...existingMarkers, newMarker];

            const { lineId, offset } = startResult;
            let targetChapterId: string | null = null;
            let currentLineText: string | null = null;

            for (const ch of projectClone.chapters) {
                const line = ch.scriptLines.find(l => l.id === lineId);
                if (line) {
                    targetChapterId = ch.id;
                    currentLineText = line.text || '';
                    const newText = currentLineText.slice(0, offset) + bracketedPlain + currentLineText.slice(offset);
                    line.text = newText;
                    console.log('[BGM] handleSaveBgmMerged projectClone update', {
                        marker: newMarker,
                        targetChapterId,
                        lineId,
                        offset,
                        before: currentLineText,
                        after: newText,
                    });
                    break;
                }
            }

            if (!targetChapterId || currentLineText === null) {
                alert('�Ҳ���Ŀ���ı��У�������');
            } else {
                updateProject(projectClone);
            }
        } else {
            alert('�޷�ȷ����ѡ�ı�����ֹλ�ã�������ѡ��');
        }

        setIsBgmModalOpen(false);
        clearSelection();
    }, [selectedRange, currentProject, updateProject, clearSelection]);

    const handleSaveBgmWithEndMarker = useCallback((bgmName: string) => {
        if (!selectedRange || !currentProject) {
            alert('?????????????????BGM??��??');
            return;
        }
        const name = bgmName.trim();
        if (!name) {
          alert('?????????????BGM?????????');
          return;
        }

        const { startContainer, startOffset, endContainer, endOffset, collapsed } = selectedRange as any;
        const startResult = findLineIdAndOffset(startContainer, startOffset);
        const endResult = findLineIdAndOffset(endContainer, endOffset);

        console.log('[BGM] handleSaveBgmWithEndMarker selection', {
            name,
            hasSelection: !!selectedRange,
            collapsed,
            startResult,
            endResult,
        });

        // 如果当前只是一个光标（没有选中文本），采用“方式 B”：只在光标处插入 <名称>，不插入 //，结束由用户稍后手动输入 // 再统一解析
        if (collapsed && startResult) {
            const projectClone: Project = JSON.parse(JSON.stringify(currentProject));
            const startLineId = startResult.lineId;
            const insertionOffset = startResult.offset;

            let lineRef: ScriptLine | null = null;
            for (const ch of projectClone.chapters) {
                const line = ch.scriptLines.find(l => l.id === startLineId);
                if (line) {
                    lineRef = line;
                    break;
                }
            }

            if (!lineRef) {
                alert('�޷�ȷ����BGM ��ʼ�����У�������ѡ��λ��');
            } else {
                const original = lineRef.text || '';
                const bracketedPlain = `<${name}>`;
                const newText = original.slice(0, insertionOffset) + bracketedPlain + original.slice(insertionOffset);
                lineRef.text = newText;

                console.log('[BGM] handleSaveBgmWithEndMarker (collapsed, start only)', {
                    lineId: startLineId,
                    offset: insertionOffset,
                    before: original,
                    after: newText,
                });

                updateProject(projectClone);
            }

        } else if (startResult && endResult) {
            const projectClone: Project = JSON.parse(JSON.stringify(currentProject));
            const bracketedPlain = `<${name}>`;
            const endMarker = `//`;

            const startLineId = startResult.lineId;
            const endLineId = endResult.lineId;
            const startOffsetVal = startResult.offset;
            const endOffsetRaw = endResult.offset;

            let startLineRef: ScriptLine | null = null;
            let endLineRef: ScriptLine | null = null;

            for (const ch of projectClone.chapters) {
                if (!startLineRef) {
                    const line = ch.scriptLines.find(l => l.id === startLineId);
                    if (line) {
                        startLineRef = line;
                    }
                }
                if (!endLineRef) {
                    const line = ch.scriptLines.find(l => l.id === endLineId);
                    if (line) {
                        endLineRef = line;
                    }
                }
                if (startLineRef && endLineRef) break;
            }

            if (!startLineRef || !endLineRef) {
                alert('????????????��???????');
            } else {
                const existingMarkers = projectClone.textMarkers || [];
                let newMarker: TextMarker;

                if (startLineId === endLineId) {
                    const original = startLineRef.text || '';
                    const a = Math.min(startOffsetVal, endOffsetRaw);
                    const b = Math.max(startOffsetVal, endOffsetRaw);

                    const before = original.slice(0, a);
                    const middle = original.slice(a, b);
                    const after = original.slice(b);

                    const newText = before + bracketedPlain + middle + endMarker + after;

                    const markerStartOffset = before.length + bracketedPlain.length;
                    const markerEndOffset = before.length + bracketedPlain.length + middle.length;

                    newMarker = {
                        id: `bgm_${Date.now()}`,
                        type: 'bgm',
                        name,
                        startLineId,
                        startOffset: markerStartOffset,
                        endLineId,
                        endOffset: markerEndOffset,
                    };

                    startLineRef.text = newText;

                    console.log('[BGM] handleSaveBgmWithEndMarker update (single line)', {
                        marker: newMarker,
                        lineId: startLineId,
                        selectionStart: a,
                        selectionEnd: b,
                        before: original,
                        after: newText,
                    });
                } else {
                    const startOriginal = startLineRef.text || '';
                    const endOriginal = endLineRef.text || '';

                    const startBefore = startOriginal.slice(0, startOffsetVal);
                    const startAfter = startOriginal.slice(startOffsetVal);
                    const newStartText = startBefore + bracketedPlain + startAfter;

                    const endBefore = endOriginal.slice(0, endOffsetRaw);
                    const endAfter = endOriginal.slice(endOffsetRaw);
                    const newEndText = endBefore + endMarker + endAfter;

                    const markerStartOffset = startBefore.length + bracketedPlain.length;
                    const markerEndOffset = endBefore.length;

                    newMarker = {
                        id: `bgm_${Date.now()}`,
                        type: 'bgm',
                        name,
                        startLineId,
                        startOffset: markerStartOffset,
                        endLineId,
                        endOffset: markerEndOffset,
                    };

                    startLineRef.text = newStartText;
                    endLineRef.text = newEndText;

                    console.log('[BGM] handleSaveBgmWithEndMarker update (multi line)', {
                        marker: newMarker,
                        startLineId,
                        endLineId,
                        startOffset: startOffsetVal,
                        endOffset: endOffsetRaw,
                        startBefore,
                        startAfter,
                        endBefore,
                        endAfter,
                    });
                }

                projectClone.textMarkers = [...existingMarkers, newMarker];
                updateProject(projectClone);
            }
        } else {
            alert('?????????????????��????????????');
        }

        setIsBgmModalOpen(false);
        clearSelection();
    }, [selectedRange, currentProject, updateProject, clearSelection]);

    const handleSaveSfx = useCallback((rawSfxText: string) => {
        if (!selectedRange || !currentProject) return;
        const sfx = rawSfxText.trim();
        if (!sfx) return;
        const bracketed = sfx.startsWith('[') && sfx.endsWith(']') ? sfx : `[${sfx}]`;

        const { startContainer, startOffset, endContainer, endOffset, collapsed } = selectedRange;
        const startResult = findLineIdAndOffset(startContainer, startOffset);
        const endResult = findLineIdAndOffset(endContainer, endOffset);

        if (!startResult) {
            alert('无法确定插入位置，请重新在文本中点击或选择');
            return;
        }

        const { lineId: startLineId, offset: startPos } = startResult;
        let targetChapterId: string | null = null;
        let currentLineText: string | null = null;
        let lineRef: ScriptLine | undefined;
        let chapterRef: Chapter | undefined;

        const projectClone = JSON.parse(JSON.stringify(currentProject));
        
        for (const ch of projectClone.chapters) {
            const line = ch.scriptLines.find(l => l.id === startLineId);
            if (line) {
                targetChapterId = ch.id;
                currentLineText = line.text || '';
                lineRef = line;
                chapterRef = ch;
                break;
            }
        }
        if (!targetChapterId || currentLineText === null || !lineRef) {
            alert('找不到目标文本行，请重试');
            return;
        }

        let newText = currentLineText;
        if (!collapsed && endResult && endResult.lineId === startLineId) {
            const a = Math.min(startPos, endResult.offset);
            const b = Math.max(startPos, endResult.offset);
            newText = currentLineText.slice(0, a) + bracketed + currentLineText.slice(b);
        } else {
            const pos = startPos;
            newText = currentLineText.slice(0, pos) + bracketed + currentLineText.slice(pos);
        }
        lineRef.text = newText;

        updateProject(projectClone);
        setIsSfxModalOpen(false);
        clearSelection();
    }, [selectedRange, currentProject, updateProject, clearSelection]);

    const handleDeleteMarker = useCallback((id: string) => {
        if (!currentProject) return;
        const target = textMarkers.find((m) => m.id === id);
        // 场景标记在 UI 中按“起始行”展示（不区分 offset），历史数据/批量导入可能产生同一起始行的重复 scene。
        // 为避免“删了还在”的困惑：删除 scene 时同时删除同一起始行的所有 scene 标记。
        const next =
            target?.type === 'scene' && target.startLineId
                ? textMarkers.filter((m) => !(m.type === 'scene' && m.startLineId === target.startLineId))
                : textMarkers.filter((m) => m.id !== id);
        updateProjectTextMarkers(currentProject.id, next);

        // 同步清理 DOM 中对应的 BGM 高亮，避免删除印记后背景色残留
        try {
            const marks = document.querySelectorAll(`mark.bgm-highlight[data-marker-id=\"${id}\"]`);
            marks.forEach((mark) => {
                const parent = mark.parentNode;
                if (parent) {
                    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
                    parent.removeChild(mark);
                }
            });
        } catch {
            // 在非浏览器环境下忽略 DOM 操作错误
        }

        setEditingMarker(null);
    }, [currentProject, textMarkers, updateProjectTextMarkers]);

    const handleRenameMarker = useCallback((id: string, newName: string) => {
        if (!currentProject) return;
        const next = textMarkers.map((m) => (m.id === id ? { ...m, name: newName } : m));
        updateProjectTextMarkers(currentProject.id, next);
        setEditingMarker((prev) => (prev ? { ...prev, name: newName } : prev));
    }, [currentProject, textMarkers, updateProjectTextMarkers]);

    const handleUpdateRangeFromSelection = useCallback((id: string) => {
        if (!selectedRange || !currentProject) return;
        const { startContainer, startOffset, endContainer, endOffset } = selectedRange;
        const startResult = findLineIdAndOffset(startContainer, startOffset);
        const endResult = findLineIdAndOffset(endContainer, endOffset);
        if (startResult && endResult) {
            const next = textMarkers.map((m) =>
                m.id === id
                    ? { ...m, startLineId: startResult.lineId, startOffset: startResult.offset, endLineId: endResult.lineId, endOffset: endResult.offset }
                    : m
            );
            updateProjectTextMarkers(currentProject.id, next);
        } else {
            alert('当前选区无法解析，请重新框选');
        }
    }, [selectedRange, currentProject, textMarkers, updateProjectTextMarkers]);

    const handleUpdateAnchorFromSelection = useCallback((id: string) => {
        if (!selectedRange || !currentProject) return;
        const { startContainer, startOffset } = selectedRange;
        const startResult = findLineIdAndOffset(startContainer, startOffset);
        if (startResult) {
            const next = textMarkers.map((m) =>
                m.id === id
                    ? {
                          ...m,
                          startLineId: startResult.lineId,
                          startOffset: startResult.offset,
                          endLineId: startResult.lineId,
                          endOffset: startResult.offset,
                      }
                    : m,
            );
            updateProjectTextMarkers(currentProject.id, next);
        } else {
            alert('当前选区无法解析，请重新点击/框选');
        }
    }, [selectedRange, currentProject, textMarkers, updateProjectTextMarkers]);

    const handleChangeSfxGroupMarkerGroup = useCallback(
        (markerId: string, groupId: string) => {
            if (!currentProject) return;
            const group = soundGroups.find((g) => g.id === groupId);
            if (!group) return;
            const next = textMarkers.map((m) =>
                m.id === markerId ? { ...m, type: 'sfxGroup', groupId, name: group.name } : m,
            );
            updateProjectTextMarkers(currentProject.id, next);
            setEditingMarker((prev) => (prev?.id === markerId ? { ...prev, groupId, name: group.name } : prev));
        },
        [currentProject, soundGroups, textMarkers, updateProjectTextMarkers],
    );

    const handleUpdateColor = useCallback((id: string, color?: string) => {
        if (!currentProject) return;
        const next = textMarkers.map((m) => (m.id === id ? { ...m, color } : m));
        updateProjectTextMarkers(currentProject.id, next);
        (window as any).__applyMarkerColor?.(id, color);
        setEditingMarker((prev) => (prev ? ({ ...prev, color } as TextMarker) : prev));
    }, [currentProject, textMarkers, updateProjectTextMarkers]);

    const handleInsertSoundGroup = useCallback(
        (groupId: string, groupName?: string) => {
            if (!selectedRange || !currentProject) return;
            const startResult = findLineIdAndOffset(selectedRange.startContainer, selectedRange.startOffset);
            if (!startResult) {
                alert('无法确定插入位置，请重新在文本中点击定位或选择一段文本');
                return;
            }
            const group = soundGroups.find((g) => g.id === groupId);
            const displayName = (group?.name || groupName || '音效组').trim() || '音效组';

            const newMarker: TextMarker = {
                id: `sfxGroup_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                type: 'sfxGroup',
                name: displayName,
                groupId: groupId,
                startLineId: startResult.lineId,
                startOffset: startResult.offset,
                endLineId: startResult.lineId,
                endOffset: startResult.offset,
            };
            updateProjectTextMarkers(currentProject.id, [...textMarkers, newMarker]);
            setIsSoundGroupModalOpen(false);
            clearSelection();
        },
        [selectedRange, currentProject, soundGroups, textMarkers, updateProjectTextMarkers, clearSelection],
    );

    const handleUpsertSoundGroup = useCallback(
        (group: SoundGroup) => {
            if (!currentProject) return;
            const nextGroups = [...(soundGroups || []).filter((g) => g.id !== group.id), group];
            // 同步更新已插入的 marker 的显示名称，避免组改名后正文还显示旧名
            const nextMarkers = (currentProject.textMarkers || []).map((m) =>
                m.type === 'sfxGroup' && m.groupId === group.id ? { ...m, name: group.name } : m,
            );
            updateProject({ ...currentProject, soundGroups: nextGroups, textMarkers: nextMarkers });
        },
        [currentProject, soundGroups, updateProject],
    );

    const handleDeleteSoundGroup = useCallback(
        (groupId: string) => {
            if (!currentProject) return;
            const nextGroups = (soundGroups || []).filter((g) => g.id !== groupId);
            // 删除组时同时清理引用该组的插入点，避免“残留但导出无效”的困惑
            const nextMarkers = (currentProject.textMarkers || []).filter(
                (m) => !(m.type === 'sfxGroup' && m.groupId === groupId),
            );
            updateProject({ ...currentProject, soundGroups: nextGroups, textMarkers: nextMarkers });
            setEditingMarker((prev) => (prev?.type === 'sfxGroup' && prev.groupId === groupId ? null : prev));
        },
        [currentProject, soundGroups, updateProject],
    );
    
    const handlePinSound = useCallback((lineId: string, chapterId: string, charIndex: number, keyword: string, soundId: number | null, soundName: string | null) => {
        if (!currentProject) return;
    
        const updatedProject = {
            ...currentProject,
            chapters: currentProject.chapters.map(ch => {
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
                            } else { // unpinning
                                return {
                                    ...line,
                                    pinnedSounds: filtered.length > 0 ? filtered : undefined // remove array if empty
                                };
                            }
                        }
                        return line;
                    })
                };
            })
        };
        updateProject(updatedProject);

        if (soundId !== null) {
            const sound = soundLibrary.find((s) => s.id === soundId);
            if (sound) {
                // Fire-and-forget LUFS analysis and caching for this sound.
                void ensureSoundLufs(sound).catch((error) => {
                    console.error('Failed to analyze LUFS for pinned sound', error);
                });
            }
        }
    }, [currentProject, updateProject, soundLibrary]);

    const { updateLineText } = useStore();

    return {
        currentProject,
        textMarkers,
        soundGroups,
        selectedRange,
        isSceneModalOpen,
        isBgmModalOpen,
        isSfxModalOpen,
        isSoundGroupModalOpen,
        editingMarker,
        suspendLayout: isSceneModalOpen || isBgmModalOpen || isSoundGroupModalOpen || !!editingMarker,
        handleTextSelect,
        openSceneModal: () => { if(selectedRange) setIsSceneModalOpen(true); },
        closeSceneModal: () => setIsSceneModalOpen(false),
        openBgmModal: (range?: Range) => {
            const finalRange = range || selectedRange;
            if (finalRange) {
              if (range) {
                setSelectedRange(range);
              }
              setIsBgmModalOpen(true);
            }
        },
        closeBgmModal: () => setIsBgmModalOpen(false),
        openSfxModal: (range?: Range) => {
            const finalRange = range || selectedRange;
            if (finalRange) {
              if (range) {
                setSelectedRange(range);
              }
              setIsSfxModalOpen(true);
            }
        },
        closeSfxModal: () => setIsSfxModalOpen(false),
        openSoundGroupModal: (range?: Range) => {
            const finalRange = range || selectedRange;
            if (finalRange) {
              if (range) {
                setSelectedRange(range);
              }
              setIsSoundGroupModalOpen(true);
            }
        },
        closeSoundGroupModal: () => setIsSoundGroupModalOpen(false),
        // ���ޣ�ֻ�� scene ����ǣ�BGM ��ʹ�ÿ���޸Ļ��򷳳�Χ��ͨ��ֱ���༭ <...> �� //
        // ��ɫ��� BGM ��Ǿ��� recalculateBgmMarkersFromText �� useMarkerRendering ��ͨ���ı�
        // �Զ������
        openEditModal: (marker: TextMarker | null) => {
            if (marker && marker.type !== 'scene' && marker.type !== 'sfxGroup') {
                return;
            }
            setEditingMarker(marker);
        },
        closeEditModal: () => setEditingMarker(null),
        handleSaveScene,
        handleSaveBgm: handleSaveBgmWithEndMarker,
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
    };
};

// 暴露一个仅供调试的全局函数：读取最近一次清除格式的计算结果
// 使用：在控制台运行 window.__pp_lastCFDebug 查看
