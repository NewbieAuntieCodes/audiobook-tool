import { create } from 'zustand';
// Fix: Import from types.ts to break circular dependency
import { AppView, CVStylesMap, PresetColor, SoundLibraryItem, IgnoredSoundKeyword } from '../types';
import { Project, Character, MergeHistoryEntry } from '../types';

// Import slice creators and their state/action types
import { createUiSlice, UiSlice, LufsSettings, defaultPostProductionLufsSettings, SOUND_OBSERVATION_GLOBAL_CATEGORY_KEY } from './slices/uiSlice';
import { createProjectSlice, ProjectSlice } from './slices/projectSlice';
import { createProjectAudioSlice, ProjectAudioSlice } from './slices/projectAudioSlice';
import { createCharacterSlice, CharacterSlice } from './slices/characterSlice';
import { createMergeSlice, MergeSlice } from './slices/mergeSlice';
import { db } from '../db'; // Import the Dexie database instance
import { defaultCvPresetColors, defaultCharacterPresetColors } from '../lib/colorPresets';
import { soundLibraryRepository } from '../repositories/soundLibraryRepository';
import { miscRepository } from '../repositories';
import { normalizeCharacterNameKey } from '../lib/characterName';

// Define the combined state shape by extending all slice types
export interface AppState extends UiSlice, ProjectSlice, ProjectAudioSlice, CharacterSlice, MergeSlice {
  cvColorPresets: PresetColor[];
  characterColorPresets: PresetColor[];
  soundLibrary: SoundLibraryItem[];
  loadInitialData: () => Promise<void>;
  updateCvColorPresets: (presets: PresetColor[]) => Promise<void>;
  updateCharacterColorPresets: (presets: PresetColor[]) => Promise<void>;
  refreshSoundLibrary: () => Promise<void>;
  addIgnoredSoundKeyword: (projectId: string, chapterId: string, lineId: string, keyword: IgnoredSoundKeyword) => Promise<void>;
  updateLineEmotion: (projectId: string, chapterId: string, lineId: string, emotion: string) => Promise<void>;
}

const defaultCharConfigs = [
  { name: '[静音]', color: 'bg-slate-700', textColor: 'text-slate-400', description: '用于标记无需录制的旁白提示' },
  { name: 'Narrator', color: 'bg-slate-600', textColor: 'text-slate-100', description: '默认旁白角色' },
  { name: '待识别角色', color: 'bg-orange-400', textColor: 'text-black', description: '由系统自动识别但尚未分配的角色' },
  { name: '[音效]', color: 'bg-transparent', textColor: 'text-red-500', description: '用于标记音效的文字描述' },
];

const LEGACY_DEFAULT_CV_PRESET_BG_TEXT_PAIRS_V1: Array<[string, string]> = [
  ['bg-red-400', 'text-black'],
  ['bg-orange-400', 'text-black'],
  ['bg-yellow-300', 'text-black'],
  ['bg-lime-400', 'text-black'],
  ['bg-cyan-400', 'text-black'],
  ['bg-sky-400', 'text-black'],
  ['bg-violet-400', 'text-black'],
  ['bg-pink-400', 'text-black'],

  ['bg-red-700', 'text-white'],
  ['bg-orange-700', 'text-white'],
  ['bg-yellow-700', 'text-white'],
  ['bg-lime-700', 'text-white'],
  ['bg-cyan-700', 'text-white'],
  ['bg-blue-700', 'text-white'],
  ['bg-violet-700', 'text-white'],
  ['bg-pink-700', 'text-white'],

  ['bg-rose-500', 'text-black'],
  ['bg-amber-400', 'text-black'],
  ['bg-yellow-400', 'text-black'],
  ['bg-emerald-500', 'text-black'],
  ['bg-teal-500', 'text-black'],
  ['bg-sky-500', 'text-black'],
  ['bg-indigo-500', 'text-white'],
  ['bg-fuchsia-500', 'text-black'],

  ['bg-rose-900', 'text-white'],
  ['bg-amber-800', 'text-white'],
  ['bg-yellow-800', 'text-white'],
  ['bg-green-800', 'text-white'],
  ['bg-teal-800', 'text-white'],
  ['bg-blue-800', 'text-white'],
  ['bg-indigo-800', 'text-white'],
  ['bg-purple-800', 'text-white'],
];

export const useStore = create<AppState>((set, get, api) => ({
  // Spread slice creators, passing set, get, and api
  ...createUiSlice(set, get, api),
  ...createProjectSlice(set, get, api),
  ...createProjectAudioSlice(set, get, api),
  ...createCharacterSlice(set, get, api),
  ...createMergeSlice(set, get, api),

  // State for global color presets
  cvColorPresets: [],
  characterColorPresets: [],
  soundLibrary: [],

  // Global actions
  refreshSoundLibrary: async () => {
    try {
      const sounds = await soundLibraryRepository.getSounds();
      set({ soundLibrary: sounds });
    } catch (error) {
      console.error("Failed to load sound library:", error);
      set({ soundLibrary: [] });
    }
  },
  loadInitialData: async () => {
    try {
      const [
        projectsFromDb,
        charactersFromDb,
        miscData,
        lufsSettingsItem,
        postProductionLufsSettingsItem,
      ] = await db.transaction('r', db.projects, db.characters, db.misc, async () => {
        return Promise.all([
          db.projects.orderBy('lastModified').reverse().toArray(),
          db.characters.toArray(),
          miscRepository.getBulkConfig(),
          db.misc.get('lufsSettings'),
          db.misc.get('postProductionLufsSettings'),
        ]);
      });

      const {
        mergeHistory,
        cvColorPresets: cvColorPresetsFromDb,
        characterColorPresets: characterColorPresetsFromDb,
        apiSettings,
        selectedAiProvider,
        characterShortcuts,
        soundObservationList,
        soundObservationByCategory,
      } = miscData;

      const normalizedSoundObservationByCategory: Record<string, string[]> = (() => {
        const map = (soundObservationByCategory && typeof soundObservationByCategory === 'object')
          ? soundObservationByCategory
          : {};
        if (Object.keys(map).length > 0) return map;
        if (Array.isArray(soundObservationList) && soundObservationList.length > 0) {
          return { [SOUND_OBSERVATION_GLOBAL_CATEGORY_KEY]: soundObservationList };
        }
        return {};
      })();

      const normalizedSoundObservationList = (() => {
        const all: string[] = [];
        for (const items of Object.values(normalizedSoundObservationByCategory)) {
          all.push(...(items || []));
        }
        const trimmed = all.map((s) => (s || '').trim()).filter(Boolean);
        return Array.from(new Set(trimmed)).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
      })();

      const projects = projectsFromDb.map(p => ({ ...p, cvStyles: p.cvStyles || {} }));
      const lufsSettings = lufsSettingsItem?.value || { enabled: false, target: -18 };
      const postProductionLufsSettings =
        postProductionLufsSettingsItem?.value || defaultPostProductionLufsSettings;

      let cvColorPresets = cvColorPresetsFromDb;
      if (!cvColorPresets || !Array.isArray(cvColorPresets) || cvColorPresets.length === 0) {
        cvColorPresets = defaultCvPresetColors;
        await db.misc.put({ key: 'cvColorPresets', value: cvColorPresets });
      } else {
        const colorsMatchLegacyCvPresets = (presets: PresetColor[], expectedPairs: Array<[string, string]>) => {
          if (!Array.isArray(presets) || presets.length !== expectedPairs.length) return false;
          for (let i = 0; i < presets.length; i++) {
            const p = presets[i];
            const [bg, text] = expectedPairs[i];
            if (!p) return false;
            if (p.bgColorClass !== bg) return false;
            if (p.textColorClass !== text) return false;
          }
          return true;
        };

        const legacy16 = LEGACY_DEFAULT_CV_PRESET_BG_TEXT_PAIRS_V1.slice(0, 16);
        const legacy32 = LEGACY_DEFAULT_CV_PRESET_BG_TEXT_PAIRS_V1;

        const migrateLegacyCvPresets = (existing: PresetColor[]) => {
          const preservedNames = (existing || []).map((p) => p?.name);
          return defaultCvPresetColors.map((p, idx) => ({
            ...p,
            name: preservedNames[idx] || p.name,
          }));
        };

        if (cvColorPresets.length === 16 && colorsMatchLegacyCvPresets(cvColorPresets, legacy16)) {
          // Migrate: old 2x8 defaults -> new expanded defaults (preserve user-renamed labels)
          cvColorPresets = migrateLegacyCvPresets(cvColorPresets);
          await db.misc.put({ key: 'cvColorPresets', value: cvColorPresets });
        } else if (cvColorPresets.length < defaultCvPresetColors.length) {
          // Backward-compatible: when defaults expand, keep user edits and append new defaults.
          cvColorPresets = [
            ...cvColorPresets,
            ...defaultCvPresetColors.slice(cvColorPresets.length),
          ];
          await db.misc.put({ key: 'cvColorPresets', value: cvColorPresets });
        } else if (cvColorPresets.length === 32 && colorsMatchLegacyCvPresets(cvColorPresets, legacy32)) {
          // Migrate: replace legacy 4x8 palette when colors are unchanged (preserve user-renamed labels)
          cvColorPresets = migrateLegacyCvPresets(cvColorPresets);
          await db.misc.put({ key: 'cvColorPresets', value: cvColorPresets });
        }
      }

      let characterColorPresets = characterColorPresetsFromDb;
      if (!characterColorPresets || !Array.isArray(characterColorPresets) || characterColorPresets.length === 0) {
        characterColorPresets = defaultCharacterPresetColors;
        await db.misc.put({ key: 'characterColorPresets', value: characterColorPresets });
      } else if (characterColorPresets.length < defaultCharacterPresetColors.length) {
        characterColorPresets = [
          ...characterColorPresets,
          ...defaultCharacterPresetColors.slice(characterColorPresets.length),
        ];
        await db.misc.put({ key: 'characterColorPresets', value: characterColorPresets });
      }
      
      const processedCharacters = charactersFromDb.map((char: Character) => ({
        ...char,
        isStyleLockedToCv: char.isStyleLockedToCv || false,
        status: char.status || 'active',
      }));

      // One-time fix: ensure the special SFX role has transparent bg + red text and is locked
      const isSfxName = (name?: string) => {
        if (!name) return false;
        const n = normalizeCharacterNameKey(name);
        // 兼容旧数据与新显示格式
        return n === '音效' || n === '[音效]' || n === 'sfx';
      };
      const fixedCharacters: Character[] = processedCharacters.map((c) => {
        if (isSfxName(c.name)) {
          const desired = {
            color: 'bg-transparent',
            textColor: 'text-red-500',
            cvName: '',
            isStyleLockedToCv: true,
          } as Partial<Character>;
          const needsUpdate =
            c.color !== desired.color ||
            c.textColor !== desired.textColor ||
            (c.cvName || '') !== desired.cvName ||
            c.isStyleLockedToCv !== true;
          if (needsUpdate) {
            return { ...c, ...desired } as Character;
          }
        }
        return c;
      });

      // Persist SFX fixes back to DB if any
      const sfxUpdates = fixedCharacters.filter((c, idx) => c !== processedCharacters[idx]);
      if (sfxUpdates.length > 0) {
        await db.characters.bulkPut(sfxUpdates);
      }

      // Invariant: script lines should never be "unassigned".
      // Any missing/invalid characterId is normalized to the project-scoped "待识别角色".
      const UNKNOWN_ROLE_NAME = '待识别角色';
      const normalizedCharacters: Character[] = [...fixedCharacters];
      const unknownsToCreate: Character[] = [];
      const unknownIdByProject = new Map<string, string>();

      for (const project of projects) {
        const existingUnknown = normalizedCharacters.find(
          (c) =>
            c.projectId === project.id &&
            normalizeCharacterNameKey(c.name) === normalizeCharacterNameKey(UNKNOWN_ROLE_NAME) &&
            c.status !== 'merged',
        );
        if (existingUnknown) {
          unknownIdByProject.set(project.id, existingUnknown.id);
          continue;
        }

        const created: Character = {
          id: `${Date.now()}_char_unknown_${project.id}_${Math.random().toString(36).slice(2, 8)}`,
          name: UNKNOWN_ROLE_NAME,
          projectId: project.id,
          color: 'bg-orange-400',
          textColor: 'text-black',
          cvName: '',
          description: '由系统自动识别但尚未分配的角色',
          isStyleLockedToCv: false,
          status: 'active',
        };
        normalizedCharacters.push(created);
        unknownsToCreate.push(created);
        unknownIdByProject.set(project.id, created.id);
      }

      // Ensure functional roles exist so "确实无音" can be expressed via角色（[静音]/[音效]）.
      const SILENT_ROLE_KEYS = new Set(['[静音]', '静音'].map(normalizeCharacterNameKey));
      const SFX_ROLE_KEYS = new Set(['[音效]', '音效', 'sfx'].map(normalizeCharacterNameKey));
      const NON_AUDIO_ROLE_KEYS = new Set([...SILENT_ROLE_KEYS, ...SFX_ROLE_KEYS]);

      const specialRolesToCreate: Character[] = [];
      const silentIdByProject = new Map<string, string>();

      const findRole = (projectId: string, keys: Set<string>) => {
        return (
          normalizedCharacters.find(
            (c) =>
              c.projectId === projectId &&
              c.status !== 'merged' &&
              keys.has(normalizeCharacterNameKey(c.name)),
          ) ||
          normalizedCharacters.find(
            (c) => !c.projectId && c.status !== 'merged' && keys.has(normalizeCharacterNameKey(c.name)),
          )
        );
      };

      for (const project of projects) {
        const silentRole = findRole(project.id, SILENT_ROLE_KEYS);
        if (silentRole) {
          silentIdByProject.set(project.id, silentRole.id);
        } else {
          const created: Character = {
            id: `${Date.now()}_char_silent_${project.id}_${Math.random().toString(36).slice(2, 8)}`,
            name: '[静音]',
            projectId: project.id,
            color: 'bg-slate-700',
            textColor: 'text-slate-400',
            cvName: '',
            description: '用于标记无需录制的旁白提示',
            isStyleLockedToCv: false,
            status: 'active',
          };
          normalizedCharacters.push(created);
          specialRolesToCreate.push(created);
          silentIdByProject.set(project.id, created.id);
        }

        const sfxRole = findRole(project.id, SFX_ROLE_KEYS);
        if (!sfxRole) {
          const created: Character = {
            id: `${Date.now()}_char_sfx_${project.id}_${Math.random().toString(36).slice(2, 8)}`,
            name: '[音效]',
            projectId: project.id,
            color: 'bg-transparent',
            textColor: 'text-red-500',
            cvName: '',
            description: '用于标记音效的文字描述',
            isStyleLockedToCv: true,
            status: 'active',
          };
          normalizedCharacters.push(created);
          specialRolesToCreate.push(created);
        }
      }

      const fixedProjects: Project[] = projects.map((project) => {
        const unknownId = unknownIdByProject.get(project.id);
        if (!unknownId) return project;

        const silentId = silentIdByProject.get(project.id) || '';

        const validIds = new Set(
          normalizedCharacters
            .filter((c) => c.status !== 'merged')
            .filter((c) => !c.projectId || c.projectId === project.id)
            .map((c) => c.id),
        );

        const nonAudioIds = new Set(
          normalizedCharacters
            .filter((c) => c.status !== 'merged')
            .filter((c) => !c.projectId || c.projectId === project.id)
            .filter((c) => NON_AUDIO_ROLE_KEYS.has(normalizeCharacterNameKey(c.name)))
            .map((c) => c.id),
        );

        let changed = false;
        const nextChapters = project.chapters.map((ch) => {
          let chapterChanged = false;
          const nextLines = ch.scriptLines.map((line) => {
            if (line.isNoAudio) {
              chapterChanged = true;
              changed = true;
              const { isNoAudio: _ignored, ...rest } = line;
              const nextCharacterId = nonAudioIds.has(line.characterId || '') ? (line.characterId as string) : (silentId || unknownId);
              return { ...rest, characterId: nextCharacterId, audioBlobId: undefined };
            }
            const cid = line.characterId || '';
            if (!cid || !validIds.has(cid)) {
              chapterChanged = true;
              changed = true;
              return { ...line, characterId: unknownId };
            }
            return line;
          });
          return chapterChanged ? { ...ch, scriptLines: nextLines } : ch;
        });

        return changed ? { ...project, chapters: nextChapters } : project;
      });

      const projectsToFixInDb = fixedProjects.filter((p, idx) => p !== projects[idx]);
      const charsToCreate = unknownsToCreate.concat(specialRolesToCreate);
      if (charsToCreate.length > 0 || projectsToFixInDb.length > 0) {
        await db.transaction('rw', db.characters, db.projects, async () => {
          if (charsToCreate.length > 0) {
            await db.characters.bulkPut(charsToCreate);
          }
          if (projectsToFixInDb.length > 0) {
            await db.projects.bulkPut(projectsToFixInDb);
          }
        });
      }

      let initialView: AppView = "dashboard";
      if (projects.length === 0) {
        initialView = "upload";
      }
      
      const soundsFromDb = await soundLibraryRepository.getSounds();

      set({
        projects: fixedProjects,
        characters: normalizedCharacters,
        mergeHistory,
        cvColorPresets,
        characterColorPresets,
        apiSettings,
        selectedAiProvider,
        characterShortcuts,
        lufsSettings,
        soundObservationList: normalizedSoundObservationList,
        soundObservationByCategory: normalizedSoundObservationByCategory,
        postProductionLufsSettings,
        currentView: initialView,
        aiProcessingChapterIds: [], // Reset on load
        selectedProjectId: get().selectedProjectId || null,
        isLoading: false,
        soundLibrary: soundsFromDb,
      });
    } catch (error) {
      console.error("Failed to load data from Dexie database:", error);
      set({
        projects: [],
        characters: [],
        mergeHistory: [],
        cvColorPresets: defaultCvPresetColors,
        characterColorPresets: defaultCharacterPresetColors,
        currentView: "upload",
        isLoading: false,
        soundLibrary: [],
        soundObservationList: [],
        soundObservationByCategory: {},
      });
    }
  },
  updateCvColorPresets: async (presets: PresetColor[]) => {
    const state = get();
    const oldPresets = state.cvColorPresets;

    if (oldPresets.length !== presets.length) {
      await db.misc.put({ key: 'cvColorPresets', value: presets });
      set({ cvColorPresets: presets });
      console.warn("CV color presets length changed unexpectedly. Propagation skipped.");
      return;
    }

    const changes = new Map<string, { newBg: string; newText: string }>();
    for (let i = 0; i < presets.length; i++) {
      const oldP = oldPresets[i];
      const newP = presets[i];
      if (oldP.bgColorClass !== newP.bgColorClass || oldP.textColorClass !== newP.textColorClass) {
        changes.set(`${oldP.bgColorClass}|${oldP.textColorClass}`, {
          newBg: newP.bgColorClass,
          newText: newP.textColorClass,
        });
      }
    }

    if (changes.size === 0) {
      await db.misc.put({ key: 'cvColorPresets', value: presets });
      set({ cvColorPresets: presets });
      return;
    }

    const characterUpdates = new Map<string, Character>();
    const projectsToUpdateInDb: Project[] = [];

    const updatedProjects = state.projects.map(project => {
      if (!project.cvStyles) return project;

      let projectStylesChanged = false;
      const newCvStyles = { ...project.cvStyles };

      for (const cvName in newCvStyles) {
        const currentStyle = newCvStyles[cvName];
        const changeKey = `${currentStyle.bgColor}|${currentStyle.textColor}`;
        
        if (changes.has(changeKey)) {
          const change = changes.get(changeKey)!;
          newCvStyles[cvName] = {
            bgColor: change.newBg,
            textColor: change.newText,
          };
          projectStylesChanged = true;

          state.characters.forEach(char => {
            if (char.projectId === project.id && char.cvName === cvName && !char.isStyleLockedToCv) {
              const updatedChar = {
                ...char,
                color: change.newBg,
                textColor: change.newText,
              };
              characterUpdates.set(char.id, updatedChar);
            }
          });
        }
      }

      if (projectStylesChanged) {
        const updatedProject = { ...project, cvStyles: newCvStyles, lastModified: Date.now() };
        projectsToUpdateInDb.push(updatedProject);
        return updatedProject;
      }
      return project;
    });
    
    const finalUpdatedCharacters = state.characters.map(char => characterUpdates.get(char.id) || char);
    const charactersToUpdateInDb = Array.from(characterUpdates.values());

    await db.transaction('rw', db.misc, db.projects, db.characters, async () => {
        await db.misc.put({ key: 'cvColorPresets', value: presets });
        if (projectsToUpdateInDb.length > 0) {
            await db.projects.bulkPut(projectsToUpdateInDb);
        }
        if (charactersToUpdateInDb.length > 0) {
            await db.characters.bulkPut(charactersToUpdateInDb);
        }
    });

    set({
      cvColorPresets: presets,
      projects: updatedProjects,
      characters: finalUpdatedCharacters,
    });
  },
  updateCharacterColorPresets: async (presets: PresetColor[]) => {
    await db.misc.put({ key: 'characterColorPresets', value: presets });
    set({ characterColorPresets: presets });
  },
}));

export default useStore;
