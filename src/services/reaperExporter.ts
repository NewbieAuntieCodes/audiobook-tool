import JSZip from 'jszip';
import { db } from '../db';
import { Project, Chapter, Character, ScriptLine, LineType, SilencePairing } from '../types';
import { defaultSilenceSettings } from '../lib/defaultSilenceSettings';
import { bufferToWav } from '../lib/wavEncoder';
import { bufferToMp3 } from '../lib/mp3Encoder';

// --- Helper Functions ---

const sanitizeForRpp = (str: string): string => {
    return str.replace(/"/g, "'").replace(/[\r\n]/g, ' ');
}

const sanitizeFilename = (name: string, maxLength: number = 200): string => {
    const sanitized = name.replace(/[\r\n]/g, ' ').replace(/[<>:"/\\|?*]+/g, '_').replace(/_+/g, '_');
    const trimmed = sanitized.replace(/^[_ ]+|[_ ]+$/g, '');
    if (trimmed.length > maxLength) {
        return trimmed.substring(0, maxLength).trim() + '...';
    }
    return trimmed;
};

const getRppSourceTypeFromFileName = (fileName: string): 'WAVE' | 'MP3' => {
    return fileName.toLowerCase().endsWith('.mp3') ? 'MP3' : 'WAVE';
};

const getLineType = (line: ScriptLine | undefined, characters: Character[]): LineType => {
    if (!line || !line.characterId) return 'narration';
    const character = characters.find(c => c.id === line.characterId);
    if (
        !character ||
        character.name === 'Narrator' ||
        character.name === '旁白' ||
        character.name === '[旁白]' ||
        character.name === '[静音]'
    ) {
        return 'narration';
    }
    if (character.name === '音效' || character.name === '[音效]') return 'sfx';
    return 'dialogue';
};

interface TimelineItem {
    line: ScriptLine;
    character: Character | undefined;
    audioBlob: Blob;
    duration: number;
    chapterIndex: number;
    lineIndexInChapter: number;
    mainTimelineStartTime: number;
    sourceStartTime: number;
    generatedItemName: string;
    audioBuffer: AudioBuffer;
}

const generateRppTrackItems = (items: TimelineItem[], sourceFileName: string): string => {
    // Use ITEM-level SOFFS for maximum compatibility across REAPER versions.
    // Each ITEM references the same concatenated WAV and plays from SOFFS.
    const sourceType = getRppSourceTypeFromFileName(sourceFileName);
    return items.map(item => `
    <ITEM
      POSITION ${item.mainTimelineStartTime.toFixed(6)}
      LENGTH ${item.duration.toFixed(6)}
      NAME "${sanitizeForRpp(item.generatedItemName)}"
      SOFFS ${item.sourceStartTime.toFixed(6)}
      <SOURCE ${sourceType}
        FILE "${sanitizeForRpp(sourceFileName)}"
      >
    >
    `).join('');
};

const generateRppContent = (
    projectName: string,
    sampleRate: number,
    trackItems: Record<string, string>
): string => {
    const trackOrder = ['narration', 'dialogue', 'os', 'telephone', 'system', 'other'];
    const trackNames: Record<string, string> = {
        narration: '旁白 (Narration)',
        dialogue: '角色对白 (Dialogue)',
        os: '心音 (OS)',
        telephone: '电话音 (Telephone)',
        system: '系统音 (System)',
        other: '其他 (Others)'
    };

    const tracksRpp = trackOrder.map(key => {
        if (trackItems[key] && trackItems[key].trim() !== '') {
            return `  <TRACK\n    NAME "${trackNames[key]}"${trackItems[key]}\n  >`;
        }
        return '';
    }).filter(Boolean).join('\n');

    return `
<REAPER_PROJECT 0.1 "7.0/js-web-exporter" 1700000000
  SAMPLERATE ${sampleRate}
${tracksRpp}
>
    `.trim();
};

// --- Main Export Function ---

export const exportToReaperProject = async (
    project: Project,
    chaptersToExport: Chapter[],
    allCharacters: Character[],
    options?: { audioFormat?: 'wav' | 'mp3'; mp3BitrateKbps?: number }
): Promise<void> => {
    const { silenceSettings = defaultSilenceSettings } = project;
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const zip = new JSZip();
    const audioFormat = options?.audioFormat ?? 'wav';

    try {
        // Step 1: Collect all lines with audio blobs, decode them, and sort them chronologically.
        const chapterNumberMap = new Map<string, number>();
        project.chapters.forEach((ch, idx) => chapterNumberMap.set(ch.id, idx + 1));

        const baseItemsPromises = chaptersToExport.flatMap(chapter => 
            chapter.scriptLines.map(async (line, lineIndexInChapter) => {
                if (!line.audioBlobId) return null;
                const audioBlobRecord = await db.audioBlobs.get(line.audioBlobId);
                if (!audioBlobRecord) return null;

                const buffer = await audioContext.decodeAudioData(await audioBlobRecord.data.arrayBuffer());
                return {
                    line,
                    audioBlob: audioBlobRecord.data,
                    duration: buffer.duration,
                    audioBuffer: buffer, // Keep buffer for concatenation
                    character: allCharacters.find(c => c.id === line.characterId),
                    chapterIndex: chapterNumberMap.get(chapter.id) || 0,
                    lineIndexInChapter,
                };
            })
        );
        const baseItemsUnsorted = (await Promise.all(baseItemsPromises))
            .filter((item): item is NonNullable<typeof item> => item !== null);

        if (baseItemsUnsorted.length === 0) {
            throw new Error("所选章节内没有已对轨的音频。");
        }

        baseItemsUnsorted.sort((a, b) => {
            if (a.chapterIndex !== b.chapterIndex) return a.chapterIndex - b.chapterIndex;
            return a.lineIndexInChapter - b.lineIndexInChapter;
        });

        // Step 2: Create final TimelineItem objects with all time calculations done in one pass.
        // FIX: Replaced .map() with a more explicit for...of loop to ensure correct accumulator logic
        // for `mainTimelineTime` and `sourceTimelineTime`, fixing the bug where all clips started at time 0.
        const finalTimelineItems: TimelineItem[] = [];
        let mainTimelineTime = silenceSettings.startPadding > 0 ? silenceSettings.startPadding : 0;
        let sourceTimelineTime = 0;

        for (const [index, item] of baseItemsUnsorted.entries()) {
            const chapterNumStr = item.chapterIndex.toString().padStart(3, '0');
            const characterName = sanitizeFilename(item.character?.name || '未知', 20);
            const lineNumStr = (index + 1).toString().padStart(4, '0');
            const abridgedText = sanitizeFilename(item.line.text, 30);
            const generatedItemName = `Ch${chapterNumStr}_${lineNumStr}_${characterName}_${abridgedText}`;

            // Create the item with the CURRENT accumulator values
            finalTimelineItems.push({
                ...item,
                mainTimelineStartTime: mainTimelineTime,
                sourceStartTime: sourceTimelineTime,
                generatedItemName,
            });

            // NOW, update the accumulators for the NEXT item
            sourceTimelineTime += item.duration;

            let silenceDuration = 0;
            if (item.line.postSilence !== undefined && item.line.postSilence !== null) {
                silenceDuration = item.line.postSilence;
            } else {
                if (index === baseItemsUnsorted.length - 1) {
                    silenceDuration = silenceSettings.endPadding;
                } else {
                    const nextItem = baseItemsUnsorted[index + 1];
                    const currentLineType = getLineType(item.line, allCharacters);
                    const nextLineType = getLineType(nextItem.line, allCharacters);
                    const pairKey = `${currentLineType}-to-${nextLineType}` as SilencePairing;
                    silenceDuration = silenceSettings.pairs[pairKey] ?? 1.0;
                }
            }
            mainTimelineTime += item.duration + (silenceDuration > 0 ? silenceDuration : 0);
        }
        
        // Step 3: Create the single, concatenated audio file.
        const totalSamples = finalTimelineItems.reduce((sum, item) => sum + item.audioBuffer.length, 0);
        if (totalSamples === 0) throw new Error("无法解码任何音频数据。");
        
        const offlineCtx = new OfflineAudioContext(1, totalSamples, audioContext.sampleRate);
        
        finalTimelineItems.forEach(item => {
            const source = offlineCtx.createBufferSource();
            source.buffer = item.audioBuffer;
            source.connect(offlineCtx.destination);
            source.start(item.sourceStartTime);
        });

        const singleConcatenatedBuffer = await offlineCtx.startRendering();
        const singleAudioBlob =
            audioFormat === 'mp3'
                ? bufferToMp3(singleConcatenatedBuffer, { bitrateKbps: options?.mp3BitrateKbps })
                : bufferToWav(singleConcatenatedBuffer);
        const singleAudioFilename = `${sanitizeFilename(project.name)}_Audio.${
            audioFormat === 'mp3' ? 'mp3' : 'wav'
        }`;
        zip.file(singleAudioFilename, singleAudioBlob);
        
        // Step 4: Group items by track type for RPP generation
        const tracks: Record<string, TimelineItem[]> = { narration: [], dialogue: [], os: [], telephone: [], system: [], other: [] };
        const otherSoundTypes = new Set(project.customSoundTypes || []);

        finalTimelineItems.forEach(item => {
            const soundType = item.line.soundType;
            if (getLineType(item.line, allCharacters) === 'narration') tracks.narration.push(item);
            else if (soundType === 'OS') tracks.os.push(item);
            else if (soundType === '电话音') tracks.telephone.push(item);
            else if (soundType === '系统音') tracks.system.push(item);
            else if (soundType && otherSoundTypes.has(soundType)) tracks.other.push(item);
            else tracks.dialogue.push(item);
        });
        
        // Step 5: Generate RPP content strings for each track
        const trackItemsStrings: Record<string, string> = {};
        Object.keys(tracks).forEach(key => {
            if(tracks[key].length > 0) {
              trackItemsStrings[key] = generateRppTrackItems(tracks[key], singleAudioFilename);
            }
        });
        const rppContent = generateRppContent(project.name, audioContext.sampleRate, trackItemsStrings);

        // Step 6: Create ZIP file with RPP, the single audio file, and a README
        const newReadme = `你好！感谢使用 AI 有声内容创作工具。

我们采纳了您的建议，优化了导出流程，为您带来两全其美的体验：**整洁的项目文件夹** 与 **Reaper内部最大的编辑灵活性**。

**重要：如何使用这个 Reaper 工程文件**

1.  **解压文件**：请将这个 .zip 压缩包的 **全部内容** 解压到一个新的文件夹中。
    *切勿* 直接在压缩包查看器中双击 .RPP 文件，这会导致 Reaper 找不到音频文件。

2.  **打开工程**：进入你刚刚解压的文件夹，然后双击 .RPP 文件。

Reaper 现在应该能正确加载所有音轨和对应的音频片段了。

---
**新工作流说明**

- **文件极简**：您的项目文件夹现在非常干净。只有一个 .RPP 工程文件和一个包含所有音频的 .${audioFormat === 'mp3' ? 'mp3' : 'wav'} 文件。
- **灵活性不变**：在 Reaper 中，这个长文件已被自动“切割”成独立的、可拖动的小片段，与之前的版本在操作上完全一致！

${audioFormat === 'mp3' ? `注意：MP3 为有损压缩，且不同软件对 MP3 的编码延迟处理可能略有差异。如需最精准的样本级对齐与后期处理，建议改用 WAV 导出。` : ''}

这意味着，您仍然可以：
- **精准对轨**：精确调整每一句台词的时间。
- **独立处理**：对单句台词进行独立的音量、效果和声像调整。
- **方便修改**：如果某一句需要重录或替换，只需在 Reaper 中替换对应的片段。

为了让你在 Reaper 中能清晰地识别每一段音频，我们保留了详细的片段命名：
**片段名称格式**：\`Ch[章节号]_[行号]_[角色名]_[台词片段]\`
**例如**：\`Ch001_003_白瑶_你好啊\`

我们相信这个新方案能为您提供更专业、更高效的后期制作体验。

祝创作顺利！
`;
        zip.file("【重要】如何使用.txt", newReadme);
        zip.file(`${sanitizeFilename(project.name)}.RPP`, rppContent);
        
        const zipBlob = await zip.generateAsync({ type: 'blob' });

        // Step 7: Trigger download
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sanitizeFilename(project.name)}_Reaper.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

    } finally {
        if (audioContext.state !== 'closed') {
          await audioContext.close();
        }
    }
};
