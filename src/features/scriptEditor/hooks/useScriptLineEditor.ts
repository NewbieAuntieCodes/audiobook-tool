import { useCallback } from 'react';
import { Project, Character, ScriptLine } from '../../../types';
import { normalizeCharacterNameKey } from '../../../lib/characterName';

export const useScriptLineEditor = (
  currentProject: Project | null,
  characters: Character[],
  applyUndoableProjectUpdate: (updater: (prevProject: Project) => Project) => void,
  selectedChapterId: string | null
) => {
  const logEditorFocusDebug = useCallback(
    (message: string, payload: Record<string, unknown>) => {
      if (process.env.NODE_ENV !== 'development') {
        try {
          if (
            typeof window === 'undefined' ||
            window.localStorage.getItem('__editor_focus_debug__') !== '1'
          ) {
            return;
          }
        } catch (_) {
          return;
        }
      }

      console.info('[EditorFocusDebug][ScriptLineStore]', message, payload);
    },
    []
  );

  const updateLineInProject = useCallback((chapterId: string, lineId: string, lineUpdater: (line: ScriptLine) => ScriptLine) => {
    applyUndoableProjectUpdate(prevProject => ({
      ...prevProject,
      chapters: prevProject.chapters.map(ch => {
        if (ch.id === chapterId) {
          return {
            ...ch,
            scriptLines: ch.scriptLines.map(l => l.id === lineId ? lineUpdater(l) : l)
          };
        }
        return ch;
      })
    }));
  }, [applyUndoableProjectUpdate]);

  const handleUpdateScriptLineText = useCallback((chapterId: string, lineId: string, newText: string) => {
    // 清空后自动删除整行，避免留下空白台词框
    const sanitized = (newText || '').replace(/\u200B/g, '');
    logEditorFocusDebug('handleUpdateScriptLineText called', {
      chapterId,
      lineId,
      textLength: sanitized.length,
      selectedChapterId,
    });
    if (sanitized.trim() === '') {
      applyUndoableProjectUpdate(prevProject => ({
        ...prevProject,
        chapters: prevProject.chapters.map(ch => {
          if (ch.id === chapterId) {
            return {
              ...ch,
              scriptLines: ch.scriptLines.filter(l => l.id !== lineId)
            };
          }
          return ch;
        })
      }));
      return;
    }

    updateLineInProject(chapterId, lineId, line => ({
      ...line,
      text: sanitized,
      isTextModifiedManual: true,
      isAiAudioSynced: line.text === sanitized,
    }));
  }, [applyUndoableProjectUpdate, logEditorFocusDebug, selectedChapterId, updateLineInProject]);

  const handleUpdateSoundType = useCallback((chapterId: string, lineId: string, newSoundType: string) => {
    updateLineInProject(chapterId, lineId, line => ({
      ...line,
      soundType: newSoundType,
    }));
  }, [updateLineInProject]);

  const handleAssignCharacterToLine = useCallback((chapterId: string, lineId: string, newCharacterId: string) => {
    const narratorCharacter = characters.find(c => normalizeCharacterNameKey(c.name) === normalizeCharacterNameKey('Narrator'));
    const unknownCharacter = characters.find(
      c =>
        normalizeCharacterNameKey(c.name) === normalizeCharacterNameKey('待识别角色') &&
        !!c.projectId &&
        c.projectId === currentProject?.id
    );
    const sfxCharIds = characters
      .filter(c => {
        const k = normalizeCharacterNameKey(c.name);
        return k === '音效' || k === '[音效]' || k === 'sfx';
      })
      .map(c => c.id);
    // 保证永远不会写入“未分配”：空字符串视为“待识别角色”
    const normalizedCharacterId =
      newCharacterId === '' ? (unknownCharacter?.id || narratorCharacter?.id || '') : newCharacterId;
    const newCharacter = characters.find(c => c.id === normalizedCharacterId);

    if (!currentProject) return;

    applyUndoableProjectUpdate(prevProject => {
        const project = { ...prevProject };
        const chapterIndex = project.chapters.findIndex(ch => ch.id === chapterId);
        if (chapterIndex === -1) return prevProject;

        const chapter = { ...project.chapters[chapterIndex] };
        const lineIndex = chapter.scriptLines.findIndex(l => l.id === lineId);
        if (lineIndex === -1) return prevProject;

        const currentLine = chapter.scriptLines[lineIndex];
        const originalCharacter = characters.find(c => c.id === currentLine.characterId);
        // [音效]/[静音]：保留原文引号形态（不自动添加/不移除）。
        const isChangingToNarrator = normalizedCharacterId === narratorCharacter?.id;

        if (isChangingToNarrator) {
            const isOriginallyCharacter = originalCharacter && originalCharacter.name !== 'Narrator';
            // Only apply special logic if changing from a character TO a narrator
            if (!isOriginallyCharacter) {
                const newScriptLines = [...chapter.scriptLines];
                newScriptLines[lineIndex] = { ...currentLine, characterId: normalizedCharacterId };
                chapter.scriptLines = newScriptLines;
                project.chapters[chapterIndex] = chapter;
                return project;
            }

            // 1. Transform text: double quotes to single quotes
            let textToMerge = currentLine.text;
            const trimmedText = textToMerge.trim();
            if ((trimmedText.startsWith('“') && trimmedText.endsWith('”')) || (trimmedText.startsWith('「') && trimmedText.endsWith('」'))) {
                const content = trimmedText.substring(1, trimmedText.length - 1);
                const before = textToMerge.substring(0, textToMerge.indexOf(trimmedText));
                const after = textToMerge.substring(textToMerge.indexOf(trimmedText) + trimmedText.length);
                textToMerge = `${before}‘${content}’${after}`;
            }

            // 2. Find the entire contiguous block of Narrator lines
            let firstIndex = lineIndex;
            while (firstIndex > 0) {
                const prevLine = chapter.scriptLines[firstIndex - 1];
                const prevChar = characters.find(c => c.id === prevLine.characterId);
                if (!prevChar || prevChar.name === 'Narrator') {
                    firstIndex--;
                } else {
                    break;
                }
            }

            let lastIndex = lineIndex;
            while (lastIndex < chapter.scriptLines.length - 1) {
                const nextLine = chapter.scriptLines[lastIndex + 1];
                const nextChar = characters.find(c => c.id === nextLine.characterId);
                if (!nextChar || nextChar.name === 'Narrator') {
                    lastIndex++;
                } else {
                    break;
                }
            }
            
            // 3. Merge if there's a block of more than one line
            if (firstIndex !== lastIndex) {
                const linesToProcess = chapter.scriptLines.slice(firstIndex, lastIndex + 1);
                const combinedText = linesToProcess.map((line, index) => {
                    if ((firstIndex + index) === lineIndex) return textToMerge;
                    return line.text;
                }).join('');

                const mergedLine: ScriptLine = {
                    ...chapter.scriptLines[firstIndex],
                    text: combinedText,
                    characterId: normalizedCharacterId,
                };

                const lineIdsToRemove = new Set(linesToProcess.map(l => l.id));
                const filteredLines = chapter.scriptLines.filter(l => !lineIdsToRemove.has(l.id));
                
                filteredLines.splice(firstIndex, 0, mergedLine);
                chapter.scriptLines = filteredLines;
                project.chapters[chapterIndex] = chapter;
                return project;
            } else {
                // No merge, just update the single line's text and character
                const newScriptLines = [...chapter.scriptLines];
                newScriptLines[lineIndex] = { ...currentLine, text: textToMerge, characterId: normalizedCharacterId };
                chapter.scriptLines = newScriptLines;
                project.chapters[chapterIndex] = chapter;
                return project;
            }

        } else {
            // When changing FROM Narrator TO a character, add quotes, but not for SFX characters.
            // The logic to automatically add brackets for SFX characters has been removed to fix a rendering issue.
            let newText = currentLine.text;
            const isOriginallyNarrator = !originalCharacter || originalCharacter.id === narratorCharacter?.id;
            const __nameCheck = (newCharacter?.name || '').replace(/[\[\]()]/g, '').trim().toLowerCase();
            const __isSfx = __nameCheck === '音效' || __nameCheck === 'sfx';
            const isNewCharSfx = __isSfx || sfxCharIds.includes(normalizedCharacterId);
            
            if (isOriginallyNarrator && !isNewCharSfx) {
                const trimmedText = newText.trim();
                const isAlreadyDialogue = (trimmedText.startsWith('“') && trimmedText.endsWith('”')) || (trimmedText.startsWith('「') && trimmedText.endsWith('」'));

                if (!isAlreadyDialogue) {
                    let content = trimmedText;
                    // Unwrap single quotes if they exist from a previous conversion
                    if (content.startsWith('‘') && content.endsWith('’')) {
                        content = content.substring(1, content.length - 1);
                    }
                    const before = newText.substring(0, newText.indexOf(trimmedText));
                    const after = newText.substring(newText.indexOf(trimmedText) + trimmedText.length);
                    newText = `${before}“${content}”${after}`;
                }
            }
            
            const newScriptLines = [...chapter.scriptLines];
            newScriptLines[lineIndex] = { ...currentLine, text: newText, characterId: normalizedCharacterId };
            chapter.scriptLines = newScriptLines;
            project.chapters[chapterIndex] = chapter;
            return project;
        }
    });
  }, [applyUndoableProjectUpdate, characters, currentProject]);


  const handleSplitScriptLine = useCallback((chapterId: string, lineId: string, splitIndex: number, currentText: string) => {
    applyUndoableProjectUpdate(prevProject => {
        const newChapters = prevProject.chapters.map(ch => {
            if (ch.id === chapterId) {
                const newScriptLines: ScriptLine[] = [];
                ch.scriptLines.forEach(line => {
                    if (line.id === lineId) {
                        // Split at caret, and trim a single boundary newline on each side
                        // to avoid introducing an empty first line or a leading blank line
                        // in the second part when the caret is at a line break.
                        let part1 = currentText.substring(0, splitIndex);
                        let part2 = currentText.substring(splitIndex);

                        // Remove trailing newline from left side and leading newline from right side
                        part1 = part1.replace(/\r?\n$/, '');
                        part2 = part2.replace(/^\r?\n/, '');

                        if (part1) {
                            newScriptLines.push({
                                ...line,
                                id: `${line.id}_split_1_${Date.now()}_${Math.random()}`,
                                text: part1,
                            });
                        }
                        if (part2) {
                            newScriptLines.push({
                                ...line,
                                id: `${line.id}_split_2_${Date.now()}_${Math.random()}`,
                                text: part2,
                            });
                        }
                    } else {
                        newScriptLines.push(line);
                    }
                });
                return { ...ch, scriptLines: newScriptLines };
            }
            return ch;
        });
        return { ...prevProject, chapters: newChapters };
    });
  }, [applyUndoableProjectUpdate]);

  const handleMergeAdjacentLines = useCallback((chapterId: string, lineId: string) => {
    applyUndoableProjectUpdate(prevProject => {
      const chapterIndex = prevProject.chapters.findIndex(ch => ch.id === chapterId);
      if (chapterIndex === -1) return prevProject;

      const chapter = prevProject.chapters[chapterIndex];
      const lineIndex = chapter.scriptLines.findIndex(l => l.id === lineId);
      if (lineIndex === -1) return prevProject;

      const characterId = chapter.scriptLines[lineIndex].characterId;
      if (!characterId) return prevProject; // Cannot merge lines without a character.

      let firstLineIndex = lineIndex;
      while (firstLineIndex > 0 && chapter.scriptLines[firstLineIndex - 1].characterId === characterId) {
        firstLineIndex--;
      }

      let lastLineIndex = lineIndex;
      while (lastLineIndex < chapter.scriptLines.length - 1 && chapter.scriptLines[lastLineIndex + 1].characterId === characterId) {
        lastLineIndex++;
      }

      if (firstLineIndex === lastLineIndex) {
        // No adjacent lines to merge.
        return prevProject;
      }

      const linesToMerge = chapter.scriptLines.slice(firstLineIndex, lastLineIndex + 1);
      const combinedText = linesToMerge.map(l => l.text).join('\n');

      const mergedLine: ScriptLine = {
        ...chapter.scriptLines[firstLineIndex],
        text: combinedText,
      };

      const newScriptLines = [
        ...chapter.scriptLines.slice(0, firstLineIndex),
        mergedLine,
        ...chapter.scriptLines.slice(lastLineIndex + 1),
      ];

      const updatedChapter = { ...chapter, scriptLines: newScriptLines };
      const newChapters = [...prevProject.chapters];
      newChapters[chapterIndex] = updatedChapter;

      return { ...prevProject, chapters: newChapters };
    });
  }, [applyUndoableProjectUpdate]);

  const handleMergeAllAdjacentSameCharacterLines = useCallback((chapterId: string) => {
    if (!currentProject) return;
    const chapter = currentProject.chapters.find(ch => ch.id === chapterId);
    const lines = chapter?.scriptLines || [];
    if (lines.length < 2) return;

    let hasAnyAdjacentSameCharacter = false;
    for (let i = 1; i < lines.length; i++) {
      const prev = lines[i - 1]?.characterId;
      const cur = lines[i]?.characterId;
      if (cur && prev && cur === prev) {
        hasAnyAdjacentSameCharacter = true;
        break;
      }
    }
    if (!hasAnyAdjacentSameCharacter) return;

    applyUndoableProjectUpdate(prevProject => {
      const chapterIndex = prevProject.chapters.findIndex(ch => ch.id === chapterId);
      if (chapterIndex === -1) return prevProject;

      const targetChapter = prevProject.chapters[chapterIndex];
      if (!targetChapter.scriptLines || targetChapter.scriptLines.length < 2) return prevProject;

      const mergedLines: ScriptLine[] = [];
      for (const line of targetChapter.scriptLines) {
        const prevLine = mergedLines[mergedLines.length - 1];
        if (line.characterId && prevLine?.characterId && line.characterId === prevLine.characterId) {
          mergedLines[mergedLines.length - 1] = {
            ...prevLine,
            text: `${prevLine.text}\n${line.text}`,
          };
        } else {
          mergedLines.push(line);
        }
      }

      const updatedChapter = { ...targetChapter, scriptLines: mergedLines };
      const newChapters = [...prevProject.chapters];
      newChapters[chapterIndex] = updatedChapter;
      return { ...prevProject, chapters: newChapters };
    });
  }, [applyUndoableProjectUpdate, currentProject]);

  const handleDeleteScriptLine = useCallback((chapterId: string, lineId: string) => {
    applyUndoableProjectUpdate(prevProject => ({
      ...prevProject,
      chapters: prevProject.chapters.map(ch => {
        if (ch.id === chapterId) {
          return {
            ...ch,
            scriptLines: ch.scriptLines.filter(l => l.id !== lineId)
          };
        }
        return ch;
      })
    }));
  }, [applyUndoableProjectUpdate]);

  const handleMoveScriptLine = useCallback((chapterId: string, lineId: string, direction: -1 | 1) => {
    applyUndoableProjectUpdate(prevProject => {
      const project = { ...prevProject };
      const chapterIndex = project.chapters.findIndex(ch => ch.id === chapterId);
      if (chapterIndex === -1) return prevProject;

      const chapter = { ...project.chapters[chapterIndex] };
      const lines = [...chapter.scriptLines];
      const currentIndex = lines.findIndex(line => line.id === lineId);
      if (currentIndex === -1) return prevProject;
      const targetIndex = currentIndex + direction;
      if (targetIndex < 0 || targetIndex >= lines.length) return prevProject;

      const [movedLine] = lines.splice(currentIndex, 1);
      lines.splice(targetIndex, 0, movedLine);
      chapter.scriptLines = lines;
      project.chapters[chapterIndex] = chapter;
      return project;
    });
  }, [applyUndoableProjectUpdate]);

  // FIX: Add missing handleUpdateScriptLineEmotion function.
  const handleUpdateScriptLineEmotion = useCallback((chapterId: string, lineId: string, emotion: string) => {
    updateLineInProject(chapterId, lineId, line => ({
      ...line,
      emotion: emotion,
    }));
  }, [updateLineInProject]);

  return {
    handleUpdateScriptLineText,
    handleAssignCharacterToLine,
    handleSplitScriptLine,
    handleMergeAdjacentLines,
    handleMergeAllAdjacentSameCharacterLines,
    handleDeleteScriptLine,
    handleUpdateSoundType,
    handleMoveScriptLine,
    handleUpdateScriptLineEmotion,
  };
};
