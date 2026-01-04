import { StateCreator } from 'zustand';
import { AppState } from '../useStore';
import { Project, Chapter, AudioBlob, ScriptLine, Character, SilenceSettings, MasterAudio } from '../../types';
import { db } from '../../db';
import { bufferToWav } from '../../lib/wavEncoder';

export interface ProjectAudioSlice {
  updateLineAudio: (projectId: string, chapterId: string, lineId: string, audioBlobId: string | null) => Promise<void>;
  assignAudioToLine: (projectId: string, chapterId: string, lineId: string, audioBlob: Blob, sourceAudioId?: string, sourceAudioFilename?: string) => Promise<void>;
  clearAudioFromChapters: (projectId: string, chapterIds: string[]) => Promise<void>;
  resegmentAndRealignAudio: (projectId: string, sourceAudioId: string, markers: number[]) => Promise<void>;
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
      resegmentAndRealignAudio: async (projectId, sourceAudioId, markers) => {
        get().clearPlayingLine();
        get().setIsLoading(true);
    
        try {
            await db.audioMarkers.put({ sourceAudioId, markers });
    
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
            const allMarkers = [0, ...markers.sort((a, b) => a - b), fullDuration];
    
            for (let i = 0; i < allMarkers.length - 1; i++) {
                const startTime = allMarkers[i];
                const endTime = allMarkers[i+1];
                const duration = endTime - startTime;
                if (duration <= 0) continue;
    
                const startSample = Math.floor(startTime * mainAudioBuffer.sampleRate);
                const endSample = Math.floor(endTime * mainAudioBuffer.sampleRate);
                
                const segmentBuffer = audioContext.createBuffer(mainAudioBuffer.numberOfChannels, endSample - startSample, mainAudioBuffer.sampleRate);
                for (let ch = 0; ch < mainAudioBuffer.numberOfChannels; ch++) {
                    segmentBuffer.copyToChannel(mainAudioBuffer.getChannelData(ch).subarray(startSample, endSample), ch);
                }
    
                const segmentBlob = bufferToWav(segmentBuffer);
                const newBlobId = `audio_reseg_${Date.now()}_${i}`;
                newBlobs.push({
                    id: newBlobId,
                    lineId: '', // Will be assigned below
                    data: segmentBlob,
                    sourceAudioId: sourceAudioId,
                    sourceAudioFilename: masterAudio.id.replace(`${projectId}_`, ''),
                });
            }
            audioContext.close();
    
            // Realign: Find all lines that need audio, including new ones.
            let linesToRealign = [...affectedLines];
    
            // If new segments > old lines, find the next available lines to fill.
            if (newBlobs.length > affectedLines.length && affectedLines.length > 0) {
                const linesToAddCount = newBlobs.length - affectedLines.length;
                const lastAffected = affectedLines[affectedLines.length - 1];
                
                const allLinesWithChapter = project.chapters.flatMap(ch => ch.scriptLines.map(line => ({ line, chapterId: ch.id })));
                const lastAffectedIndexInAll = allLinesWithChapter.findIndex(item => item.line.id === lastAffected.line.id);
    
                if (lastAffectedIndexInAll !== -1) {
                    const nonAudioCharacterIds = get().characters
                        .filter(c => c.name === '[静音]' || c.name === '音效' || c.name === '[音效]')
                        .map(c => c.id);
    
                    const potentialNextLines = allLinesWithChapter
                        .slice(lastAffectedIndexInAll + 1)
                        .filter(({ line }) => !line.audioBlobId && !nonAudioCharacterIds.includes(line.characterId || ''))
                        .slice(0, linesToAddCount);
                    
                    linesToRealign.push(...potentialNextLines);
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
