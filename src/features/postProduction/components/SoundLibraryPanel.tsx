import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { FolderOpenIcon, MagnifyingGlassIcon, ArrowPathIcon, XMarkIcon } from '../../../components/ui/icons';
import { soundLibraryRepository } from '../../../repositories/soundLibraryRepository';
import { SoundLibraryItem, SoundLibraryRoot, SoundLibraryRootHandleMap } from '../../../types';
import * as mm from 'music-metadata-browser';
import { useStore } from '../../../store/useStore';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';
// FIX: Import 'db' to resolve 'Cannot find name 'db''.
import { db } from '../../../db';
import { SOUND_OBSERVATION_GLOBAL_CATEGORY_KEY } from '../../../store/slices/uiSlice';
import { getNearestFolderNameFromSoundName, getSoundFileNameFromSoundName, getTopLevelFolderNameFromSoundName } from '../../../lib/soundPath';
import { buildSoundKeywordCategoryKey } from '../../../lib/soundKeywordCategory';
import { SOUND_LIBRARY_CATEGORY_DEFS } from '../../../lib/soundLibraryCategories';

const isSupportedAudioFile = (name: string): boolean => {
    const n = (name || '').toLowerCase();
    return n.endsWith('.mp3') || n.endsWith('.wav');
};

const SoundLibraryPanel: React.FC = () => {
    const { openConfirmModal, soundLibrary, refreshSoundLibrary, soundObservationByCategory, setSoundObservationByCategory, replaceSoundObservationByCategory } = useStore(state => ({
      openConfirmModal: state.openConfirmModal,
      soundLibrary: state.soundLibrary,
      refreshSoundLibrary: state.refreshSoundLibrary,
      soundObservationByCategory: state.soundObservationByCategory,
      setSoundObservationByCategory: state.setSoundObservationByCategory,
      replaceSoundObservationByCategory: state.replaceSoundObservationByCategory,
    }));
    
    const [rootHandles, setRootHandles] = useState<SoundLibraryRootHandleMap>({});
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [activeTab, setActiveTab] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [isKeywordPanelOpen, setIsKeywordPanelOpen] = useState(false);
    const [editingKeywordCategory, setEditingKeywordCategory] = useState<{ key: string; name: string } | null>(null);
    const [keywordEditorText, setKeywordEditorText] = useState('');
    const didInitialKeywordSyncRef = useRef(false);

    const SOUND_KEYWORD_FOLDER_INDEX_KEY = 'soundKeywordFolderIndex';
    type FolderIndexEntry = { name: string; handle: FileSystemDirectoryHandle };
    type FolderIndex = Record<string, FolderIndexEntry[]>;

    const syncSoundAssistantKeywordCategories = useCallback(async () => {
        const nextKeywordsByCategory: Record<string, string[]> = { ...(soundObservationByCategory || {}) };

        // 1) 一次性迁移：旧版固定分类 key（footsteps/fabric/…） => 新版 “root_slot::文件夹名”
        const topFoldersBySlot = new Map<string, Set<string>>();
        for (const sound of soundLibrary || []) {
            const m = /^(music|sfx)_(1|2)$/u.exec((sound.category || '').trim().toLowerCase());
            if (!m) continue;
            const slotKey = `${m[1]}_${m[2]}`;
            const top = getTopLevelFolderNameFromSoundName(sound.name);
            if (!top) continue;
            const set = topFoldersBySlot.get(slotKey) || new Set<string>();
            set.add(top);
            topFoldersBySlot.set(slotKey, set);
        }

        for (const def of SOUND_LIBRARY_CATEGORY_DEFS) {
            const oldKey = def.key;
            const oldList = nextKeywordsByCategory[oldKey];
            if (!oldList || oldList.length === 0) continue;

            type Candidate = { slotIndex: 0 | 1; folderName: string; score: number };
            const candidates: Candidate[] = [];
            for (const slotIndex of [0, 1] as const) {
                const slotKey = `${def.root}_${slotIndex + 1}`;
                const folders = topFoldersBySlot.get(slotKey);
                if (!folders) continue;
                for (const folderName of folders) {
                    let score = 0;
                    if (folderName === def.name) score = 3;
                    else if (folderName.includes(def.name)) score = 2;
                    else if (def.name.includes(folderName)) score = 1;
                    if (score > 0) candidates.push({ slotIndex, folderName, score });
                }
            }

            const bestScore = Math.max(0, ...candidates.map((c) => c.score));
            if (bestScore <= 0) {
                // 找不到对应文件夹：避免旧分类变成“不可见”，统一回收到“通用”里。
                const globalKey = SOUND_OBSERVATION_GLOBAL_CATEGORY_KEY;
                nextKeywordsByCategory[globalKey] = [
                    ...(nextKeywordsByCategory[globalKey] || []),
                    ...oldList,
                ];
                delete nextKeywordsByCategory[oldKey];
                continue;
            }
            const best = candidates.filter((c) => c.score === bestScore);

            for (const c of best) {
                const newKey = buildSoundKeywordCategoryKey(def.root, c.slotIndex, c.folderName);
                nextKeywordsByCategory[newKey] = [...(nextKeywordsByCategory[newKey] || []), ...oldList];
            }
            delete nextKeywordsByCategory[oldKey];
        }

        // 额外兜底：将所有非“通用”且非“root_slot::文件夹名”的旧 key 回收到“通用”，避免出现“隐藏分类”。
        for (const [key, list] of Object.entries({ ...nextKeywordsByCategory })) {
            if (key === SOUND_OBSERVATION_GLOBAL_CATEGORY_KEY) continue;
            if (/^(music|sfx)_(1|2)::/u.test(key)) continue;
            const globalKey = SOUND_OBSERVATION_GLOBAL_CATEGORY_KEY;
            nextKeywordsByCategory[globalKey] = [
                ...(nextKeywordsByCategory[globalKey] || []),
                ...(list || []),
            ];
            delete nextKeywordsByCategory[key];
        }

        // 2) 基于“第一层文件夹句柄”做重命名迁移（需要目录读取权限；失败则跳过）
        let prevIndex: FolderIndex = {};
        try {
            const entry = await db.misc.get(SOUND_KEYWORD_FOLDER_INDEX_KEY);
            const raw = entry?.value;
            if (raw && typeof raw === 'object') {
                prevIndex = raw as FolderIndex;
            }
        } catch {
            prevIndex = {};
        }

        const nextIndex: FolderIndex = { ...prevIndex };

        const listFirstLevelDirs = async (rootHandle: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle[]> => {
            const dirs: FileSystemDirectoryHandle[] = [];
            for await (const entry of rootHandle.values()) {
                if (entry.kind === 'directory') dirs.push(entry as FileSystemDirectoryHandle);
            }
            return dirs;
        };

        const isSameDir = async (a: FileSystemDirectoryHandle | undefined, b: FileSystemDirectoryHandle, fallbackName: string): Promise<boolean> => {
            if (a && typeof (a as any).isSameEntry === 'function') {
                return await (a as any).isSameEntry(b);
            }
            return fallbackName === b.name;
        };

        const processRootSlot = async (root: 'music' | 'sfx', slotIndex: 0 | 1, handle: FileSystemDirectoryHandle) => {
            const slotKey = `${root}_${slotIndex + 1}`;
            const prevFolders = Array.isArray(prevIndex[slotKey]) ? prevIndex[slotKey] : [];
            const currentFolders = await listFirstLevelDirs(handle);

            const usedPrev = new Set<number>();
            const nextFolders: FolderIndexEntry[] = [];

            for (const dir of currentFolders) {
                let matchedIdx = -1;
                for (let i = 0; i < prevFolders.length; i++) {
                    if (usedPrev.has(i)) continue;
                    const prev = prevFolders[i];
                    if (!prev || !prev.handle) continue;
                    if (await isSameDir(prev.handle, dir, prev.name)) {
                        matchedIdx = i;
                        break;
                    }
                }

                if (matchedIdx >= 0) {
                    usedPrev.add(matchedIdx);
                    const prevName = (prevFolders[matchedIdx]?.name || '').trim();
                    const nextName = (dir.name || '').trim();
                    if (prevName && nextName && prevName !== nextName) {
                        const oldKey = buildSoundKeywordCategoryKey(root, slotIndex, prevName);
                        const newKey = buildSoundKeywordCategoryKey(root, slotIndex, nextName);
                        if (oldKey !== newKey && nextKeywordsByCategory[oldKey]) {
                            nextKeywordsByCategory[newKey] = [
                                ...(nextKeywordsByCategory[newKey] || []),
                                ...(nextKeywordsByCategory[oldKey] || []),
                            ];
                            delete nextKeywordsByCategory[oldKey];
                        }
                    }
                    nextFolders.push({ name: dir.name, handle: dir });
                } else {
                    nextFolders.push({ name: dir.name, handle: dir });
                }
            }

            // 删除已不存在的分类（避免旧关键词继续全局高亮/干扰匹配）
            for (let i = 0; i < prevFolders.length; i++) {
                if (usedPrev.has(i)) continue;
                const removedName = (prevFolders[i]?.name || '').trim();
                if (!removedName) continue;
                const removedKey = buildSoundKeywordCategoryKey(root, slotIndex, removedName);
                delete nextKeywordsByCategory[removedKey];
            }

            nextIndex[slotKey] = nextFolders;
        };

        for (const root of ['music', 'sfx'] as const) {
            for (const slotIndex of [0, 1] as const) {
                const handle = rootHandles[root]?.[slotIndex];
                const slotKey = `${root}_${slotIndex + 1}`;

                if (!handle || handle.kind !== 'directory') {
                    const prevFolders = Array.isArray(prevIndex[slotKey]) ? prevIndex[slotKey] : [];
                    for (const f of prevFolders) {
                        const removedName = (f?.name || '').trim();
                        if (!removedName) continue;
                        delete nextKeywordsByCategory[buildSoundKeywordCategoryKey(root, slotIndex, removedName)];
                    }
                    delete nextIndex[slotKey];
                    continue;
                }

                try {
                    await processRootSlot(root, slotIndex, handle);
                } catch (err) {
                    // Permission or file system errors: skip folder-handle-based migration; legacy migration is still applied.
                    console.warn('[SoundLibraryPanel] syncSoundAssistantKeywordCategories: failed to read directories', err);
                }
            }
        }

        try {
            await db.misc.put({ key: SOUND_KEYWORD_FOLDER_INDEX_KEY, value: nextIndex });
        } catch (err) {
            console.warn('[SoundLibraryPanel] failed to persist soundKeywordFolderIndex', err);
        }

        await replaceSoundObservationByCategory(nextKeywordsByCategory);
    }, [soundObservationByCategory, soundLibrary, rootHandles, replaceSoundObservationByCategory]);

    useEffect(() => {
        const loadHandles = async () => {
            const storedHandles = await soundLibraryRepository.getRootHandles();
            setRootHandles(storedHandles);
        };
        void loadHandles();
    }, []);

    const keywordCategoryDefs = useMemo(() => {
        type Root = 'music' | 'sfx';
        const slotOrderKey = (root: Root, slotIndex: number): number =>
            root === 'sfx' ? slotIndex : 10 + slotIndex;

        const bySlot = new Map<string, { root: Root; slotIndex: 0 | 1; folders: Set<string>; hasRootFiles: boolean }>();
        const ensureSlot = (root: Root, slotIndex: 0 | 1) => {
            const slotKey = `${root}_${slotIndex + 1}`;
            const existing = bySlot.get(slotKey);
            if (existing) return existing;
            const created = { root, slotIndex, folders: new Set<string>(), hasRootFiles: false };
            bySlot.set(slotKey, created);
            return created;
        };

        for (const sound of soundLibrary || []) {
            const m = /^(music|sfx)_(1|2)$/u.exec((sound.category || '').trim().toLowerCase());
            if (!m) continue;
            const root = m[1] as Root;
            const slotIndex = (Number.parseInt(m[2], 10) - 1) as 0 | 1;
            if (slotIndex !== 0 && slotIndex !== 1) continue;

            const slot = ensureSlot(root, slotIndex);
            const topFolder = getTopLevelFolderNameFromSoundName(sound.name);
            if (topFolder) slot.folders.add(topFolder);
            else slot.hasRootFiles = true;
        }

        // Detect duplicates across slots (same root, same top folder name)
        const duplicatesByRoot: Record<Root, Map<string, Array<0 | 1>>> = {
            music: new Map(),
            sfx: new Map(),
        };
        for (const slot of bySlot.values()) {
            for (const folderName of slot.folders) {
                const rec = duplicatesByRoot[slot.root].get(folderName) || [];
                rec.push(slot.slotIndex);
                duplicatesByRoot[slot.root].set(folderName, rec);
            }
        }

        const shouldDisambiguate = (root: Root, folderName: string): boolean => {
            const slots = duplicatesByRoot[root].get(folderName);
            return !!slots && slots.length > 1;
        };

        const slotLabel = (root: Root, slotIndex: 0 | 1): string => {
            const base = root === 'sfx' ? '音效' : '音乐';
            return `${base}${slotIndex + 1}`;
        };

        const folderDefs: Array<{ key: string; name: string; sortA: number; sortB: string }> = [];
        for (const slot of bySlot.values()) {
            const a = slotOrderKey(slot.root, slot.slotIndex);
            const folders = Array.from(slot.folders).sort((x, y) => x.localeCompare(y, 'zh-Hans-CN', { numeric: true }));
            for (const folderName of folders) {
                const key = buildSoundKeywordCategoryKey(slot.root, slot.slotIndex, folderName);
                const name = shouldDisambiguate(slot.root, folderName)
                    ? `${folderName}（${slotLabel(slot.root, slot.slotIndex)}）`
                    : folderName;
                folderDefs.push({ key, name, sortA: a, sortB: folderName });
            }
            if (slot.hasRootFiles) {
                const key = buildSoundKeywordCategoryKey(slot.root, slot.slotIndex, null);
                const name = `根目录（${slotLabel(slot.root, slot.slotIndex)}）`;
                folderDefs.push({ key, name, sortA: a, sortB: '\u0000' });
            }
        }

        folderDefs.sort((a, b) => {
            if (a.sortA !== b.sortA) return a.sortA - b.sortA;
            return a.sortB.localeCompare(b.sortB, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
        });

        return [{ key: SOUND_OBSERVATION_GLOBAL_CATEGORY_KEY, name: '通用' }, ...folderDefs.map(({ key, name }) => ({ key, name }))];
    }, [soundLibrary]);

    const duplicateTopFoldersWarning = useMemo(() => {
        type Root = 'music' | 'sfx';
        const byRoot: Record<Root, Map<string, Set<string>>> = { music: new Map(), sfx: new Map() };
        for (const sound of soundLibrary || []) {
            const m = /^(music|sfx)_(1|2)$/u.exec((sound.category || '').trim().toLowerCase());
            if (!m) continue;
            const root = m[1] as Root;
            const slotLabel = `${root === 'sfx' ? '音效' : '音乐'}${m[2]}`;
            const top = getTopLevelFolderNameFromSoundName(sound.name);
            if (!top) continue;
            const set = byRoot[root].get(top) || new Set<string>();
            set.add(slotLabel);
            byRoot[root].set(top, set);
        }

        const parts: string[] = [];
        for (const [folder, slots] of byRoot.sfx.entries()) {
            if (slots.size > 1) {
                parts.push(`「${folder}」同时存在于 ${Array.from(slots).join('、')}`);
            }
        }
        for (const [folder, slots] of byRoot.music.entries()) {
            if (slots.size > 1) {
                parts.push(`「${folder}」同时存在于 ${Array.from(slots).join('、')}`);
            }
        }
        return parts;
    }, [soundLibrary]);

    const getKeywordTextForCategory = useCallback((categoryKey: string): string => {
        return (soundObservationByCategory?.[categoryKey] || []).join('\n');
    }, [soundObservationByCategory]);

    const parseKeywords = (raw: string): string[] => {
        return (raw || '')
            .split(/[\n,]/)
            .map((s) => s.trim())
            .filter(Boolean);
    };

    const saveEditingKeywordCategory = useCallback(async () => {
        if (!editingKeywordCategory) return;
        const parsed = parseKeywords(keywordEditorText);
        await setSoundObservationByCategory(editingKeywordCategory.key, parsed);
        const normalized = Array.from(new Set(parsed)).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
        setKeywordEditorText(normalized.join('\n'));
        setEditingKeywordCategory(null);
    }, [editingKeywordCategory, keywordEditorText, setSoundObservationByCategory]);

    const scanRootHandle = useCallback(async (root: SoundLibraryRoot, slotIndex: number, handle: FileSystemDirectoryHandle, mode: 'full' | 'incremental') => {
        const categoryKey = `${root}_${slotIndex + 1}`;
        setLoadingMessage(`扫描 ${categoryKey}... (${mode === 'full' ? '全量' : '增量'})`);

        const foundFileNames = new Set<string>();
        const newSounds: SoundLibraryItem[] = [];
        const updatedSounds: SoundLibraryItem[] = [];

        const existingSounds =
            mode === 'incremental'
                ? await soundLibraryRepository.getSoundsByCategory(categoryKey)
                : [];
        const existingSoundMap = new Map(existingSounds.map((s) => [s.name, s]));

        const processDirectory = async (dirHandle: FileSystemDirectoryHandle, currentPath: string) => {
            for await (const entry of dirHandle.values()) {
                const fullPath = currentPath + entry.name;
                if (entry.kind === 'file' && isSupportedAudioFile(entry.name)) {
                    if (foundFileNames.has(fullPath)) continue;
                    foundFileNames.add(fullPath);

                    if (existingSoundMap.has(fullPath)) {
                        const existing = existingSoundMap.get(fullPath)!;
                        updatedSounds.push({ ...existing, handle: entry as FileSystemFileHandle });
                        continue;
                    }

                    try {
                        const file = await (entry as FileSystemFileHandle).getFile();
                        const metadata = await mm.parseBlob(file);
                        newSounds.push({
                            name: fullPath,
                            handle: entry as FileSystemFileHandle,
                            tags: [],
                            duration: metadata.format.duration || 0,
                            category: categoryKey,
                        });
                    } catch (e) {
                        console.warn(`无法解析文件元数据: ${fullPath}`, e);
                    }
                } else if (entry.kind === 'directory') {
                    await processDirectory(entry as FileSystemDirectoryHandle, fullPath + '/');
                }
            }
        };

        try {
            if (mode === 'full') {
                await soundLibraryRepository.clearSounds(categoryKey);
                await processDirectory(handle, '');
                if (newSounds.length > 0) {
                    await soundLibraryRepository.addSounds(newSounds);
                }
                return;
            }

            await processDirectory(handle, '');

            const soundsToDelete = existingSounds.filter((s) => !foundFileNames.has(s.name));
            const idsToDelete = soundsToDelete.map((s) => s.id).filter((id): id is number => id !== undefined);

            await db.transaction('rw', db.soundLibrary, async () => {
                if (newSounds.length > 0) {
                    await soundLibraryRepository.addSounds(newSounds);
                }
                if (updatedSounds.length > 0) {
                    await db.soundLibrary.bulkPut(updatedSounds);
                }
                if (idsToDelete.length > 0) {
                    await soundLibraryRepository.bulkDeleteByIds(idsToDelete);
                }
            });
        } catch (err) {
            console.error(`扫描根目录失败: ${categoryKey}`, err);
            alert(`无法扫描 "${categoryKey}"。请检查文件夹权限或重新关联。`);
        }
    }, []);

    const scanRoot = useCallback(async (root: SoundLibraryRoot, handles: Array<FileSystemDirectoryHandle | null> | undefined, mode: 'full' | 'incremental') => {
        const list = handles || [null, null];
        for (let slotIndex = 0; slotIndex < list.length; slotIndex++) {
            const handle = list[slotIndex];
            if (!handle || handle.kind !== 'directory') continue;
            await scanRootHandle(root, slotIndex, handle, mode);
        }
     }, [scanRootHandle]);

    const runScan = useCallback(async (fn: () => Promise<void>) => {
        setIsLoading(true);
        try {
            await fn();
        } finally {
            await refreshSoundLibrary();
            await syncSoundAssistantKeywordCategories();
            setIsLoading(false);
            setLoadingMessage('');
        }
    }, [refreshSoundLibrary, syncSoundAssistantKeywordCategories]);

    useEffect(() => {
        if (didInitialKeywordSyncRef.current) return;
        if (!soundLibrary || soundLibrary.length === 0) return;
        didInitialKeywordSyncRef.current = true;
        void syncSoundAssistantKeywordCategories();
    }, [soundLibrary, syncSoundAssistantKeywordCategories]);

    const handleLinkRoot = async (root: SoundLibraryRoot, slotIndex: number) => {
        try {
            const handle = await (window as any).showDirectoryPicker();
            if (handle.kind !== 'directory') return;
            if (typeof (handle as any).requestPermission === 'function') {
                const permission = await (handle as any).requestPermission({ mode: 'read' });
                if (permission !== 'granted') {
                    alert('需要文件夹读取权限才能继续。');
                    return;
                }
            }
            await soundLibraryRepository.saveRootHandle(root, slotIndex, handle);

            const current = rootHandles[root] || [null, null];
            const nextHandles: Array<FileSystemDirectoryHandle | null> = [
                current[0] || null,
                current[1] || null,
            ];
            nextHandles[slotIndex] = handle;
            setRootHandles((prev) => ({ ...prev, [root]: nextHandles }));

            await runScan(async () => {
                await scanRootHandle(root, slotIndex, handle, 'incremental');
            });
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') return;
            console.error("选择文件夹时出错:", err);
        }
    };

    const handleRefreshAll = () => {
        openConfirmModal(
            '更新音效库',
            '将对已关联的“音乐/音效”根目录执行增量扫描：新增文件会导入，删除文件会移除（重命名会视为“删除+新增”）。',
            async () => {
                const ok = await soundLibraryRepository.requestRootReadPermission();
                if (!ok) {
                    alert('需要授权读取音效库文件夹权限，才能更新音效库。');
                    return;
                }
                await runScan(async () => {
                    await scanRoot('music', rootHandles.music, 'incremental');
                    await scanRoot('sfx', rootHandles.sfx, 'incremental');
                });
            },
            '开始更新',
            '取消'
        );
    };

    const filteredSounds = useMemo(() => {
        const term = (searchTerm || '').trim().toLowerCase();
        return soundLibrary.filter(sound => {
            const cat = (sound.category || '').toLowerCase();
            const isMusicLike = cat.startsWith('music') || cat.startsWith('ambience');
            const matchesTab =
                activeTab === 'all' ||
                (activeTab === 'music' ? isMusicLike : !isMusicLike);
            const matchesSearch = term === '' || sound.name.toLowerCase().includes(term);
            return matchesTab && matchesSearch;
        });
    }, [soundLibrary, activeTab, searchTerm]);

    const formatDuration = (seconds: number) => {
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        return `${min}:${sec.toString().padStart(2, '0')}`;
    };

    const hasAnyLinkedRoot = useMemo(() => {
        const music = rootHandles.music || [];
        const sfx = rootHandles.sfx || [];
        return [...music, ...sfx].some((h) => !!h && h.kind === 'directory');
    }, [rootHandles]);

    return (
        <div className="h-full flex flex-col bg-slate-800 text-slate-100 p-3 relative">
            {isLoading && (
                <div className="absolute inset-0 bg-slate-900/70 z-20 flex flex-col items-center justify-center">
                    <LoadingSpinner />
                    <p className="mt-2 text-sm text-sky-300">{loadingMessage}</p>
                </div>
            )}
            <div className="flex justify-between items-center mb-2 flex-shrink-0">
                <h2 className="text-lg font-semibold text-slate-300">音效库</h2>
                <button
                    onClick={handleRefreshAll}
                    disabled={!hasAnyLinkedRoot}
                    className="flex items-center text-sm text-sky-300 hover:text-sky-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md disabled:opacity-50"
                >
                    <ArrowPathIcon className="w-4 h-4 mr-2" />
                    更新
                </button>
            </div>
            
            <div className="mb-3 flex-shrink-0 space-y-2 border-b border-slate-700 pb-3">
                <p className="text-sm font-medium text-slate-400">关联根目录</p>
                <div className="grid grid-cols-2 gap-2">
                    {([
                        { root: 'music' as const, slotIndex: 0, title: '音乐文件夹 1' },
                        { root: 'music' as const, slotIndex: 1, title: '音乐文件夹 2' },
                        { root: 'sfx' as const, slotIndex: 0, title: '音效文件夹 1' },
                        { root: 'sfx' as const, slotIndex: 1, title: '音效文件夹 2' },
                    ]).map(({ root, slotIndex, title }) => {
                        const handle = rootHandles[root]?.[slotIndex];
                        return (
                            <div key={`${root}-${slotIndex}`} className="p-2 bg-slate-700 rounded-md text-sm">
                                <div className="font-semibold mb-1.5 flex items-center gap-2">
                                    <FolderOpenIcon className="w-4 h-4 text-slate-300" />
                                    <span>{title}</span>
                                </div>
                                {handle ? (
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs text-slate-400 truncate pr-2" title={handle.name}>已关联: {handle.name}</p>
                                        <div className="flex items-center space-x-2 flex-shrink-0">
                                            <button onClick={() => handleLinkRoot(root, slotIndex)} className="text-xs text-sky-400 hover:underline">更换</button>
                                            <button
                                                onClick={() => {
                                                    const handles = (rootHandles[root] || []).filter((h) => h && h.kind === 'directory');
                                                    void runScan(async () => {
                                                        await scanRoot(root, handles, 'incremental');
                                                    });
                                                }}
                                                className="text-xs text-sky-400 hover:underline"
                                            >
                                                更新
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button onClick={() => handleLinkRoot(root, slotIndex)} className="w-full text-xs text-center py-1 bg-slate-600 hover:bg-sky-600 rounded">
                                        选择文件夹
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="mb-3 flex-shrink-0 space-y-2 border-b border-slate-700 pb-3">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-slate-400">音效助手关键词（按分类）</p>
                        <p className="text-xs text-slate-500">分类自动对应“根目录下第一层文件夹名”；该分类内的关键词只在对应文件夹（含子文件夹）里匹配。</p>
                    </div>
                    <button
                        onClick={() => setIsKeywordPanelOpen((v) => !v)}
                        className="text-xs text-sky-300 hover:text-sky-100 px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded"
                    >
                        {isKeywordPanelOpen ? '收起' : '展开'}
                    </button>
                </div>
                {isKeywordPanelOpen && (
                    <div className="space-y-2">
                        {duplicateTopFoldersWarning.length > 0 && (
                            <div className="text-xs text-amber-200 bg-amber-900/30 border border-amber-700/40 rounded-md p-2">
                                <div className="font-semibold mb-1">发现重名文件夹</div>
                                <div className="leading-relaxed">
                                    {duplicateTopFoldersWarning.join('；')}。请修改文件夹名称，避免关键词匹配范围混乱。
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                            {keywordCategoryDefs.map(({ key, name }) => {
                            const keywordCount = (soundObservationByCategory?.[key] || []).length;
                            const isEditing = editingKeywordCategory?.key === key;

                            return (
                                <button
                                    key={key}
                                    onClick={() => {
                                        setEditingKeywordCategory({ key, name });
                                        setKeywordEditorText(getKeywordTextForCategory(key));
                                    }}
                                    className={`p-2 rounded-md text-left text-sm border ${
                                        isEditing ? 'bg-sky-900/30 border-sky-600' : 'bg-slate-700 border-slate-700 hover:border-slate-500'
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="font-semibold">{name}</div>
                                        <div className="text-xs text-slate-400">{keywordCount} 词</div>
                                    </div>
                                    <div className="mt-1 text-xs text-slate-400 truncate">
                                        {(soundObservationByCategory?.[key] || []).slice(0, 6).join('、') || '点击编辑关键词…'}
                                    </div>
                                </button>
                            );
                            })}
                        </div>
                    </div>
                )}
            </div>

            <div className="flex-shrink-0 flex flex-col gap-y-2">
                 <div className="flex border-b border-slate-700">
                    <button onClick={() => setActiveTab('all')} className={`px-3 py-1.5 text-sm ${activeTab === 'all' ? 'border-b-2 border-sky-400 text-sky-300' : 'text-slate-400'}`}>全部</button>
                    <button onClick={() => setActiveTab('sfx')} className={`px-3 py-1.5 text-sm ${activeTab === 'sfx' ? 'border-b-2 border-sky-400 text-sky-300' : 'text-slate-400'}`}>音效</button>
                    <button onClick={() => setActiveTab('music')} className={`px-3 py-1.5 text-sm ${activeTab === 'music' ? 'border-b-2 border-sky-400 text-sky-300' : 'text-slate-400'}`}>音乐</button>
                </div>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <MagnifyingGlassIcon className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="搜索音频..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full p-1.5 pl-9 bg-slate-700 text-slate-100 rounded-md border border-slate-600 focus:ring-sky-500 focus:border-sky-500 text-sm"
                    />
                </div>
            </div>

            <div className="flex-grow overflow-y-auto space-y-1 pr-1 -mr-2 mt-2">
                {filteredSounds.length > 0 ? (
                    filteredSounds.map(sound => (
                        <div key={sound.id ?? `${sound.category}-${sound.name}`} className="p-2 bg-slate-700/50 hover:bg-sky-800/50 rounded-md cursor-pointer flex justify-between items-center text-sm">
                            <span className="truncate pr-2" title={sound.name}>
                                {(() => {
                                    const fileName = getSoundFileNameFromSoundName(sound.name) ?? sound.name;
                                    const folderName = getNearestFolderNameFromSoundName(sound.name);
                                    return folderName ? `${fileName} / ${folderName}` : fileName;
                                })()}
                            </span>
                            <span className="text-xs text-slate-400 font-mono flex-shrink-0">{formatDuration(sound.duration)}</span>
                        </div>
                    ))
                ) : (
                    <div className="h-full flex items-center justify-center text-center text-slate-500 text-sm">
                        <p>{soundLibrary.length === 0 ? '请先关联本地文件夹' : '未找到匹配的音效'}</p>
                    </div>
                )}
            </div>

            {editingKeywordCategory && (
                <div
                    className="fixed inset-0 bg-black/75 flex items-center justify-center z-[200] p-4"
                    onClick={() => {
                        setEditingKeywordCategory(null);
                        setKeywordEditorText('');
                    }}
                >
                    <div
                        className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-3xl border border-slate-700 flex flex-col h-[70vh]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-3 flex-shrink-0">
                            <h2 className="text-lg font-semibold text-slate-100">
                                音效助手关键词：{editingKeywordCategory.name}
                            </h2>
                            <button
                                onClick={() => {
                                    setEditingKeywordCategory(null);
                                    setKeywordEditorText('');
                                }}
                                className="p-1.5 text-slate-300 hover:text-white"
                                aria-label="关闭"
                            >
                                <XMarkIcon />
                            </button>
                        </div>

                        <p className="text-sm text-slate-400 mb-3 flex-shrink-0">
                            直接在下方增删文本（换行或逗号分隔）。本分类的关键词只在对应文件夹（含子文件夹）里匹配。
                        </p>

                        <textarea
                            value={keywordEditorText}
                            onChange={(e) => setKeywordEditorText(e.target.value)}
                            placeholder="例如：脚步、跑出、开门、关门..."
                            className="flex-grow p-3 bg-slate-900 text-slate-100 rounded-md border border-slate-700 resize-none text-sm leading-relaxed"
                        />

                        <div className="flex justify-end gap-3 mt-4 flex-shrink-0">
                            <button
                                onClick={() => setKeywordEditorText('')}
                                className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-md"
                            >
                                清空
                            </button>
                            <button
                                onClick={() => void saveEditingKeywordCategory()}
                                className="px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-md"
                            >
                                保存
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SoundLibraryPanel;
