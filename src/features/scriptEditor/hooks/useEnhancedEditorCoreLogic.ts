import { useState, useEffect, useMemo, useCallback, useRef, Dispatch, SetStateAction } from 'react';
import { Project, ScriptLine, CharacterFilterMode, Chapter } from '../../../types';
import {
  logLocalCodexPerf,
  measureLocalCodexPerfSync,
} from '../../../lib/localCodexPerfDebug';
import { internalParseScriptToChapters } from '../../../lib/scriptParser';
import { useStore } from '../../../store/useStore';

interface UseEnhancedEditorCoreLogicProps {
  projectId: string;
  projects: Project[];
  onProjectUpdate: (project: Project) => void;
}

export const useEnhancedEditorCoreLogic = ({
  projectId,
  projects,
  onProjectUpdate,
}: UseEnhancedEditorCoreLogicProps) => {
  const [isLoadingProject, setIsLoadingProject] = useState(true);
  const {
    selectedChapterId,
    setSelectedChapterId,
    scriptEditorMultiSelectedChapterIds,
    setScriptEditorMultiSelectedChapterIds,
  } = useStore(state => ({
    selectedChapterId: state.selectedChapterId,
    setSelectedChapterId: state.setSelectedChapterId,
    scriptEditorMultiSelectedChapterIds: state.scriptEditorMultiSelectedChapterIds,
    setScriptEditorMultiSelectedChapterIds: state.setScriptEditorMultiSelectedChapterIds,
  }));
  const multiSelectedChapterIds = scriptEditorMultiSelectedChapterIds;
  const setMultiSelectedChapterIds = useCallback<Dispatch<SetStateAction<string[]>>>(
    (value) => {
      const prevIds = useStore.getState().scriptEditorMultiSelectedChapterIds || [];
      const nextIdsRaw = typeof value === 'function' ? value(prevIds) : value;
      const nextIds = Array.from(
        new Set(
          (Array.isArray(nextIdsRaw) ? nextIdsRaw : []).filter(
            (chapterId): chapterId is string =>
              typeof chapterId === 'string' && chapterId.trim() !== ''
          )
        )
      );
      if (
        prevIds.length === nextIds.length &&
        prevIds.every((chapterId, index) => chapterId === nextIds[index])
      ) {
        return;
      }
      setScriptEditorMultiSelectedChapterIds(nextIds);
    },
    [setScriptEditorMultiSelectedChapterIds]
  );
  const [selectedLineForPlayback, setSelectedLineForPlayback] = useState<ScriptLine | null>(null);
  const [focusedScriptLineId, setFocusedScriptLineId] = useState<string | null>(null);
  const [characterFilterMode, setCharacterFilterMode] = useState<CharacterFilterMode>('all');
  const [cvFilter, setCvFilter] = useState<string | null>(null);
  const [history, setHistory] = useState<Project[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyRef = useRef<Project[]>([]);
  const historyIndexRef = useRef(-1);
  const pendingNewChapterIdRef = useRef<string | null>(null);

  const persistedProject = useMemo(
    () => projects.find((project) => project.id === projectId) || null,
    [projects, projectId]
  );
  const currentProject = useMemo(() => {
    const projectFromHistory =
      historyIndex >= 0
        ? history[historyIndex] ?? history[history.length - 1] ?? null
        : null;

    if (projectFromHistory?.id === projectId) {
      if (!persistedProject) {
        return projectFromHistory;
      }

      if (
        (projectFromHistory.lastModified || 0) >=
        (persistedProject.lastModified || 0)
      ) {
        return projectFromHistory;
      }
    }

    return persistedProject ?? projectFromHistory ?? null;
  }, [history, historyIndex, persistedProject, projectId]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  useEffect(() => {
    historyRef.current = history;
    historyIndexRef.current = historyIndex;
  }, [history, historyIndex]);

  useEffect(() => {
    if (currentProject) {
      const sourceProject = currentProject;
      setIsLoadingProject(false);
      
      const isProjectSwitch =
        history.length === 0 || history[history.length - 1].id !== sourceProject.id;
      if (isProjectSwitch) {
        historyRef.current = [sourceProject];
        historyIndexRef.current = 0;
        setHistory([sourceProject]);
        setHistoryIndex(0);
        setCvFilter(null); // Reset filter on project change
        // NOTE: Initial chapter selection is now fully handled by the `setSelectedProjectId` action in the store,
        // which correctly restores the last viewed chapter or the first chapter.
      }
      
      // If the selected chapter ID is no longer valid (e.g., deleted), clear it.
      // 防抖：如果是刚拆章产生的新 ID，等待下一次项目刷新再决定，避免误清空。
      if (selectedChapterId && !sourceProject.chapters.some(ch => ch.id === selectedChapterId)) {
        const latest = history.length > 0 ? history[history.length - 1] : null;
        const existsInLatest = latest?.chapters?.some(ch => ch.id === selectedChapterId);
        const isPendingNewChapter = pendingNewChapterIdRef.current === selectedChapterId;
        if (!existsInLatest && !isPendingNewChapter) {
          console.info('[Editor] clearing selectedChapterId because not found in currentProject', {
            selectedChapterId,
            chapters: sourceProject.chapters.length,
            projectHasPending: sourceProject.chapters.some(ch => ch.id === pendingNewChapterIdRef.current),
          });
          setSelectedChapterId(null);
        }
      } else if (pendingNewChapterIdRef.current && sourceProject.chapters.some(ch => ch.id === pendingNewChapterIdRef.current)) {
        // 新章节已反映到 props，清理 pending 状态
        console.info('[Editor] pending new chapter now present, clearing pending flag', { pendingId: pendingNewChapterIdRef.current });
        pendingNewChapterIdRef.current = null;
      }
    }
  }, [currentProject, selectedChapterId, history, setSelectedChapterId]);

  const resolveLatestProjectSnapshot = useCallback(() => {
    const projectFromHistory =
      historyIndexRef.current >= 0
        ? historyRef.current[historyIndexRef.current] ??
          historyRef.current[historyRef.current.length - 1] ??
          null
        : null;

    if (projectFromHistory?.id === projectId) {
      return projectFromHistory;
    }

    const projectFromStore = useStore.getState().projects.find(p => p.id === projectId);
    if (projectFromStore) {
      return projectFromStore;
    }

    return currentProject ?? projectFromHistory ?? null;
  }, [currentProject, projectId]);

  const applyUndoableProjectUpdate = useCallback((updater: (prevProject: Project) => Project) => {
    // Always base updates on the latest in-memory snapshot so sequential chapter writes do not
    // overwrite each other with an older project closure.
    const projectToUpdate = resolveLatestProjectSnapshot();
    if (!projectToUpdate) return;

    const { result: updatedProject, durationMs: updaterDurationMs } = measureLocalCodexPerfSync(
      'useEnhancedEditorCoreLogic.applyUndoableProjectUpdate.updater',
      () => updater(projectToUpdate)
    );
    const newProject = {
      ...updatedProject,
      lastModified: Date.now(),
    };
    const { result: nextHistory, durationMs: historyUpdateDurationMs } = measureLocalCodexPerfSync(
      'useEnhancedEditorCoreLogic.applyUndoableProjectUpdate.historyUpdate',
      () => {
        const computedHistory = [
          ...historyRef.current.slice(0, historyIndexRef.current + 1),
          newProject,
        ];

        historyRef.current = computedHistory;
        historyIndexRef.current = computedHistory.length - 1;
        setHistory(computedHistory);
        setHistoryIndex(computedHistory.length - 1);
        return computedHistory;
      }
    );
    const { result: onProjectUpdateResult, durationMs: onProjectUpdateDurationMs } =
      measureLocalCodexPerfSync(
        'useEnhancedEditorCoreLogic.applyUndoableProjectUpdate.onProjectUpdate',
        () => onProjectUpdate(newProject)
      );

    logLocalCodexPerf('useEnhancedEditorCoreLogic.applyUndoableProjectUpdate', {
      projectId: newProject.id,
      chapterCount: newProject.chapters.length,
      historyLength: nextHistory.length,
      updaterDurationMs,
      historyUpdateDurationMs,
      onProjectUpdateDurationMs,
      onProjectUpdateReturnedPromise:
        !!onProjectUpdateResult &&
        typeof (onProjectUpdateResult as Promise<unknown>).then === 'function',
    });
  }, [onProjectUpdate, resolveLatestProjectSnapshot]);

  const undo = useCallback(() => {
    if (canUndo) {
      const newIndex = historyIndexRef.current - 1;
      if (newIndex < 0) return;

      historyIndexRef.current = newIndex;
      setHistoryIndex(newIndex);
      onProjectUpdate(historyRef.current[newIndex]);
    }
  }, [canUndo, onProjectUpdate]);

  const redo = useCallback(() => {
    if (canRedo) {
      const newIndex = historyIndexRef.current + 1;
      if (newIndex >= historyRef.current.length) return;

      historyIndexRef.current = newIndex;
      setHistoryIndex(newIndex);
      onProjectUpdate(historyRef.current[newIndex]);
    }
  }, [canRedo, onProjectUpdate]);
  
  const parseProjectChaptersAndUpdateHistory = useCallback(() => {
    if (!currentProject || !currentProject.rawFullScript) return;
    const newChapters = internalParseScriptToChapters(currentProject.rawFullScript, currentProject.name);
    applyUndoableProjectUpdate(prev => ({ ...prev, chapters: newChapters }));
  }, [currentProject, applyUndoableProjectUpdate]);

  const updateChapterTitleInHistory = useCallback((chapterId: string, newTitle: string) => {
    applyUndoableProjectUpdate(prev => ({
      ...prev,
      chapters: prev.chapters.map(ch => ch.id === chapterId ? { ...ch, title: newTitle } : ch)
    }));
  }, [applyUndoableProjectUpdate]);

  const undoableUpdateChapterRawContent = useCallback((chapterId: string, newRawContent: string) => {
    applyUndoableProjectUpdate(prev => ({
        ...prev,
        chapters: prev.chapters.map(ch =>
            ch.id === chapterId ? { ...ch, rawContent: newRawContent, scriptLines: [] } : ch
        )
    }));
  }, [applyUndoableProjectUpdate]);

  const insertChapterAfter = useCallback((afterChapterId: string) => {
    // ����� CV ɸѡ��ȷ���²����½������ɼ�
    setCvFilter(null);
    const newChapter: Chapter = {
        id: `ch_${Date.now()}_${Math.random()}`,
        title: `���½�`,
        rawContent: '',
        scriptLines: [],
    };
    
    applyUndoableProjectUpdate(prevProject => {
      const afterIndex = prevProject.chapters.findIndex(c => c.id === afterChapterId);
      if (afterIndex === -1) {
        return {
          ...prevProject,
          chapters: [...prevProject.chapters, newChapter],
        };
      }

      const newChapters = [...prevProject.chapters];
      newChapters.splice(afterIndex + 1, 0, newChapter);

      return {
        ...prevProject,
        chapters: newChapters,
      };
    });

    // ѡ���²�����½ڡ�Ϊ��������Ŀ�첽�������ǰ������Чѡ�С��߼���գ����������ӳ١�
    setTimeout(() => setSelectedChapterId(newChapter.id), 50);
    // �����ǰӦ���� CV ���ˣ��½��½�ͨ��û���лᱻ���˵���
    // ѡ���½��Ѿ��ᱻǿ�Ʊ�������Ϊ�˸�ֱ�ۣ�����ͬʱ���һ�� CV ���ˡ�
    setCvFilter(null);
  }, [applyUndoableProjectUpdate, setSelectedChapterId, setCvFilter]);

  const mergeChapters = useCallback((chapterIds: string[], targetChapterId: string) => {
    applyUndoableProjectUpdate(prevProject => {
      const targetChapter = prevProject.chapters.find(ch => ch.id === targetChapterId);
      if (!targetChapter) return prevProject;

      const chaptersToMerge = prevProject.chapters
        .filter(ch => chapterIds.includes(ch.id))
        .sort((a,b) => prevProject.chapters.findIndex(c => c.id === a.id) - prevProject.chapters.findIndex(c => c.id === b.id));

      // Fallback: ����½ڵ� rawContent Ϊ�գ�����̨���ı�ƴ�ӣ����⡰������û�仯��������
      const getSafeRawContent = (ch: Chapter): string => {
        const trimmed = (ch.rawContent || '').trim();
        if (trimmed.length > 0) return trimmed;
        return (ch.scriptLines || []).map(l => l.text).join('\n');
      };

      let mergedRawContentParts: string[] = [];
      let mergedScriptLines: ScriptLine[] = [];
      chaptersToMerge.forEach(ch => {
        mergedRawContentParts.push(getSafeRawContent(ch));
        mergedScriptLines = mergedScriptLines.concat(ch.scriptLines);
      });

      const mergedRawContent = mergedRawContentParts.join('\n\n').trim();
      
      const newChapters = prevProject.chapters
        .map(ch => ch.id === targetChapterId ? { ...ch, rawContent: mergedRawContent, scriptLines: mergedScriptLines } : ch)
        .filter(ch => !chapterIds.includes(ch.id) || ch.id === targetChapterId);

      return { ...prevProject, chapters: newChapters };
    });
    setSelectedChapterId(targetChapterId);
    setMultiSelectedChapterIds([]);
  }, [applyUndoableProjectUpdate, setSelectedChapterId, setMultiSelectedChapterIds]);

  const splitChapterAtLine = useCallback((chapterId: string, lineId: string) => {
    const newChapterId = `ch_${Date.now()}_${Math.random()}`;
    let didSplit = false;

    console.info('[splitChapterAtLine] start', { chapterId, lineId, newChapterId });

    applyUndoableProjectUpdate(prevProject => {
      // 优先使用当前选中章节；如果不包含该行，再全局查找一次，避免因状态不同步导致拆分失败。
      let chapterIndex = prevProject.chapters.findIndex(ch => ch.id === chapterId && ch.scriptLines.some(l => l.id === lineId));
      if (chapterIndex === -1) {
        chapterIndex = prevProject.chapters.findIndex(ch => ch.scriptLines.some(l => l.id === lineId));
      }
      if (chapterIndex === -1) {
        console.warn('[splitChapterAtLine] abort: no chapter contains lineId', { chapterId, lineId });
        return prevProject;
      }

      const chapter = prevProject.chapters[chapterIndex];
      const lineIndex = chapter.scriptLines.findIndex(l => l.id === lineId);
      if (lineIndex === -1) {
        console.warn('[splitChapterAtLine] abort: lineId not found in chapter', { chapterId: chapter.id, lineId });
        return prevProject;
      }

      // 如果拆分点在第一条或最后一条，仍允许拆分：前半/后半允许为空。
      const beforeLines = chapter.scriptLines.slice(0, lineIndex);
      const afterLines = chapter.scriptLines.slice(lineIndex);
      const beforeRaw = beforeLines.map(l => l.text).join('\n');
      const afterRaw = afterLines.map(l => l.text).join('\n');

      const newChapter: Chapter = {
        id: newChapterId,
        title: `${chapter.title || '新章节'}（下）`,
        rawContent: afterRaw,
        scriptLines: afterLines,
      };

      const updatedCurrent: Chapter = {
        ...chapter,
        rawContent: beforeRaw,
        scriptLines: beforeLines,
      };

      const newChapters = [...prevProject.chapters];
      newChapters[chapterIndex] = updatedCurrent;
      newChapters.splice(chapterIndex + 1, 0, newChapter);

      didSplit = true;
      console.info('[splitChapterAtLine] split done', {
        chapterId: chapter.id,
        lineId,
        newChapterId,
        beforeCount: beforeLines.length,
        afterCount: afterLines.length,
        chapterIndex,
      });
      return { ...prevProject, chapters: newChapters };
    });

    // 只有真正拆分成功才切换选中章节
    if (didSplit) {
      pendingNewChapterIdRef.current = newChapterId;
      console.info('[splitChapterAtLine] selecting new chapter', { newChapterId });
      setTimeout(() => setSelectedChapterId(newChapterId), 50);
      setMultiSelectedChapterIds([]);
    }
  }, [applyUndoableProjectUpdate, setSelectedChapterId, setMultiSelectedChapterIds]);

  return {
    currentProject,
    isLoadingProject,
    selectedChapterId,
    setSelectedChapterId,
    multiSelectedChapterIds,
    setMultiSelectedChapterIds,
    selectedLineForPlayback,
    setSelectedLineForPlayback,
    focusedScriptLineId,
    setFocusedScriptLineId,
    characterFilterMode,
    setCharacterFilterMode,
    cvFilter,
    setCvFilter,
    applyUndoableProjectUpdate,
    parseProjectChaptersAndUpdateHistory,
    updateChapterTitleInHistory,
    undoableUpdateChapterRawContent,
    undo,
    redo,
    canUndo,
    canRedo,
    insertChapterAfter,
    mergeChapters,
    splitChapterAtLine,
  };
};
