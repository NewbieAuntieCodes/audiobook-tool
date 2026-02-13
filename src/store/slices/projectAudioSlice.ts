import { StateCreator } from 'zustand';
import { AppState } from '../useStore';
import { Project, Chapter, AudioBlob, ScriptLine, Character, SilenceSettings, MasterAudio } from '../../types';
import { db } from '../../db';
import { bufferToWav } from '../../lib/wavEncoder';
import { normalizeCharacterNameKey } from '../../lib/characterName';

const NON_AUDIO_ROLE_NAME_KEYS = new Set(['[静音]', '静音', '音效', '[音效]', 'sfx'].map(normalizeCharacterNameKey));

export interface ProjectAudioSlice {
  updateLineAudio: (projectId: string, chapterId: string, lineId: string, audioBlobId: string | null) => Promise<void>;
  assignAudioToLine: (projectId: string, chapterId: string, lineId: string, audioBlob: Blob, sourceAudioId?: string, sourceAudioFilename?: string) => Promise<void>;
  clearAudioFromChapters: (projectId: string, chapterIds: string[]) => Promise<void>;
  fillAudioGapFromNext: (projectId: string, chapterId: string, lineId: string) => Promise<void>;
  resegmentAndRealignAudio: (projectId: string, sourceAudioId: string, markers: number[], skipHeadSegments?: number) => Promise<void>;
}

export const createProjectAudioSlice: StateCreator<AppState, [], [], ProjectAudioSlice> = (set, get) => ({
    updateLineAudio: async (projectId, chapterId, lineId, audioBlobId) => {
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
                    // Set to undefined if null is passed, to avoid storing null in DB
                    return { ...line, audioBlobId: audioBlobId || undefined };
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
            .sort((a,b) => b.lastModified - a.lastModified),
        }));
      },
      assignAudioToLine: async (projectId, chapterId, lineId, audioBlob, sourceAudioId, sourceAudioFilename) => {
        const newId = `audio_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const audioBlobEntry: AudioBlob = { 
            id: newId, 
            lineId, 
            data: audioBlob,
            sourceAudioId: sourceAudioId || newId, // If no source, it's its own source
            sourceAudioFilename: sourceAudioFilename || 'Untitled.wav',
        };
        
        await db.audioBlobs.put(audioBlobEntry);
        await get().updateLineAudio(projectId, chapterId, lineId, newId);
      },
      clearAudioFromChapters: async (projectId, chapterIds) => {
        const state = get();
        const project = state.projects.find(p => p.id === projectId);
        if (!project) return;
    
        const chaptersToClear = project.chapters.filter(ch => chapterIds.includes(ch.id));
        if (chaptersToClear.length === 0) return;
    
        const blobIdsToDelete = chaptersToClear
            .flatMap(ch => ch.scriptLines)
            .map(line => line.audioBlobId)
            .filter((id): id is string => !!id);
    
        if (blobIdsToDelete.length === 0) {
            return;
        }
        
        const updatedProject = {
          ...project,
          chapters: project.chapters.map(ch => {
            if (chapterIds.includes(ch.id)) {
              return {
                ...ch,
                scriptLines: ch.scriptLines.map(line => ({ ...line, audioBlobId: undefined }))
              };
            }
            return ch;
          }),
          lastModified: Date.now(),
        };
        
        await db.transaction('rw', db.projects, db.audioBlobs, async () => {
            await db.projects.put(updatedProject);
            if (blobIdsToDelete.length > 0) {
                await db.audioBlobs.bulkDelete(blobIdsToDelete);
            }
        });
        
      set(state => ({
          projects: state.projects.map(p => p.id === projectId ? updatedProject : p)
            .sort((a,b) => b.lastModified - a.lastModified),
        }));
      },
      fillAudioGapFromNext: async (projectId, chapterId, lineId) => {
        get().clearPlayingLine();

        const project = get().projects.find(p => p.id === projectId);
        if (!project) return;

        const chapter = project.chapters.find(ch => ch.id === chapterId);
        if (!chapter) return;

        const lineIndex = chapter.scriptLines.findIndex(l => l.id === lineId);
        if (lineIndex === -1) return;

        const nonAudioCharacterIds = get().characters
          .filter(c => NON_AUDIO_ROLE_NAME_KEYS.has(normalizeCharacterNameKey(c.name)))
          .map(c => c.id);

        const isEligible = (line: ScriptLine) => {
          if (nonAudioCharacterIds.includes(line.characterId || '')) return false;
          return true;
        };

        const targetLine = chapter.scriptLines[lineIndex];
        if (!isEligible(targetLine)) {
          alert('该句为[静音]/[音效]，不需要配音。');
          return;
        }

        if (targetLine.audioBlobId) {
          alert('该句已有音频，无需补位。');
          return;
        }

        const eligibleIndices = chapter.scriptLines
          .map((line, idx) => ({ line, idx }))
          .filter(({ line }) => isEligible(line))
          .map(({ idx }) => idx);
        const eligiblePos = eligibleIndices.indexOf(lineIndex);
        if (eligiblePos === -1) return;

        const allBlobIds = eligibleIndices
          .map((idx) => chapter.scriptLines[idx].audioBlobId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0);

        const blobs = allBlobIds.length > 0 ? await db.audioBlobs.bulkGet(allBlobIds) : [];
        const blobById = new Map<string, AudioBlob>();
        for (const b of blobs) {
          if (b) blobById.set(b.id, b);
        }

        const getSourceAudioIdAtEligiblePos = (pos: number): string | undefined => {
          const idx = eligibleIndices[pos];
          const blobId = chapter.scriptLines[idx].audioBlobId;
          if (!blobId) return undefined;
          return blobById.get(blobId)?.sourceAudioId;
        };

        let sourceAudioId: string | undefined;
        for (let p = eligiblePos - 1; p >= 0 && !sourceAudioId; p--) {
          sourceAudioId = getSourceAudioIdAtEligiblePos(p);
        }
        for (let p = eligiblePos + 1; p < eligibleIndices.length && !sourceAudioId; p++) {
          sourceAudioId = getSourceAudioIdAtEligiblePos(p);
        }

        if (!sourceAudioId) {
          alert('未找到可用于补位的音频源（后面/前面都没有已绑定音频）。');
          return;
        }

        const nextLines = chapter.scriptLines.map(l => ({ ...l }));
        const movedBlobUpdates: AudioBlob[] = [];

        let readPos = eligiblePos + 1;
        for (let writePos = eligiblePos; writePos < eligibleIndices.length; writePos++) {
          const writeIdx = eligibleIndices[writePos];
          const writeLine = nextLines[writeIdx];
          if (writeLine.audioBlobId) continue;

          let moved = false;
          while (readPos < eligibleIndices.length) {
            const readIdx = eligibleIndices[readPos];
            const readLine = nextLines[readIdx];
            const readBlobId = readLine.audioBlobId;

            if (!readBlobId) {
              readPos++;
              continue;
            }

            const blob = blobById.get(readBlobId);
            if (!blob) {
              // Dangling blob reference: clear it and continue scanning.
              readLine.audioBlobId = undefined;
              readPos++;
              continue;
            }

            if (blob.sourceAudioId !== sourceAudioId) {
              readPos++;
              continue;
            }

            writeLine.audioBlobId = readBlobId;
            readLine.audioBlobId = undefined;
            movedBlobUpdates.push({ ...blob, lineId: writeLine.id });
            blobById.set(readBlobId, { ...blob, lineId: writeLine.id });
            readPos++;
            moved = true;
            break;
          }

          if (!moved) break;
        }

        if (movedBlobUpdates.length === 0) {
          alert('后面没有找到可补位的音频段。');
          return;
        }

        const updatedProject = {
          ...project,
          chapters: project.chapters.map((ch) => {
            if (ch.id !== chapterId) return ch;
            return { ...ch, scriptLines: nextLines };
          }),
          lastModified: Date.now(),
        };

        await db.transaction('rw', db.projects, db.audioBlobs, async () => {
          await db.audioBlobs.bulkPut(movedBlobUpdates);
          await db.projects.put(updatedProject);
        });

        set(state => ({
          projects: state.projects.map(p => p.id === projectId ? updatedProject : p)
            .sort((a,b) => b.lastModified - a.lastModified),
        }));
      },
      resegmentAndRealignAudio: async (projectId, sourceAudioId, markers, skipHeadSegments = 0) => {
        get().clearPlayingLine();
        get().setIsLoading(true);
    
        try {
            const safeSkipHeadSegments = Math.max(0, Math.floor(skipHeadSegments));
            await db.audioMarkers.put({ sourceAudioId, markers, skipHeadSegments: safeSkipHeadSegments });
    
            const masterAudio = await db.masterAudios.get(sourceAudioId);
            if (!masterAudio) throw new Error("母带音频未找到。");
    
            const project = get().projects.find(p => p.id === projectId);
            if (!project) throw new Error("项目未找到。");
    
            const affectedLines: { line: ScriptLine, chapterId: string }[] = [];
            const oldBlobIds = new Set<string>();
    
            // Find currently affected lines in script order
            for (const chapter of project.chapters) {
                for (const line of chapter.scriptLines) {
                    if (line.audioBlobId) {
                        const blobInfo = await db.audioBlobs.get(line.audioBlobId);
                        if (blobInfo && blobInfo.sourceAudioId === sourceAudioId) {
                            affectedLines.push({ line, chapterId: chapter.id });
                            oldBlobIds.add(line.audioBlobId);
                        }
                    }
                }
            }
            
            // Resegment audio
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const mainAudioBuffer = await audioContext.decodeAudioData(await masterAudio.data.arrayBuffer());
            
            const newBlobs: AudioBlob[] = [];
            const fullDuration = mainAudioBuffer.duration;
            const normalizedMarkers = markers
                .filter((m) => Number.isFinite(m))
                .map((m) => Math.max(0, Math.min(fullDuration, m)))
                .filter((m) => m > 0 && m < fullDuration)
                .sort((a, b) => a - b)
                .filter((m, i, arr) => i === 0 || m - arr[i - 1] > 1e-4);
            const boundaries = [0, ...normalizedMarkers, fullDuration];
            const segmentCount = Math.max(0, boundaries.length - 1);
            if (segmentCount <= 0) throw new Error("音频分段失败：无有效时长。");
            if (safeSkipHeadSegments >= segmentCount) {
                throw new Error(`跳过片头段数过大：${safeSkipHeadSegments}（总分段数：${segmentCount}）`);
            }

            const baseIdTime = Date.now();
            for (let segIndex = safeSkipHeadSegments; segIndex < boundaries.length - 1; segIndex++) {
                const startTime = boundaries[segIndex];
                const endTime = boundaries[segIndex + 1];
                const duration = endTime - startTime;
                if (duration <= 0) continue;
    
                const startSample = Math.floor(startTime * mainAudioBuffer.sampleRate);
                const endSample = Math.floor(endTime * mainAudioBuffer.sampleRate);
                
                const segmentBuffer = audioContext.createBuffer(mainAudioBuffer.numberOfChannels, endSample - startSample, mainAudioBuffer.sampleRate);
                for (let ch = 0; ch < mainAudioBuffer.numberOfChannels; ch++) {
                    segmentBuffer.copyToChannel(mainAudioBuffer.getChannelData(ch).subarray(startSample, endSample), ch);
                }
    
                const segmentBlob = bufferToWav(segmentBuffer);
                const newBlobId = `audio_reseg_${baseIdTime}_${segIndex}`;
                newBlobs.push({
                    id: newBlobId,
                    lineId: '', // Will be assigned below
                    data: segmentBlob,
                    sourceAudioId: sourceAudioId,
                    sourceAudioFilename: masterAudio.id.replace(`${projectId}_`, ''),
                });
            }
            audioContext.close();
    
            if (affectedLines.length === 0) {
                throw new Error("未找到需要校准的已绑定音频行。");
            }

            const allLinesWithChapter = project.chapters.flatMap(ch => ch.scriptLines.map(line => ({ line, chapterId: ch.id })));
            const indexByLineId = new Map<string, number>();
            allLinesWithChapter.forEach((item, idx) => indexByLineId.set(item.line.id, idx));

            const affectedIndexes = affectedLines
                .map((item) => indexByLineId.get(item.line.id))
                .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

            if (affectedIndexes.length === 0) {
                throw new Error("校准失败：无法定位已绑定音频行在脚本中的位置。");
            }

            const minAffectedIndex = Math.min(...affectedIndexes);
            const maxAffectedIndex = Math.max(...affectedIndexes);

            const nonAudioCharacterIds = get().characters
                .filter(c => NON_AUDIO_ROLE_NAME_KEYS.has(normalizeCharacterNameKey(c.name)))
                .map(c => c.id);

            const isEligibleForThisSource = (line: ScriptLine) => {
                if (nonAudioCharacterIds.includes(line.characterId || '')) return false;
                // Don't overwrite audio from other sources.
                if (line.audioBlobId && !oldBlobIds.has(line.audioBlobId)) return false;
                return true;
            };

            // Realign within the affected range in script order (includes gaps).
            let linesToRealign = allLinesWithChapter
                .slice(minAffectedIndex, maxAffectedIndex + 1)
                .filter(({ line }) => isEligibleForThisSource(line));

            // If new segments > current range lines, prefer expanding within the same chapter
            // (prepend missing lines before the first affected line, then append after the last).
            if (newBlobs.length > linesToRealign.length) {
                let remaining = newBlobs.length - linesToRealign.length;

                const minChapterId = allLinesWithChapter[minAffectedIndex]?.chapterId;
                const maxChapterId = allLinesWithChapter[maxAffectedIndex]?.chapterId;

                const prepend: { line: ScriptLine; chapterId: string }[] = [];
                for (let i = minAffectedIndex - 1; i >= 0 && remaining > 0; i--) {
                    const item = allLinesWithChapter[i];
                    if (minChapterId && item.chapterId !== minChapterId) break;
                    if (!isEligibleForThisSource(item.line)) continue;
                    if (item.line.audioBlobId) continue;
                    prepend.push(item);
                    remaining--;
                }
                prepend.reverse();
                if (prepend.length > 0) {
                    linesToRealign = prepend.concat(linesToRealign);
                }

                if (remaining > 0) {
                    const append: { line: ScriptLine; chapterId: string }[] = [];
                    for (let i = maxAffectedIndex + 1; i < allLinesWithChapter.length && remaining > 0; i++) {
                        const item = allLinesWithChapter[i];
                        if (maxChapterId && item.chapterId !== maxChapterId) break;
                        if (!isEligibleForThisSource(item.line)) continue;
                        if (item.line.audioBlobId) continue;
                        append.push(item);
                        remaining--;
                    }
                    if (append.length > 0) {
                        linesToRealign = linesToRealign.concat(append);
                    }
                }
            }
    
            let updatedProject = { ...project, lastModified: Date.now() };
            const newBlobAssignments = new Map<string, string>();
    
            linesToRealign.forEach((lineInfo, index) => {
                const newBlob = newBlobs[index];
                if (newBlob) {
                    newBlob.lineId = lineInfo.line.id;
                    newBlobAssignments.set(lineInfo.line.id, newBlob.id);
                }
            });
    
            updatedProject.chapters = updatedProject.chapters.map(ch => ({
                ...ch,
                scriptLines: ch.scriptLines.map(line => {
                    if (newBlobAssignments.has(line.id)) {
                        return { ...line, audioBlobId: newBlobAssignments.get(line.id) };
                    }
                    // If the line previously had an audio from this source but no longer gets one
                    if (oldBlobIds.has(line.audioBlobId || '')) {
                        return { ...line, audioBlobId: undefined };
                    }
                    return line;
                })
            }));
            
            // Persist changes
            await db.transaction('rw', db.projects, db.audioBlobs, async () => {
                // Delete all old blobs from this source first
                await db.audioBlobs.bulkDelete(Array.from(oldBlobIds));
                
                // Put all the new blobs
                const blobsToPut = newBlobs.filter(b => b.lineId); // Only put blobs that were assigned to a line
                if (blobsToPut.length > 0) {
                    await db.audioBlobs.bulkPut(blobsToPut);
                }
                
                await db.projects.put(updatedProject);
            });
            
            set({ projects: get().projects.map(p => p.id === projectId ? updatedProject : p) });
    
        } catch (e) {
            console.error("Failed to resegment and realign audio:", e);
            alert(`校准失败: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            get().setIsLoading(false);
        }
      },
});
