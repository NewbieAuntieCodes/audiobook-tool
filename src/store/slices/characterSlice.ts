import { StateCreator } from 'zustand';
import { AppState } from '../useStore';
import { Character, Project } from '../../types';
import { db } from '../../db';
import { characterRepository, projectRepository } from '../../repositories';
import { normalizeCharacterNameKey, sanitizeCharacterDisplayName } from '../../lib/characterName';
import {
  logLocalCodexPerf,
  measureLocalCodexPerfSync,
} from '../../lib/localCodexPerfDebug';

export interface CharacterSlice {
  characters: Character[];
  addCharacter: (characterToAdd: Pick<Character, 'name' | 'color' | 'textColor' | 'cvName' | 'description' | 'profile' | 'isStyleLockedToCv'>, projectId: string) => Character;
  bulkAssignCvToCharacters: (
    projectId: string,
    assignments: Array<{
      characterId: string;
      cvName: string;
      bgColor: string;
      textColor: string;
    }>
  ) => Promise<void>;
  editCharacter: (characterBeingEdited: Character, updatedCvName?: string, updatedCvBgColor?: string, updatedCvTextColor?: string) => Promise<void>;
  updateCharacterProfile: (characterId: string, profile: NonNullable<Character['profile']>) => Promise<void>;
  deleteCharacter: (characterId: string) => Promise<void>;
  deleteCharacters: (characterIds: string[]) => Promise<void>;
  cleanupDuplicateCharactersInProject: (projectId: string) => Promise<{ deletedCharacters: number; groups: number; updatedLines: number }>;
  toggleCharacterStyleLock: (characterId: string) => Promise<void>;
  bulkUpdateCharacterStylesForCV: (cvName: string, newBgColor: string, newTextColor: string) => Promise<void>;
}

const UNKNOWN_ROLE_NAME = '待识别角色';

export const createCharacterSlice: StateCreator<AppState, [], [], CharacterSlice> = (set, get, _api) => ({
  characters: [],
  addCharacter: (characterToAdd, projectId) => {
    const state = get();
    const displayName = sanitizeCharacterDisplayName(characterToAdd.name);
    const nameKey = normalizeCharacterNameKey(displayName);

    // 1) 优先复用同项目下已存在的同名角色（避免重复并保留样式/描述）
    const existingInProject = state.characters.find(c =>
      normalizeCharacterNameKey(c.name) === nameKey && c.projectId === projectId && c.status !== 'merged'
    );
    if (existingInProject) return existingInProject;

    // 2) 若只存在“全局角色”（projectId 为空），复制其样式/描述作为本项目的默认值
    const globalTemplate = state.characters.find(c =>
      normalizeCharacterNameKey(c.name) === nameKey && !c.projectId && c.status !== 'merged'
    );

    // 3) 根据项目的 CV 样式进行覆盖（若提供了 cvName 且角色未锁定样式）
    const project = state.projects.find(p => p.id === projectId);
    const cvNameTrimmed = (characterToAdd.cvName || '').trim();
    const projectCvStyle = project?.cvStyles && cvNameTrimmed ? project.cvStyles[cvNameTrimmed] : undefined;

    const isLocked = characterToAdd.isStyleLockedToCv ?? false;

    const colorFromCv = projectCvStyle && !isLocked ? projectCvStyle.bgColor : undefined;
    const textFromCv = projectCvStyle && !isLocked ? projectCvStyle.textColor : undefined;

    const finalCharacter: Character = {
      id: `${Date.now()}_char_${Math.random().toString(36).substr(2, 9)}`,
      name: displayName,
      projectId: projectId,
      color: colorFromCv || characterToAdd.color || globalTemplate?.color || 'bg-slate-600',
      textColor: textFromCv || characterToAdd.textColor || globalTemplate?.textColor || 'text-slate-100',
      cvName: cvNameTrimmed || globalTemplate?.cvName || '',
      description: (characterToAdd.description ?? globalTemplate?.description ?? ''),
      profile: characterToAdd.profile ?? globalTemplate?.profile,
      isStyleLockedToCv: isLocked,
      status: 'active',
    };

    // Save to database asynchronously
    characterRepository.create({
      id: finalCharacter.id,
      name: finalCharacter.name,
      projectId: finalCharacter.projectId!,
      color: finalCharacter.color,
      textColor: finalCharacter.textColor,
      cvName: finalCharacter.cvName,
      description: finalCharacter.description,
      profile: finalCharacter.profile,
      isStyleLockedToCv: finalCharacter.isStyleLockedToCv,
    }).catch(err => console.error("Failed to add character:", err));

    // Update state optimistically
    set(s => ({ characters: [...s.characters, finalCharacter] }));

    return finalCharacter;
  },
  bulkAssignCvToCharacters: async (projectId, assignments) => {
    if (!projectId || !Array.isArray(assignments) || assignments.length === 0) {
      return;
    }

    const state = get();
    const projectToUpdate = state.projects.find((project) => project.id === projectId);
    if (!projectToUpdate) {
      return;
    }

    const { result: assignmentByCharacterId, durationMs: assignmentMapBuildDurationMs } =
      measureLocalCodexPerfSync('characterSlice.bulkAssignCvToCharacters.assignmentMap', () =>
        new Map(
          assignments
            .filter(
              (item) =>
                item &&
                typeof item.characterId === 'string' &&
                item.characterId.trim() !== '' &&
                typeof item.cvName === 'string'
            )
            .map((item) => [
              item.characterId,
              {
                cvName: item.cvName.trim(),
                bgColor: item.bgColor || 'bg-slate-700',
                textColor: item.textColor || 'text-slate-300',
              },
            ])
        )
      );

    if (assignmentByCharacterId.size === 0) {
      return;
    }

    const nextCvStyles = { ...(projectToUpdate.cvStyles || {}) };
    let cvStylesChanged = false;
    const charactersToUpdateInDb: Character[] = [];

    const updatedCharacters = state.characters.map((character) => {
      if (character.projectId !== projectId) {
        return character;
      }

      const assignment = assignmentByCharacterId.get(character.id);
      if (!assignment) {
        return character;
      }

      const existingStyle = assignment.cvName ? nextCvStyles[assignment.cvName] : undefined;
      if (assignment.cvName && !existingStyle) {
        nextCvStyles[assignment.cvName] = {
          bgColor: assignment.bgColor,
          textColor: assignment.textColor,
        };
        cvStylesChanged = true;
      }

      const resolvedStyle =
        (assignment.cvName ? nextCvStyles[assignment.cvName] : undefined) || {
          bgColor: assignment.bgColor,
          textColor: assignment.textColor,
        };

      let nextCharacter = character;
      let characterChanged = (character.cvName || '') !== assignment.cvName;

      if (characterChanged) {
        nextCharacter = {
          ...nextCharacter,
          cvName: assignment.cvName,
        };
      }

      if (!nextCharacter.isStyleLockedToCv && assignment.cvName) {
        if (
          nextCharacter.color !== resolvedStyle.bgColor ||
          nextCharacter.textColor !== resolvedStyle.textColor
        ) {
          nextCharacter = {
            ...nextCharacter,
            color: resolvedStyle.bgColor,
            textColor: resolvedStyle.textColor,
          };
          characterChanged = true;
        }
      }

      if (!characterChanged) {
        return character;
      }

      charactersToUpdateInDb.push(nextCharacter);
      return nextCharacter;
    });

    if (!cvStylesChanged && charactersToUpdateInDb.length === 0) {
      return;
    }

    const updatedProject = cvStylesChanged
      ? {
          ...projectToUpdate,
          cvStyles: nextCvStyles,
          lastModified: Date.now(),
        }
      : null;

    const transactionStartedAt = Date.now();
    await db.transaction('rw', db.projects, db.characters, async () => {
      if (updatedProject) {
        await db.projects.put(updatedProject);
      }
      if (charactersToUpdateInDb.length > 0) {
        await characterRepository.bulkUpdate(charactersToUpdateInDb);
      }
    });
    const transactionDurationMs = Date.now() - transactionStartedAt;

    const { durationMs: zustandSetDurationMs } = measureLocalCodexPerfSync(
      'characterSlice.bulkAssignCvToCharacters.zustandSet',
      () => {
        set((currentState) => {
          const nextProjects = updatedProject
            ? currentState.projects
                .map((project) => (project.id === projectId ? updatedProject : project))
                .sort((left, right) => right.lastModified - left.lastModified)
            : currentState.projects;

          return {
            projects: nextProjects,
            characters: updatedCharacters,
          };
        });
      }
    );

    logLocalCodexPerf('characterSlice.bulkAssignCvToCharacters', {
      projectId,
      inputAssignmentCount: assignments.length,
      assignmentMapSize: assignmentByCharacterId.size,
      updatedCharacterCount: charactersToUpdateInDb.length,
      cvStylesChanged,
      assignmentMapBuildDurationMs,
      transactionDurationMs,
      zustandSetDurationMs,
    });
  },
  editCharacter: async (characterBeingEdited, updatedCvNameFromModalProp, updatedCvBgColorFromModalProp, updatedCvTextColorFromModalProp) => {
    const projectId = characterBeingEdited.projectId || get().selectedProjectId;
    if (!projectId) {
      console.error("Cannot edit character/CV: No project context.");
      alert("错误：无法在没有选定项目的情况下编辑角色。");
      return;
    }
  
    // Prepare data for DB update based on the state right before the async call.
    const { projects } = get();
    const projectToUpdateForDb = projects.find(p => p.id === projectId);
    if (!projectToUpdateForDb) {
      console.error(`Project with ID ${projectId} not found when preparing DB update.`);
      return;
    }
  
    const trimmedCvName = (updatedCvNameFromModalProp || '').trim();
    let newProjectCvStylesForDb = { ...(projectToUpdateForDb.cvStyles || {}) };
    if (trimmedCvName && updatedCvBgColorFromModalProp && updatedCvTextColorFromModalProp) {
        newProjectCvStylesForDb[trimmedCvName] = { bgColor: updatedCvBgColorFromModalProp, textColor: updatedCvTextColorFromModalProp };
    }
    const updatedProjectForDb = { ...projectToUpdateForDb, cvStyles: newProjectCvStylesForDb };
  
    const finalCharacterDataForDb = { ...characterBeingEdited, cvName: trimmedCvName };
    if (!finalCharacterDataForDb.isStyleLockedToCv && trimmedCvName && newProjectCvStylesForDb[trimmedCvName]) {
        finalCharacterDataForDb.color = newProjectCvStylesForDb[trimmedCvName].bgColor;
        finalCharacterDataForDb.textColor = newProjectCvStylesForDb[trimmedCvName].textColor;
    }
  
    // Perform DB operations using repositories
    await db.transaction('rw', db.projects, db.characters, async () => {
        await projectRepository.update(updatedProjectForDb);
        await characterRepository.update(finalCharacterDataForDb);
    });
    
    // Update state using a functional update to prevent race conditions from stale state.
    set((state) => {
      const projectToUpdate = state.projects.find(p => p.id === projectId);
      if (!projectToUpdate) {
        console.warn(`Project with ID ${projectId} not found in state during update, skipping.`);
        return state;
      }
  
      const trimmedCvName = (updatedCvNameFromModalProp || '').trim();
      let newProjectCvStyles = { ...(projectToUpdate.cvStyles || {}) };
      if (trimmedCvName && updatedCvBgColorFromModalProp && updatedCvTextColorFromModalProp) {
          newProjectCvStyles[trimmedCvName] = { bgColor: updatedCvBgColorFromModalProp, textColor: updatedCvTextColorFromModalProp };
      }
      const updatedProject = { ...projectToUpdate, cvStyles: newProjectCvStyles };
  
      const finalCharacterData = { ...characterBeingEdited, cvName: trimmedCvName };
      if (!finalCharacterData.isStyleLockedToCv && trimmedCvName && newProjectCvStyles[trimmedCvName]) {
          finalCharacterData.color = newProjectCvStyles[trimmedCvName].bgColor;
          finalCharacterData.textColor = newProjectCvStyles[trimmedCvName].textColor;
      }
  
      return {
        projects: state.projects.map(p => p.id === projectId ? updatedProject : p),
        characters: state.characters.map(c => c.id === finalCharacterData.id ? finalCharacterData : c),
      };
    });
  },
  updateCharacterProfile: async (characterId, profile) => {
    const { characters } = get();
    const characterToUpdate = characters.find((character) => character.id === characterId);
    if (!characterToUpdate) {
      throw new Error('角色不存在，无法保存 AI 描述。');
    }

    const updatedCharacter = {
      ...characterToUpdate,
      profile: {
        ...(characterToUpdate.profile || {}),
        ...profile,
      },
    };

    await characterRepository.update(updatedCharacter);
    set({
      characters: characters.map((character) =>
        character.id === characterId ? updatedCharacter : character
      ),
    });
  },
  deleteCharacter: async (characterId) => {
    const state = get();
    const charToDelete = state.characters.find(c => c.id === characterId);
    let updatedCharacters = state.characters;
    let updatedProjects = state.projects;
    let needsProjectUpdate = false;

    // Prevent deleting certain default characters even if project-scoped
    const PROTECTED_NAME_KEYS = new Set(['[静音]', '[音效]', '音效', '待识别角色'].map(normalizeCharacterNameKey));
    if (charToDelete && PROTECTED_NAME_KEYS.has(normalizeCharacterNameKey(charToDelete.name))) {
       alert(`无法删除默认的功能性角色: ${charToDelete.name}`);
       return;
    }

    let unknownCharacterIdForProject: string | null = null;
    if (charToDelete?.projectId) {
      // Ensure we never leave lines "unassigned": reassign to the project-scoped Unknown role.
      const existingUnknown = state.characters.find(
        (c) =>
          c.projectId === charToDelete.projectId &&
          normalizeCharacterNameKey(c.name) === normalizeCharacterNameKey(UNKNOWN_ROLE_NAME) &&
          c.status !== 'merged',
      );

      if (existingUnknown) {
        unknownCharacterIdForProject = existingUnknown.id;
      } else {
        const created = await characterRepository.create({
          name: UNKNOWN_ROLE_NAME,
          projectId: charToDelete.projectId,
          color: 'bg-orange-400',
          textColor: 'text-black',
          cvName: '',
          description: '由系统自动识别但尚未分配的角色',
          isStyleLockedToCv: false,
        });
        unknownCharacterIdForProject = created.id;
        set((s) =>
          s.characters.some((c) => c.id === created.id)
            ? {}
            : { characters: [...s.characters, created] },
        );
      }
    }

    if (charToDelete && charToDelete.status === 'merged') {
        updatedCharacters = state.characters.filter(char => char.id !== characterId);
    } else {
        updatedCharacters = state.characters.filter(char => char.id !== characterId);
        updatedProjects = state.projects.map(proj => {
            // Only modify projects that this character belongs to
            if (charToDelete && proj.id === charToDelete.projectId) {
                needsProjectUpdate = true;
                return {
                    ...proj,
                    chapters: proj.chapters.map(ch => ({
                        ...ch,
                        scriptLines: ch.scriptLines.map(line =>
                            line.characterId === characterId
                              ? { ...line, characterId: unknownCharacterIdForProject || line.characterId }
                              : line
                        )
                    }))
                };
            }
            return proj;
        });
    }

    await db.transaction('rw', db.characters, db.projects, async () => {
        await characterRepository.delete(characterId);
        if (needsProjectUpdate) {
            const projectsToUpdate = updatedProjects.filter(p => {
                const charProject = charToDelete ? charToDelete.projectId : null;
                return p.id === charProject;
            });
            await projectRepository.bulkUpdate(projectsToUpdate);
        }
    });

    set({ characters: updatedCharacters, projects: updatedProjects });
  },
  deleteCharacters: async (characterIds) => {
    const state = get();
    
    const charsToDelete = state.characters.filter(c => characterIds.includes(c.id));
    
    // Prevent deleting certain default characters even if project-scoped
    const PROTECTED_NAME_KEYS = new Set(['[静音]', '[音效]', '音效', '待识别角色'].map(normalizeCharacterNameKey));
    const protectedCharsFound = charsToDelete.filter(c => PROTECTED_NAME_KEYS.has(normalizeCharacterNameKey(c.name)));

    if (protectedCharsFound.length > 0) {
        alert(`无法批量删除默认的功能性角色: ${protectedCharsFound.map(c => c.name).join(', ')}`);
        return;
    }
    
    const updatedCharacters = state.characters.filter(char => !characterIds.includes(char.id));

    let projectsHadChanges = false;
    const projectIdsAffected = new Set(charsToDelete.map(c => c.projectId));

    const unknownIdByProject = new Map<string, string>();
    const projectsNeedingUnknown = Array.from(projectIdsAffected).filter((id): id is string => !!id);
    for (const pid of projectsNeedingUnknown) {
      let existingUnknown = state.characters.find(
        (c) =>
          c.projectId === pid &&
          normalizeCharacterNameKey(c.name) === normalizeCharacterNameKey(UNKNOWN_ROLE_NAME) &&
          c.status !== 'merged',
      );
      if (!existingUnknown) {
        const created = await characterRepository.create({
          name: UNKNOWN_ROLE_NAME,
          projectId: pid,
          color: 'bg-orange-400',
          textColor: 'text-black',
          cvName: '',
          description: '由系统自动识别但尚未分配的角色',
          isStyleLockedToCv: false,
        });
        existingUnknown = created;
        set((s) =>
          s.characters.some((c) => c.id === created.id)
            ? {}
            : { characters: [...s.characters, created] },
        );
      }
      unknownIdByProject.set(pid, existingUnknown.id);
    }

    const updatedProjects = state.projects.map(proj => {
        if (projectIdsAffected.has(proj.id)) {
            projectsHadChanges = true;
            const unknownId = unknownIdByProject.get(proj.id);
            return {
                ...proj,
                chapters: proj.chapters.map(ch => ({
                    ...ch,
                    scriptLines: ch.scriptLines.map(line => 
                        line.characterId && characterIds.includes(line.characterId)
                          ? { ...line, characterId: unknownId || line.characterId }
                          : line
                    )
                })),
                lastModified: Date.now()
            };
        }
        return proj;
    });

    await db.transaction('rw', db.characters, db.projects, async () => {
        await characterRepository.bulkDelete(characterIds);
        if (projectsHadChanges) {
            const projectsToUpdate = updatedProjects.filter(p => projectIdsAffected.has(p.id));
            await projectRepository.bulkUpdate(projectsToUpdate);
        }
    });

    set({ characters: updatedCharacters, projects: updatedProjects });
  },
  cleanupDuplicateCharactersInProject: async (projectId) => {
    const state = get();
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) return { deletedCharacters: 0, groups: 0, updatedLines: 0 };

    const activeProjectCharacters = state.characters.filter(
      (c) => c.projectId === projectId && c.status !== 'merged',
    );

    const groupsByKey = new Map<string, Character[]>();
    for (const c of activeProjectCharacters) {
      const key = normalizeCharacterNameKey(c.name);
      const arr = groupsByKey.get(key);
      if (arr) arr.push(c);
      else groupsByKey.set(key, [c]);
    }

    const duplicateGroups = Array.from(groupsByKey.values()).filter((arr) => arr.length > 1);
    if (duplicateGroups.length === 0) return { deletedCharacters: 0, groups: 0, updatedLines: 0 };

    // Count usage of each characterId in this project to decide which one to keep.
    const usageCountById = new Map<string, number>();
    for (const ch of project.chapters) {
      for (const line of ch.scriptLines) {
        if (!line.characterId) continue;
        usageCountById.set(line.characterId, (usageCountById.get(line.characterId) || 0) + 1);
      }
    }

    const remap = new Map<string, string>(); // sourceId -> targetId
    const deleteIds: string[] = [];

    const score = (c: Character) => {
      const used = usageCountById.get(c.id) || 0;
      const hasCv = (c.cvName || '').trim() ? 1 : 0;
      const descLen = (c.description || '').trim().length;
      return { used, hasCv, descLen };
    };

    for (const arr of duplicateGroups) {
      const sorted = [...arr].sort((a, b) => {
        const sa = score(a);
        const sb = score(b);
        if (sa.used !== sb.used) return sb.used - sa.used;
        if (sa.hasCv !== sb.hasCv) return sb.hasCv - sa.hasCv;
        if (sa.descLen !== sb.descLen) return sb.descLen - sa.descLen;
        return a.id.localeCompare(b.id);
      });

      const keep = sorted[0];
      for (const src of sorted.slice(1)) {
        remap.set(src.id, keep.id);
        deleteIds.push(src.id);
      }
    }

    let updatedLines = 0;
    const nextChapters = project.chapters.map((ch) => {
      let chapterChanged = false;
      const nextLines = ch.scriptLines.map((line) => {
        const targetId = line.characterId ? remap.get(line.characterId) : undefined;
        if (!targetId) return line;
        chapterChanged = true;
        updatedLines += 1;
        return { ...line, characterId: targetId };
      });
      return chapterChanged ? { ...ch, scriptLines: nextLines } : ch;
    });

    // Also migrate VoiceLibrary reference-role mapping if present.
    const prevRef = project.referenceRoleByCharacterId || {};
    let nextRef = prevRef;
    let refChanged = false;
    for (const [srcId, targetId] of remap) {
      const srcRole = prevRef[srcId];
      if (srcRole && !prevRef[targetId]) {
        if (!refChanged) nextRef = { ...prevRef };
        nextRef[targetId] = srcRole;
        refChanged = true;
      }
      if (srcId in nextRef) {
        if (!refChanged) nextRef = { ...prevRef };
        delete nextRef[srcId];
        refChanged = true;
      }
    }

    const nextProject: Project = {
      ...project,
      chapters: nextChapters,
      referenceRoleByCharacterId: refChanged ? nextRef : project.referenceRoleByCharacterId,
      lastModified: Date.now(),
    };

    await db.transaction('rw', db.characters, db.projects, async () => {
      await db.projects.put(nextProject);
      await characterRepository.bulkDelete(deleteIds);
    });

    set((s) => ({
      projects: s.projects
        .map((p) => (p.id === projectId ? nextProject : p))
        .sort((a, b) => b.lastModified - a.lastModified),
      characters: s.characters.filter((c) => !deleteIds.includes(c.id)),
    }));

    return { deletedCharacters: deleteIds.length, groups: duplicateGroups.length, updatedLines };
  },
  toggleCharacterStyleLock: async (characterId) => {
    const { characters, projects } = get();
    const characterToUpdate = characters.find(c => c.id === characterId);
    if (!characterToUpdate) return;
    
    // Can't toggle lock for global characters, though this is now less likely to happen
    if (!characterToUpdate.projectId) return;

    const project = projects.find(p => p.id === characterToUpdate.projectId);
    const projectCvStyles = project?.cvStyles || {};

    const newLockState = !characterToUpdate.isStyleLockedToCv;
    const updatedChar = { ...characterToUpdate, isStyleLockedToCv: newLockState };

    if (!newLockState && updatedChar.cvName && projectCvStyles[updatedChar.cvName]) {
        updatedChar.color = projectCvStyles[updatedChar.cvName].bgColor;
        updatedChar.textColor = projectCvStyles[updatedChar.cvName].textColor;
    }
    
    await characterRepository.update(updatedChar);

    set({ characters: characters.map(c => c.id === characterId ? updatedChar : c) });
  },
  bulkUpdateCharacterStylesForCV: async (cvName, newBgColor, newTextColor) => {
    const { projects, characters, selectedProjectId } = get();
    if (!selectedProjectId) return;
    const projectToUpdate = projects.find(p => p.id === selectedProjectId);
    if (!projectToUpdate) return;

    const newProjectCvStyles = { ...(projectToUpdate.cvStyles || {}) };
    newProjectCvStyles[cvName] = { bgColor: newBgColor, textColor: newTextColor };
    const updatedProject = { ...projectToUpdate, cvStyles: newProjectCvStyles };

    const charactersToUpdateInDb: Character[] = [];
    const updatedCharacters = characters.map(char => {
        // Only update characters belonging to the current project
        if (char.projectId === selectedProjectId && char.cvName === cvName && !char.isStyleLockedToCv) {
            const updated = { ...char, color: newBgColor, textColor: newTextColor };
            charactersToUpdateInDb.push(updated);
            return updated;
        }
        return char;
    });

    await db.transaction('rw', db.projects, db.characters, async () => {
        await projectRepository.update(updatedProject);
        if (charactersToUpdateInDb.length > 0) {
            await characterRepository.bulkUpdate(charactersToUpdateInDb);
        }
    });

    set({
        projects: projects.map(p => p.id === selectedProjectId ? updatedProject : p),
        characters: updatedCharacters
    });
  },
});
