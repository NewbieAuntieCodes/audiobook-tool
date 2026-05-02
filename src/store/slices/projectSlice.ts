import { StateCreator } from 'zustand';
import { AppState } from '../useStore';
import { Project, Collaborator, Chapter, AudioBlob, ScriptLine, Character, SilenceSettings, MasterAudio, TextMarker, IgnoredSoundKeyword } from '../../types';
import { db } from '../../db';
import { bufferToWav } from '../../lib/wavEncoder';
import {
  logLocalCodexPerf,
  measureLocalCodexPerfSync,
} from '../../lib/localCodexPerfDebug';
// FIX: Import `defaultSilenceSettings` to resolve reference error.
import { defaultSilenceSettings } from '../../lib/defaultSilenceSettings';

const defaultCharConfigs = [
  { name: '[静音]', color: 'bg-slate-700', textColor: 'text-slate-400', description: '用于标记无需录制的旁白提示' },
  { name: 'Narrator', color: 'bg-slate-600', textColor: 'text-slate-100', description: '默认旁白角色' },
  { name: '待识别角色', color: 'bg-orange-400', textColor: 'text-black', description: '由系统自动识别但尚未分配的角色' },
  { name: '[音效]', color: 'bg-transparent', textColor: 'text-red-500', description: '用于标记音效的文字描述' },
];

const PROJECT_PERSIST_DEBOUNCE_MS = 1200;
const PROJECT_LAST_MODIFIED_FRESH_WINDOW_MS = 5000;
const pendingProjectPersistById = new Map<string, Project>();
const pendingProjectPersistResolversById = new Map<string, Array<() => void>>();
const projectPersistTimerById = new Map<string, number>();

export interface ProjectSlice {
  projects: Project[];
  addProject: (newProject: Project) => Promise<void>;
  updateProject: (updatedProject: Project) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  addCollaboratorToProject: (projectId: string, username: string, role: 'reader' | 'editor') => Promise<void>;
  appendChaptersToProject: (projectId: string, newChapters: Chapter[]) => Promise<void>;
  addCustomSoundType: (projectId: string, soundType: string) => Promise<void>;
  deleteCustomSoundType: (projectId: string, soundType: string) => Promise<void>;
  batchAddChapters: (projectId: string, count: number) => Promise<void>;
  toggleLineReturnMark: (projectId: string, chapterId: string, lineId: string) => Promise<void>;
  updateLineFeedback: (projectId: string, chapterId: string, lineId: string, feedback: string) => Promise<void>;
  updateProjectSilenceSettings: (projectId: string, settings: SilenceSettings) => Promise<void>;
  updateLinePostSilence: (projectId: string, chapterId: string, lineId: string, silence?: number) => Promise<void>;
  updateProjectTextMarkers: (projectId: string, markers: TextMarker[]) => Promise<void>;
  addIgnoredSoundKeyword: (projectId: string, chapterId: string, lineId: string, keyword: IgnoredSoundKeyword) => Promise<void>;
  updateLineText: (projectId: string, chapterId: string, lineId: string, newText: string) => Promise<void>;
  updateLineEmotion: (projectId: string, chapterId: string, lineId: string, emotion: string) => Promise<void>;
}

export const createProjectSlice: StateCreator<AppState, [], [], ProjectSlice> = (set, get, _api) => ({
  projects: [],
  addProject: async (newProject) => {
    const projectWithExtras = { 
      ...newProject, 
      cvStyles: {
        'pb': { bgColor: 'bg-slate-700', textColor: 'text-slate-300' } // Add default style for 'pb'
      },
      customSoundTypes: [],
      silenceSettings: defaultSilenceSettings,
    };
    
    // Create project-specific default characters
    const defaultCharsForProject: Character[] = defaultCharConfigs.map(config => ({
      id: Date.now().toString() + `_char_default_${newProject.id}_` + Math.random(),
      name: config.name,
      projectId: newProject.id, // Link to this new project
      color: config.color,
      textColor: config.textColor,
      description: config.description,
      cvName: config.name === 'Narrator' ? 'pb' : '', // Set default CV for Narrator
      isStyleLockedToCv: false,
      status: 'active',
    }));

    await db.transaction('rw', db.projects, db.characters, async () => {
      await db.projects.add(projectWithExtras);
      await db.characters.bulkAdd(defaultCharsForProject);
    });

    set(state => {
      const updatedProjects = [projectWithExtras, ...state.projects].sort((a,b) => b.lastModified - a.lastModified);
      const updatedCharacters = [...state.characters, ...defaultCharsForProject];
      return { projects: updatedProjects, characters: updatedCharacters };
    });
  },
  updateProject: async (updatedProject) => {
    const state = get();
    const existing = state.projects.find(p => p.id === updatedProject.id);
    const baseMarkers = existing?.textMarkers || updatedProject.textMarkers || [];
    const shouldRecalculateBgmMarkers = hasProjectTextContentChanged(existing, updatedProject);
    const now = Date.now();
    const incomingLastModified =
      typeof updatedProject.lastModified === 'number' ? updatedProject.lastModified : 0;
    const shouldPreserveIncomingLastModified =
      incomingLastModified > 0 &&
      Math.abs(now - incomingLastModified) <= PROJECT_LAST_MODIFIED_FRESH_WINDOW_MS;
    const { result: textMarkers, durationMs: markerRecalcDurationMs } = measureLocalCodexPerfSync(
      'projectSlice.updateProject.textMarkers',
      () =>
        shouldRecalculateBgmMarkers
          ? recalculateBgmMarkersFromText(updatedProject, baseMarkers)
          : baseMarkers
    );
    const projectWithTimestamp: Project = {
      ...updatedProject,
      lastModified: shouldPreserveIncomingLastModified ? incomingLastModified : now,
      textMarkers,
    };

    const { durationMs: zustandSetDurationMs } = measureLocalCodexPerfSync(
      'projectSlice.updateProject.zustandSet',
      () => {
        set(state => {
          const updatedProjects = state.projects
            .map(p => p.id === updatedProject.id ? projectWithTimestamp : p)
            .sort((a,b) => b.lastModified - a.lastModified);
          return { projects: updatedProjects };
        });
      }
    );

    pendingProjectPersistById.set(projectWithTimestamp.id, projectWithTimestamp);

    const existingTimerId = projectPersistTimerById.get(projectWithTimestamp.id);
    if (typeof existingTimerId === 'number') {
      window.clearTimeout(existingTimerId);
    }

    const persistPromise = new Promise<void>((resolve) => {
      const resolvers = pendingProjectPersistResolversById.get(projectWithTimestamp.id) || [];
      resolvers.push(resolve);
      pendingProjectPersistResolversById.set(projectWithTimestamp.id, resolvers);
    });

    logLocalCodexPerf('projectSlice.updateProject.schedulePersist', {
      projectId: projectWithTimestamp.id,
      shouldRecalculateBgmMarkers,
      preservedIncomingLastModified: shouldPreserveIncomingLastModified,
      markerRecalcDurationMs,
      zustandSetDurationMs,
      debounceMs: PROJECT_PERSIST_DEBOUNCE_MS,
      chapterCount: projectWithTimestamp.chapters.length,
    });

    const timerId = window.setTimeout(async () => {
      projectPersistTimerById.delete(projectWithTimestamp.id);
      const latestProject = pendingProjectPersistById.get(projectWithTimestamp.id);
      const resolvers = pendingProjectPersistResolversById.get(projectWithTimestamp.id) || [];
      pendingProjectPersistById.delete(projectWithTimestamp.id);
      pendingProjectPersistResolversById.delete(projectWithTimestamp.id);

      try {
        if (latestProject) {
          const persistStartedAt = Date.now();
          await db.projects.put(latestProject);
          logLocalCodexPerf('projectSlice.updateProject.persist', {
            projectId: latestProject.id,
            chapterCount: latestProject.chapters.length,
            durationMs: Date.now() - persistStartedAt,
          });
        }
      } catch (error) {
        console.error(`Failed to persist project ${projectWithTimestamp.id}:`, error);
      } finally {
        resolvers.forEach((resolver) => resolver());
      }
    }, PROJECT_PERSIST_DEBOUNCE_MS);

    projectPersistTimerById.set(projectWithTimestamp.id, timerId);
    await persistPromise;
  },
  deleteProject: async (projectId) => {
    const state = get();

    // Identify characters associated with the project being deleted
    const characterIdsToDelete = state.characters
      .filter(char => char.projectId === projectId)
      .map(char => char.id);
    
    // Identify all audio blobs associated with the project's script lines
    const projectToDelete = state.projects.find(p => p.id === projectId);
    const audioBlobIdsToDelete: string[] = [];
    if (projectToDelete) {
      projectToDelete.chapters.forEach(chapter => {
        chapter.scriptLines.forEach(line => {
          if (line.audioBlobId) {
            audioBlobIdsToDelete.push(line.audioBlobId);
          }
        });
      });
    }

    // Perform an atomic transaction to delete the project and all its associated data
    await db.transaction('rw', db.projects, db.characters, db.audioBlobs, async () => {
      await db.projects.delete(projectId);
      if (characterIdsToDelete.length > 0) {
        await db.characters.bulkDelete(characterIdsToDelete);
      }
      if (audioBlobIdsToDelete.length > 0) {
        await db.audioBlobs.bulkDelete(audioBlobIdsToDelete);
      }
    });

    // Update the Zustand state after the database operations are complete
    set(currentState => {
      const updatedProjects = currentState.projects.filter(p => p.id !== projectId);
      const updatedCharacters = currentState.characters.filter(char => !characterIdsToDelete.includes(char.id));
      
      let newSelectedProjectId = currentState.selectedProjectId;
      if (currentState.selectedProjectId === projectId) {
        newSelectedProjectId = null;
      }

      return { 
        projects: updatedProjects, 
        characters: updatedCharacters,
        selectedProjectId: newSelectedProjectId 
      };
    });
  },
  addCollaboratorToProject: async (projectId, username, role) => {
    const state = get();
    const project = state.projects.find(p => p.id === projectId);
    if (!project) {
        console.error(`Project with ID ${projectId} not found for adding collaborator.`);
        return;
    }

    const existingCollaborators = project.collaborators || [];
    if (existingCollaborators.some(c => c.username.toLowerCase() === username.toLowerCase())) {
        alert(`协作者 "${username}" 已存在于此项目中。`);
        return;
    }
    const newCollaborator: Collaborator = {
        id: Date.now().toString() + "_collab_" + Math.random(),
        username,
        role
    };
    const updatedCollaborators = [...existingCollaborators, newCollaborator];
    const lastModified = Date.now();

    await db.projects.update(projectId, { collaborators: updatedCollaborators, lastModified });
    set(state => ({
        projects: state.projects.map(p => p.id === projectId ? { ...p, collaborators: updatedCollaborators, lastModified } : p)
            .sort((a,b) => b.lastModified - a.lastModified)
    }));
  },
  appendChaptersToProject: async (projectId, newChapters) => {
    const state = get();
    const project = state.projects.find(p => p.id === projectId);
    if (!project) return;
    
    const updatedChapters = [...project.chapters, ...newChapters];
    const lastModified = Date.now();

    await db.projects.update(projectId, { chapters: updatedChapters, lastModified });
    set(state => ({
      projects: state.projects.map(p => {
        if (p.id === projectId) {
          return { ...p, chapters: updatedChapters, lastModified };
        }
        return p;
      }).sort((a, b) => b.lastModified - a.lastModified),
    }));
  },
  addCustomSoundType: async (projectId, soundType) => {
    const state = get();
    const project = state.projects.find(p => p.id === projectId);
    if (!project) return;

    const trimmedSoundType = soundType.trim();
    if (!trimmedSoundType || (project.customSoundTypes || []).includes(trimmedSoundType)) {
      return;
    }

    const updatedProject = {
      ...project,
      customSoundTypes: [...(project.customSoundTypes || []), trimmedSoundType],
      lastModified: Date.now(),
    };

    await db.projects.put(updatedProject);
    set({
      projects: state.projects.map(p => p.id === projectId ? updatedProject : p)
        .sort((a,b) => b.lastModified - a.lastModified),
    });
  },
  deleteCustomSoundType: async (projectId, soundTypeToDelete) => {
    const state = get();
    const project = state.projects.find(p => p.id === projectId);
    if (!project) return;

    const updatedProject = {
      ...project,
      customSoundTypes: (project.customSoundTypes || []).filter(st => st !== soundTypeToDelete),
      chapters: project.chapters.map(ch => ({
        ...ch,
        scriptLines: ch.scriptLines.map(line => 
          line.soundType === soundTypeToDelete ? { ...line, soundType: '' } : line
        )
      })),
      lastModified: Date.now(),
    };

    await db.projects.put(updatedProject);
    set({
      projects: state.projects.map(p => p.id === projectId ? updatedProject : p)
        .sort((a,b) => b.lastModified - a.lastModified),
    });
  },
  batchAddChapters: async (projectId, count) => {
    const state = get();
    const project = state.projects.find(p => p.id === projectId);
    if (!project) return;

    let lastChapterTitle = '';
    if (project.chapters.length > 0) {
        lastChapterTitle = project.chapters[project.chapters.length - 1].title;
    }

    const titleRegex = /^(.*?)(\d+)(.*?)$/;
    const match = lastChapterTitle.match(titleRegex);

    let baseName = `第`;
    let startNumber = project.chapters.length + 1;
    let suffix = `章`;

    if (match) {
        baseName = match[1];
        startNumber = parseInt(match[2], 10) + 1;
        suffix = match[3];
    } else if (lastChapterTitle) {
        baseName = `${lastChapterTitle}-`;
        startNumber = 1;
        suffix = '';
    }
    
    const newChapters: Chapter[] = [];
    for (let i = 0; i < count; i++) {
        const newChapter: Chapter = {
            id: `ch_${Date.now()}_${i}_${Math.random()}`,
            title: `${baseName}${startNumber + i}${suffix}`,
            rawContent: '',
            scriptLines: [],
        };
        newChapters.push(newChapter);
    }
    
    const updatedProject = {
        ...project,
        chapters: [...project.chapters, ...newChapters],
        lastModified: Date.now(),
    };

    await db.projects.put(updatedProject);
    set({
        projects: state.projects.map(p => p.id === projectId ? updatedProject : p)
    });
  },
  toggleLineReturnMark: async (projectId, chapterId, lineId) => {
    const project = get().projects.find(p => p.id === projectId);
    if (!project) return;
    
    const updatedProject = {
      ...project,
      chapters: project.chapters.map(ch => {
        if (ch.id === chapterId) {
          return {
            ...ch,
            scriptLines: ch.scriptLines.map(line => {
              if (line.id === lineId) {
                return { ...line, isMarkedForReturn: !line.isMarkedForReturn };
              }
              return line;
            })
          };
        }
        return ch;
      }),
      lastModified: Date.now(),
    };
    
    await db.projects.put(updatedProject);
    set(state => ({
      projects: state.projects.map(p => p.id === projectId ? updatedProject : p)
    }));
  },
  updateLineFeedback: async (projectId, chapterId, lineId, feedback) => {
    const project = get().projects.find(p => p.id === projectId);
    if (!project) return;
    
    const updatedProject = {
      ...project,
      chapters: project.chapters.map(ch => {
        if (ch.id === chapterId) {
          return {
            ...ch,
            scriptLines: ch.scriptLines.map(line => {
              if (line.id === lineId) {
                return { ...line, feedback: feedback };
              }
              return line;
            })
          };
        }
        return ch;
      }),
      lastModified: Date.now(),
    };
    
    await db.projects.put(updatedProject);
    set(state => ({
      projects: state.projects.map(p => p.id === projectId ? updatedProject : p)
    }));
  },
  updateProjectSilenceSettings: async (projectId, settings) => {
    const project = get().projects.find(p => p.id === projectId);
    if (!project) return;

    const updatedProject = { ...project, silenceSettings: settings, lastModified: Date.now() };
    await db.projects.put(updatedProject);
    set(state => ({
        projects: state.projects.map(p => p.id === projectId ? updatedProject : p),
    }));
  },
  updateLinePostSilence: async (projectId, chapterId, lineId, silence) => {
    const project = get().projects.find(p => p.id === projectId);
    if (!project) return;

    const updatedProject = {
        ...project,
        chapters: project.chapters.map(ch => {
            if (ch.id === chapterId) {
                return {
                    ...ch,
                    scriptLines: ch.scriptLines.map(line => {
                        if (line.id === lineId) {
                            return { ...line, postSilence: silence === undefined ? undefined : Number(silence) };
                        }
                        return line;
                    })
                };
            }
            return ch;
        }),
        lastModified: Date.now(),
    };
    await db.projects.put(updatedProject);
    set(state => ({
        projects: state.projects.map(p => p.id === projectId ? updatedProject : p),
    }));
  },
  updateLineText: async (projectId, chapterId, lineId, newText) => {
    const project = get().projects.find(p => p.id === projectId);
    if (!project) return;

    let updatedProject: Project = {
      ...project,
      chapters: project.chapters.map(ch => {
        if (ch.id === chapterId) {
          return {
            ...ch,
            scriptLines: ch.scriptLines.map(line => {
              if (line.id === lineId) {
                const isSynced = line.text === newText;
                return { ...line, text: newText, isTextModifiedManual: true, isAiAudioSynced: isSynced } as ScriptLine;
              }
              return line;
            })
          };
        }
        return ch;
      }),
      lastModified: Date.now(),
    };
    updatedProject = {
      ...updatedProject,
      textMarkers: recalculateBgmMarkersFromText(updatedProject, project.textMarkers || []),
    };
    await db.projects.put(updatedProject);
    set(state => ({
      projects: state.projects.map(p => p.id === projectId ? updatedProject : p),
    }));
  },
  updateProjectTextMarkers: async (projectId, markers) => {
    const project = get().projects.find(p => p.id === projectId);
    if (!project) return;

    const updatedProject = {
      ...project,
      textMarkers: markers,
      lastModified: Date.now(),
    };

    // 优化：只更新变更字段，避免写入整条大型项目对象
    await db.projects.update(projectId, { textMarkers: markers, lastModified: updatedProject.lastModified });
    set(state => ({
      projects: state.projects.map(p => (p.id === projectId ? updatedProject : p)),
    }));
  },
  addIgnoredSoundKeyword: async (projectId, chapterId, lineId, keyword) => {
    const project = get().projects.find(p => p.id === projectId);
    if (!project) return;

    const updatedProject = {
      ...project,
      chapters: project.chapters.map(ch => {
        if (ch.id === chapterId) {
          return {
            ...ch,
            scriptLines: ch.scriptLines.map(line => {
              if (line.id === lineId) {
                const ignored = line.ignoredSoundKeywords || [];
                // Avoid duplicates
                if (!ignored.some(ik => ik.keyword === keyword.keyword && ik.index === keyword.index)) {
                  return { ...line, ignoredSoundKeywords: [...ignored, keyword] };
                }
              }
              return line;
            })
          };
        }
        return ch;
      }),
      lastModified: Date.now(),
    };

    await db.projects.put(updatedProject);
    set({
      projects: get().projects.map(p => p.id === projectId ? updatedProject : p),
    });
  },
  updateLineEmotion: async (projectId, chapterId, lineId, emotion) => {
    const project = get().projects.find(p => p.id === projectId);
    if (!project) return;
    const updatedProject = {
        ...project,
        chapters: project.chapters.map(ch => {
            if (ch.id === chapterId) {
                return {
                    ...ch,
                    scriptLines: ch.scriptLines.map(line =>
                        line.id === lineId ? { ...line, emotion } : line
                    )
                };
            }
            return ch;
        }),
        lastModified: Date.now()
    };
    await db.projects.put(updatedProject);
    set(state => ({
        projects: state.projects.map(p => p.id === projectId ? updatedProject : p)
    }));
  },
});

// ---- Helpers ----

function hasProjectTextContentChanged(
  previousProject: Project | undefined,
  nextProject: Project
): boolean {
  if (!previousProject) {
    return true;
  }

  if ((previousProject.rawFullScript || '') !== (nextProject.rawFullScript || '')) {
    return true;
  }

  const previousChapters = previousProject.chapters || [];
  const nextChapters = nextProject.chapters || [];
  if (previousChapters.length !== nextChapters.length) {
    return true;
  }

  for (let chapterIndex = 0; chapterIndex < nextChapters.length; chapterIndex += 1) {
    const previousChapter = previousChapters[chapterIndex];
    const nextChapter = nextChapters[chapterIndex];

    if (!previousChapter || previousChapter.id !== nextChapter.id) {
      return true;
    }

    const previousLines = previousChapter.scriptLines || [];
    const nextLines = nextChapter.scriptLines || [];
    if (previousLines.length !== nextLines.length) {
      return true;
    }

    for (let lineIndex = 0; lineIndex < nextLines.length; lineIndex += 1) {
      const previousLine = previousLines[lineIndex];
      const nextLine = nextLines[lineIndex];

      if (!previousLine || previousLine.id !== nextLine.id) {
        return true;
      }

      if ((previousLine.text || '') !== (nextLine.text || '')) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 从项目纯文本（<BGM> + //）重新计算所有 BGM 文本标记，只保留/替换 type === 'bgm' 的部分。
 * 其余类型的标记（scene、sfx）原样保留。
 */
function recalculateBgmMarkersFromText(project: Project, existingMarkers: TextMarker[]): TextMarker[] {
  const nonBgmMarkers = (existingMarkers || []).filter(m => m.type !== 'bgm');
  const existingBgmMarkers = (existingMarkers || []).filter(m => m.type === 'bgm');

  const bgmMarkers: TextMarker[] = [];

  // 支持 <名字> / <♫-名字> / <BGM-名字> 形式
  const bgmStartPattern = /<\s*(?:(?:BGM|[\u266A\u266B])\s*-\s*)?([^>]+)>/;

  type Pending = { name: string; startLineId: string; startOffset: number };
  let active: Pending | null = null;

  const chapters = project.chapters || [];

  for (const ch of chapters) {
    for (const line of ch.scriptLines || []) {
      const text = line.text || '';
      let i = 0;

      while (i < text.length) {
        const chCode = text[i];

        // 处理 BGM 结束标记 //
        if (active && chCode === '/' && text[i + 1] === '/') {
          const startLineId = active.startLineId;
          const startOffset = active.startOffset;
          const endLineId = line.id;
          const endOffset = i; // 高亮到 // 之前
          const name = active.name.trim();

          // 尝试复用已有的 BGM 标记（保持 id / color 等）
          const existing = existingBgmMarkers.find(m =>
            m.startLineId === startLineId &&
            m.endLineId === endLineId &&
            (m.startOffset ?? 0) === startOffset &&
            (m.endOffset ?? 0) === endOffset &&
            (m.name || '').trim() === name
          );

          const id = existing?.id || `bgm_${Date.now()}_${bgmMarkers.length}_${Math.random().toString(36).slice(2, 6)}`;

          bgmMarkers.push({
            id,
            type: 'bgm',
            name,
            startLineId,
            startOffset,
            endLineId,
            endOffset,
            color: existing?.color,
          });

          active = null;
          i += 2;
          continue;
        }

        // 处理 BGM 起始标记 <...>
        if (!active && chCode === '<') {
          const rest = text.slice(i);
          const match = rest.match(bgmStartPattern);
          if (match && match.index === 0) {
            const rawTag = match[0];
            const name = match[1].trim();
            const tagLen = rawTag.length;
            const startOffset = i + tagLen; // 高亮从 > 之后开始

            active = { name, startLineId: line.id, startOffset };
            i += tagLen;
            continue;
          }
        }

        i++;
      }
    }
  }

  // 未闭合的 BGM（只有 <name> 没有 //）不生成标记

  return [...nonBgmMarkers, ...bgmMarkers];
}
