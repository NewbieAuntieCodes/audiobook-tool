import { StateCreator } from 'zustand';
import { AppState } from '../useStore'; // Import AppState for cross-slice type reference
import { AppView, ScriptLine, Character, PostProductionLufsSettings } from '../../types';
import React from 'react';
import { db } from '../../db';
import { miscRepository } from '../../repositories';

export type AiProvider = 'gemini' | 'openai' | 'moonshot' | 'deepseek';
export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected';

export interface ApiSettings {
  gemini: { apiKey: string; baseUrl?: string };
  openai: { apiKey: string; baseUrl: string; model: string };
  moonshot: { apiKey: string; baseUrl: string; model: string };
  deepseek: { apiKey: string; baseUrl: string; model: string };
}

export interface LufsSettings {
  enabled: boolean;
  target: number;
}

export const defaultPostProductionLufsSettings: PostProductionLufsSettings = {
  voice: { enabled: false, target: -18 },
  ambience: { enabled: false, target: -45 },
  sfx: { enabled: false, target: -30 },
  music: { enabled: false, target: -40 },
};

export const SOUND_OBSERVATION_GLOBAL_CATEGORY_KEY = '__global__';

const normalizeKeywordList = (list: string[]): string[] => {
  const trimmed = (list || []).map((s) => (s || '').trim()).filter(Boolean);
  return Array.from(new Set(trimmed)).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
};

const computeSoundObservationUnion = (map: Record<string, string[]>): string[] => {
  const all: string[] = [];
  for (const items of Object.values(map || {})) {
    all.push(...(items || []));
  }
  return normalizeKeywordList(all);
};


export interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  onConfirm: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
}

const confirmModalInitState: ConfirmModalState = {
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
};

export interface UiSlice {
  currentView: AppView;
  isLoading: boolean;
  selectedProjectId: string | null;
  selectedChapterId: string | null;
  aiProcessingChapterIds: string[];
  playingLineInfo: { line: ScriptLine; character: Character | undefined } | null;
  confirmModal: ConfirmModalState;
  characterAndCvStyleModal: {
    isOpen: boolean;
    characterToEdit: Character | null;
  };
  waveformEditor: {
    isOpen: boolean;
    lineId: string;
    lineIndex: number;
    sourceAudioInfo: { id: string; filename: string; } | null;
  };
  isSettingsModalOpen: boolean;
  isShortcutSettingsModalOpen: boolean;
  apiSettings: ApiSettings;
  selectedAiProvider: AiProvider;
  characterShortcuts: Record<string, string>; // key: keyboard key, value: characterId
  audioAlignmentCvFilter: string;
  audioAlignmentCharacterFilter: string;
  audioAlignmentMultiSelectedChapterIds: string[];
  activeRecordingLineId: string | null;
  webSocketStatus: WebSocketStatus;
  webSocketConnect: (() => void) | null;
  lufsSettings: LufsSettings;
  soundObservationList: string[];
  soundObservationByCategory: Record<string, string[]>;
  isRecordingMode: boolean;
  postProductionLufsSettings: PostProductionLufsSettings;

  // Timeline State
  timelineIsPlaying: boolean;
  timelineCurrentTime: number;
  timelineZoom: number;


  navigateTo: (view: AppView) => void;
  setIsLoading: (loading: boolean) => void;
  setSelectedProjectId: (id: string | null) => void;
  setSelectedChapterId: (id: string | null) => Promise<void>;
  addAiProcessingChapterId: (id: string) => void;
  removeAiProcessingChapterId: (id: string) => void;
  setPlayingLine: (line: ScriptLine, character: Character | undefined) => void;
  clearPlayingLine: () => void;
  openConfirmModal: (
    title: string,
    message: React.ReactNode,
    onConfirm: () => void,
    confirmText?: string,
    cancelText?: string,
    onCancel?: () => void
  ) => void;
  closeConfirmModal: () => void;
  openCharacterAndCvStyleModal: (character: Character | null) => void;
  closeCharacterAndCvStyleModal: () => void;
  openWaveformEditor: (lineId: string, lineIndex: number, sourceAudioId: string, sourceAudioFilename: string) => void;
  closeWaveformEditor: () => void;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;
  openShortcutSettingsModal: () => void;
  closeShortcutSettingsModal: () => void;
  setApiSettings: (settings: ApiSettings) => Promise<void>;
  setSelectedAiProvider: (provider: AiProvider) => Promise<void>;
  setCharacterShortcuts: (shortcuts: Record<string, string>) => Promise<void>;
  setAudioAlignmentCvFilter: (filter: string) => void;
  setAudioAlignmentCharacterFilter: (filter: string) => void;
  setAudioAlignmentMultiSelectedChapterIds: (ids: string[]) => void;
  setActiveRecordingLineId: (id: string | null) => void;
  setWebSocketStatus: (status: WebSocketStatus) => void;
  setWebSocketConnect: (connector: (() => void) | null) => void;
  setLufsSettings: (settings: Partial<LufsSettings>) => Promise<void>;
  setPostProductionLufsSettings: (settings: Partial<PostProductionLufsSettings>) => Promise<void>;
  setSoundObservationList: (list: string[]) => Promise<void>;
  setSoundObservationByCategory: (categoryKey: string, keywords: string[]) => Promise<void>;
  replaceSoundObservationByCategory: (map: Record<string, string[]>) => Promise<void>;
  setRecordingMode: (enabled: boolean) => void;
  goToNextLine: () => Promise<void>;

  // Timeline Actions
  setTimelineIsPlaying: (isPlaying: boolean) => void;
  setTimelineCurrentTime: (time: number) => void;
  stopTimeline: () => void;
  setTimelineZoom: (zoom: number) => void;
}

export const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set, get) => ({
  currentView: "dashboard", // Initial default
  isLoading: false,
  selectedProjectId: null,
  selectedChapterId: null,
  aiProcessingChapterIds: [],
  playingLineInfo: null,
  confirmModal: confirmModalInitState,
  characterAndCvStyleModal: { isOpen: false, characterToEdit: null },
  waveformEditor: { isOpen: false, lineId: '', lineIndex: -1, sourceAudioInfo: null },
  isSettingsModalOpen: false,
  isShortcutSettingsModalOpen: false,
  apiSettings: {
    gemini: { apiKey: '' },
    openai: { apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4-turbo' },
    moonshot: { apiKey: '', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
    deepseek: { apiKey: '', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  },
  selectedAiProvider: 'gemini',
  characterShortcuts: {},
  audioAlignmentCvFilter: '',
  audioAlignmentCharacterFilter: '',
  audioAlignmentMultiSelectedChapterIds: [],
  activeRecordingLineId: null,
  webSocketStatus: 'disconnected',
  webSocketConnect: null,
  lufsSettings: { enabled: false, target: -18 },
  soundObservationList: [],
  soundObservationByCategory: {},
  isRecordingMode: false,
  postProductionLufsSettings: defaultPostProductionLufsSettings,

  // Timeline State
  timelineIsPlaying: false,
  timelineCurrentTime: 0,
  timelineZoom: 0.1,

  navigateTo: (view) => set({ currentView: view }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setSelectedProjectId: (id) => {
    if (id) {
        const { projects } = get();
        const project = projects.find(p => p.id === id);
        // Restore last viewed chapter, or default to first chapter, or null if no chapters.
        const chapterIdToSet = project?.lastViewedChapterId || project?.chapters[0]?.id || null;
        set({ selectedProjectId: id, selectedChapterId: chapterIdToSet });
    } else {
        set({ selectedProjectId: null, selectedChapterId: null });
    }
  },
  setSelectedChapterId: async (id) => {
    const { selectedProjectId } = get();
    // Update UI state immediately for responsiveness
    set({ selectedChapterId: id });

    if (selectedProjectId && id) {
        // 只更新 lastViewedChapterId，避免用旧快照覆盖最新章节列表
        await db.projects.update(selectedProjectId, { lastViewedChapterId: id });
        set(state => ({
            projects: state.projects.map(p => p.id === selectedProjectId ? { ...p, lastViewedChapterId: id } : p),
        }));
    }
  },
  addAiProcessingChapterId: (id) =>
    set((state) => ({
      aiProcessingChapterIds: state.aiProcessingChapterIds.includes(id)
        ? state.aiProcessingChapterIds
        : [...state.aiProcessingChapterIds, id],
    })),
  removeAiProcessingChapterId: (id) =>
    set((state) => ({
      aiProcessingChapterIds: state.aiProcessingChapterIds.filter(
        (chapterId) => chapterId !== id
      ),
    })),
  setPlayingLine: (line, character) => set({ playingLineInfo: { line, character } }),
  clearPlayingLine: () => set({ playingLineInfo: null }),

  openConfirmModal: (title, message, onConfirm, confirmText, cancelText, onCancel) => {
    set({
      confirmModal: {
        isOpen: true,
        title,
        message,
        onConfirm,
        onCancel,
        confirmText,
        cancelText,
      }
    });
  },
  closeConfirmModal: () => set({ confirmModal: confirmModalInitState }),
  openCharacterAndCvStyleModal: (character) => set({ characterAndCvStyleModal: { isOpen: true, characterToEdit: character } }),
  closeCharacterAndCvStyleModal: () => set({ characterAndCvStyleModal: { isOpen: false, characterToEdit: null } }),
  openWaveformEditor: (lineId, lineIndex, sourceAudioId, sourceAudioFilename) => set({
    waveformEditor: {
      isOpen: true,
      lineId,
      lineIndex,
      sourceAudioInfo: { id: sourceAudioId, filename: sourceAudioFilename }
    }
  }),
  closeWaveformEditor: () => set({ waveformEditor: { isOpen: false, lineId: '', lineIndex: -1, sourceAudioInfo: null } }),
  openSettingsModal: () => set({ isSettingsModalOpen: true }),
  closeSettingsModal: () => set({ isSettingsModalOpen: false }),
  openShortcutSettingsModal: () => set({ isShortcutSettingsModalOpen: true }),
  closeShortcutSettingsModal: () => set({ isShortcutSettingsModalOpen: false }),
  setApiSettings: async (settings) => {
    await db.misc.put({ key: 'apiSettings', value: settings });
    set({ apiSettings: settings });
  },
  setSelectedAiProvider: async (provider) => {
    await db.misc.put({ key: 'selectedAiProvider', value: provider });
    set({ selectedAiProvider: provider });
  },
  setCharacterShortcuts: async (shortcuts) => {
    await db.misc.put({ key: 'characterShortcuts', value: shortcuts });
    set({ characterShortcuts: shortcuts });
  },
  setSoundObservationList: async (list) => {
    const currentMap = get().soundObservationByCategory || {};
    const normalized = normalizeKeywordList(list);
    const nextMap = { ...currentMap };
    if (normalized.length > 0) nextMap[SOUND_OBSERVATION_GLOBAL_CATEGORY_KEY] = normalized;
    else delete nextMap[SOUND_OBSERVATION_GLOBAL_CATEGORY_KEY];

    const union = computeSoundObservationUnion(nextMap);
    await Promise.all([
      miscRepository.saveSoundObservationByCategory(nextMap),
      miscRepository.saveSoundObservationList(union),
    ]);
    set({ soundObservationByCategory: nextMap, soundObservationList: union });
  },
  setSoundObservationByCategory: async (categoryKey, keywords) => {
    const key = (categoryKey || '').trim();
    if (!key) return;

    const currentMap = get().soundObservationByCategory || {};
    const normalized = normalizeKeywordList(keywords);
    const nextMap = { ...currentMap };
    if (normalized.length > 0) nextMap[key] = normalized;
    else delete nextMap[key];

    const union = computeSoundObservationUnion(nextMap);
    await Promise.all([
      miscRepository.saveSoundObservationByCategory(nextMap),
      miscRepository.saveSoundObservationList(union),
    ]);
    set({ soundObservationByCategory: nextMap, soundObservationList: union });
  },
  replaceSoundObservationByCategory: async (map) => {
    const raw = map && typeof map === 'object' ? map : {};
    const nextMap: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(raw)) {
      const key = (k || '').trim();
      if (!key) continue;
      const normalized = normalizeKeywordList(Array.isArray(v) ? v : []);
      if (normalized.length > 0) nextMap[key] = normalized;
    }

    const union = computeSoundObservationUnion(nextMap);
    await Promise.all([
      miscRepository.saveSoundObservationByCategory(nextMap),
      miscRepository.saveSoundObservationList(union),
    ]);
    set({ soundObservationByCategory: nextMap, soundObservationList: union });
  },
  setAudioAlignmentCvFilter: (filter) => set({ audioAlignmentCvFilter: filter }),
  setAudioAlignmentCharacterFilter: (filter) => set({ audioAlignmentCharacterFilter: filter }),
  setAudioAlignmentMultiSelectedChapterIds: (ids) => set({ audioAlignmentMultiSelectedChapterIds: ids }),
  setActiveRecordingLineId: (id) => set({ activeRecordingLineId: id }),
  setWebSocketStatus: (status) => set({ webSocketStatus: status }),
  setWebSocketConnect: (connector) => set({ webSocketConnect: connector }),
  setLufsSettings: async (settingsUpdate) => {
    const newSettings = { ...get().lufsSettings, ...settingsUpdate };
    await db.misc.put({ key: 'lufsSettings', value: newSettings });
    set({ lufsSettings: newSettings });
  },
  setPostProductionLufsSettings: async (settingsUpdate) => {
    const prev = get().postProductionLufsSettings;
    const newSettings: PostProductionLufsSettings = {
      ...prev,
      ...settingsUpdate,
    };
    await db.misc.put({ key: 'postProductionLufsSettings', value: newSettings });
    set({ postProductionLufsSettings: newSettings });
  },
  setRecordingMode: (enabled) => set({ isRecordingMode: enabled }),
  goToNextLine: async () => {
    const {
        projects, selectedProjectId, selectedChapterId, characters, activeRecordingLineId,
        audioAlignmentCvFilter, audioAlignmentCharacterFilter, setSelectedChapterId,
    } = get();

    if (!selectedProjectId) return;
    const project = projects.find(p => p.id === selectedProjectId);
    if (!project) return;
    
    const nonAudioCharacterIds = characters
        .filter(c => c.name === '[静音]' || c.name === '音效' || c.name === '[音效]')
        .map(c => c.id);

    const isLineMatch = (line: ScriptLine): boolean => {
        if (nonAudioCharacterIds.includes(line.characterId || '')) return false;
        
        const lineCharacter = characters.find(c => c.id === line.characterId);
        if (!lineCharacter) return false;

        const cvFilterActive = !!audioAlignmentCvFilter;
        const charFilterActive = !!audioAlignmentCharacterFilter;
        
        if (!cvFilterActive && !charFilterActive) return true;
        
        const cvMatch = !cvFilterActive || (lineCharacter.cvName === audioAlignmentCvFilter);
        const charMatch = !charFilterActive || (lineCharacter.id === audioAlignmentCharacterFilter);
        
        return cvMatch && charMatch;
    };

    let foundCurrent = !activeRecordingLineId;
    let nextLine: (ScriptLine & { chapterId: string }) | null = null;

    for (const chapter of project.chapters) {
        for (const line of chapter.scriptLines) {
            if (foundCurrent) {
                if (isLineMatch(line)) {
                    nextLine = { ...line, chapterId: chapter.id };
                    break;
                }
            } else if (line.id === activeRecordingLineId) {
                foundCurrent = true;
            }
        }
        if (nextLine) {
            break;
        }
    }
    
    if (!nextLine) {
        // Reached the end of the entire project for this filter. Do nothing.
        return; 
    }

    if (nextLine.chapterId !== selectedChapterId) {
        await setSelectedChapterId(nextLine.chapterId);
    }

    set({ activeRecordingLineId: nextLine.id });
  },

  // Timeline Actions
  setTimelineIsPlaying: (isPlaying) => set({ timelineIsPlaying: isPlaying }),
  setTimelineCurrentTime: (time) => set({ timelineCurrentTime: time }),
  stopTimeline: () => set({ timelineIsPlaying: false, timelineCurrentTime: 0 }),
  setTimelineZoom: (zoom) => set({ timelineZoom: zoom }),
});
