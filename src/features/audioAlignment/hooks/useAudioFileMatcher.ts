// FIX: Changed React import from a named import to a default import to correctly resolve the React namespace for types like React.ChangeEvent.
import React from 'react';
import * as mm from 'music-metadata-browser';
import { Project, Character, Chapter, ScriptLine, MasterAudio } from '../../../types';
import { bufferToWav } from '../../../lib/wavEncoder';
import { normalizeCharacterNameKey } from '../../../lib/characterName';
// FIX: Import `Buffer` to resolve "Cannot find name 'Buffer'" error.
import { Buffer } from 'buffer';
// FIX: Import the 'db' instance to resolve 'Cannot find name 'db''.
import { db } from '../../../db';

const NON_AUDIO_ROLE_NAME_KEYS = new Set(['[静音]', '静音', '音效', '[音效]', 'sfx'].map(normalizeCharacterNameKey));

interface UseAudioFileMatcherProps {
  currentProject: Project | undefined;
  characters: Character[];
  assignAudioToLine: (projectId: string, chapterId: string, lineId: string, audioBlob: Blob, sourceAudioId?: string, sourceAudioFilename?: string) => Promise<void>;
  multiSelectedChapterIds?: string[];
}

const parseChapterIdentifier = (identifier: string): number[] => {
    // 只看章节数字，忽略“章/集/回/话”等单位和分段后缀 (1)(2)/（上）（下）
    // 兼容示例：
    // - "3"、"第3章 标题"、"第003集 标题 (1)" → 3
    // - "3-5"、"第003-005集 批量" → [3,4,5]
    const trimmed = identifier.trim();

    // 先识别范围
    const rangeMatch = trimmed.match(/(\d+)\s*[-~]\s*(\d+)/);
    if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 10);
        const end = parseInt(rangeMatch[2], 10);
        if (!isNaN(start) && !isNaN(end) && start <= end) {
            const out: number[] = [];
            for (let i = start; i <= end; i++) out.push(i);
            return out;
        }
    }

    // 取第一个数字块作为章节号，忽略后续分段数字
    const firstNum = trimmed.match(/\d+/);
    if (!firstNum) return [];
    const num = parseInt(firstNum[0], 10);
    return isNaN(num) ? [] : [num];
};

// 解析Adobe Audition XMP格式的CuePoint标记
const parseXmpCuePoints = (metadata: any, audioDuration: number): { startTime: number; endTime: number }[] | null => {
    try {
        // 从 native 标签中查找所有 PRIV 帧
        let privTags: any[] = [];

        // 检查所有可能的 ID3 版本
        const id3Versions = ['ID3v2.3', 'ID3v2.4', 'ID3v2.2', 'ID3v2'];

        for (const version of id3Versions) {
            const nativeTags = metadata.native?.[version];
            if (Array.isArray(nativeTags)) {
                // 如果是数组，查找 id === 'PRIV' 的元素
                const privFrames = nativeTags.filter((tag: any) => tag?.id === 'PRIV');
                privTags.push(...privFrames);
            } else if (nativeTags?.PRIV) {
                // 如果是对象，直接获取 PRIV
                const privData = Array.isArray(nativeTags.PRIV) ? nativeTags.PRIV : [nativeTags.PRIV];
                privTags.push(...privData);
            }
        }

        if (privTags.length === 0) {
            console.log('未找到PRIV标签');
            return null;
        }

        console.log(`找到 ${privTags.length} 个PRIV标签`);

        // 查找XMP私有标签
        const xmpTag = privTags.find((tag: any) => {
            // 检查多种可能的XMP标识
            if (tag?.value?.owner_identifier === 'XMP') return true;
            if (tag?.owner_identifier === 'XMP') return true;
            if (typeof tag === 'string' && tag.includes('xmpmeta')) return true;
            if (tag?.description && tag.description.includes('xmpmeta')) return true;
            // 检查tag.value是否为字符串且包含XMP
            if (typeof tag?.value === 'string' && tag.value.includes('xmpmeta')) return true;
            // 检查data字段
            if (tag?.value?.data && typeof tag.value.data === 'string' && tag.value.data.includes('xmpmeta')) return true;
            return false;
        });

        if (!xmpTag) {
            console.log('未找到XMP标签');
            return null;
        }

        console.log('找到XMP标签:', xmpTag);

        // 获取XMP字符串 - 尝试多种可能的数据位置
        let xmpString = '';
        if (typeof xmpTag === 'string') {
            xmpString = xmpTag;
        } else if (typeof xmpTag.value === 'string') {
            xmpString = xmpTag.value;
        } else if (xmpTag.value?.data) {
            if (typeof xmpTag.value.data === 'string') {
                xmpString = xmpTag.value.data;
            } else if (xmpTag.value.data instanceof Uint8Array || xmpTag.value.data instanceof Buffer) {
                // 将字节数组转换为字符串
                xmpString = new TextDecoder('utf-8').decode(xmpTag.value.data);
            }
        } else if (xmpTag.description) {
            xmpString = xmpTag.description;
        }

        if (!xmpString) {
            console.log('XMP标签中没有数据');
            return null;
        }

        console.log(`XMP字符串长度: ${xmpString.length}`);
        console.log('XMP字符串片段:', xmpString.substring(0, 200));

        // 简单的正则表达式解析XMP中的CuePoint标记
        // 匹配 xmpDM:startTime="数字"
        const startTimeRegex = /xmpDM:startTime="(\d+)"/g;
        const frameRateRegex = /xmpDM:frameRate="f(\d+)"/;

        // 提取采样率
        const frameRateMatch = xmpString.match(frameRateRegex);
        const sampleRate = frameRateMatch ? parseInt(frameRateMatch[1], 10) : 48000; // 默认48kHz

        // 提取所有startTime
        const startTimes: number[] = [];
        let match;
        while ((match = startTimeRegex.exec(xmpString)) !== null) {
            startTimes.push(parseInt(match[1], 10));
        }

        if (startTimes.length === 0) {
            return null;
        }

        // 排序
        startTimes.sort((a, b) => a - b);

        // 注意：不强制补 0 起始标记。
        // 若音频开头存在“片头/报幕”等无对应文本的内容，建议让第一个标记直接从正文开始，
        // 这样网页对轨会自动忽略开头那段无文本音频，避免整体偏移。

        // 创建时间段：从每个marker到下一个marker（或音频结束）
        const segments: { startTime: number; endTime: number }[] = [];
        for (let i = 0; i < startTimes.length; i++) {
            const startTime = startTimes[i] / sampleRate;
            const endTime = i < startTimes.length - 1
                ? startTimes[i + 1] / sampleRate
                : audioDuration;

            segments.push({ startTime, endTime });
        }

        console.log(`从XMP中解析到 ${segments.length} 个音频段落（包含起始段）`);
        return segments;

    } catch (error: unknown) {
        // FIX: The 'error' variable is of type 'unknown' in a catch block. Safely convert it to a string for logging to prevent a runtime crash.
        // Fix: Safely convert 'error' of type 'unknown' to a string for logging.
        console.error('解析XMP CuePoint标记失败:', String(error));
        return null;
    }
};

interface FileProcessResult {
  filename: string;
  success: boolean;
  matched: number;
  expected: number;
  foundSegments: number;
  chapterRange?: string;
  chapterCount?: number;
  errorMessage?: string;
}

export const useAudioFileMatcher = ({
  currentProject,
  characters,
  assignAudioToLine,
  multiSelectedChapterIds,
}: UseAudioFileMatcherProps) => {
  const [isSmartMatchLoading, setIsSmartMatchLoading] = React.useState(false);
  const [isChapterMatchLoading, setIsChapterMatchLoading] = React.useState(false);
  const [isReturnMatchLoading, setIsReturnMatchLoading] = React.useState(false);

  const nonAudioCharacterIds = React.useMemo(() => {
    return characters
      .filter(c => NON_AUDIO_ROLE_NAME_KEYS.has(normalizeCharacterNameKey(c.name)))
      .map(c => c.id);
  }, [characters]);

  const processMasterAudioFile = React.useCallback(async (
    file: File,
    identifier: string,
    matchType: 'cv' | 'character' | 'chapter',
    setIsLoading: (loading: boolean) => void
  ): Promise<FileProcessResult> => {
    if (!currentProject) {
      return {
        filename: file.name,
        success: false,
        matched: 0,
        expected: 0,
        foundSegments: 0,
        errorMessage: '未找到当前项目'
      };
    }
    
    const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.'));
    const sourceAudioId = `${currentProject.id}_${file.name}`;

    // Clean up previous audio segments from the same source file before processing.
    const oldBlobs = await db.audioBlobs.where('sourceAudioId').equals(sourceAudioId).toArray();
    if (oldBlobs.length > 0) {
        const oldBlobIds = oldBlobs.map(b => b.id);
        console.log(`清理旧音频: 找到 ${oldBlobIds.length} 个来自文件 "${file.name}" 的旧音频片段，正在删除...`);
        await db.audioBlobs.bulkDelete(oldBlobIds);
        // Note: We don't need to manually clear audioBlobId from script lines in the project state.
        // The subsequent `assignAudioToLine` will overwrite them. If a line is no longer matched,
        // its old audioBlobId will point to nothing, which is handled gracefully by the UI.
    }
    
    // Correctly extract the chapter identifier part (e.g., "405" or "405-410")
    const chapterIdentifier = nameWithoutExt.split('_')[0];

    if (!chapterIdentifier) {
        const errorMsg = '无法从文件名中提取章节编号';
        console.warn(`跳过格式不正确的文件: ${file.name}。${errorMsg}`);
        return {
          filename: file.name,
          success: false,
          matched: 0,
          expected: 0,
          foundSegments: 0,
          errorMessage: errorMsg
        };
    }

    try {
        // 1. Find target lines based on matchType (with intelligent fallback)
        const targetCharacterIds = new Set<string>();
        let matchMethod = '';

        if (matchType === 'cv' || matchType === 'character') {
            // Smart matching: try both CV name and character name
            let matchedChars: Character[] = [];

            if (matchType === 'cv') {
                // First try to match by CV name
                matchedChars = characters.filter(c => c.cvName === identifier && c.status !== 'merged');
                if (matchedChars.length > 0) {
                    matchMethod = `CV名 "${identifier}"`;
                    console.log(`✓ CV匹配 "${identifier}": 找到 ${matchedChars.length} 个角色`, matchedChars.map(c => c.name));
                } else {
                    // Fallback: try to match by character name
                    matchedChars = characters.filter(c => c.name === identifier && c.status !== 'merged');
                    if (matchedChars.length > 0) {
                        matchMethod = `角色名 "${identifier}" (CV名未匹配，降级为角色名匹配)`;
                        console.log(`✓ CV匹配降级: 未找到CV名 "${identifier}"，但找到同名角色 ${matchedChars.length} 个`, matchedChars.map(c => c.name));
                    }
                }
            } else if (matchType === 'character') {
                // First try to match by character name
                matchedChars = characters.filter(c => c.name === identifier && c.status !== 'merged');
                if (matchedChars.length > 0) {
                    matchMethod = `角色名 "${identifier}"`;
                    console.log(`✓ 角色匹配 "${identifier}": 找到 ${matchedChars.length} 个角色`);
                } else {
                    // Fallback: try to match by CV name
                    matchedChars = characters.filter(c => c.cvName === identifier && c.status !== 'merged');
                    if (matchedChars.length > 0) {
                        matchMethod = `CV名 "${identifier}" (角色名未匹配，降级为CV名匹配)`;
                        console.log(`✓ 角色匹配降级: 未找到角色名 "${identifier}"，但找到同名CV ${matchedChars.length} 个角色`, matchedChars.map(c => c.name));
                    }
                }
            }

            matchedChars.forEach(c => targetCharacterIds.add(c.id));

            if (matchedChars.length === 0) {
                const allCvs = [...new Set(characters.filter(c => c.cvName && c.status !== 'merged').map(c => c.cvName))];
                const allCharNames = characters.filter(c => c.status !== 'merged').map(c => c.name);
                console.warn(`❌ 未找到标识符 "${identifier}" - 既不是CV名也不是角色名`);
                console.log(`可用的CV名称:`, allCvs);
                console.log(`可用的角色名称:`, allCharNames);
            }
        }

        const chapterMatchers = parseChapterIdentifier(chapterIdentifier);
        const targetChapters = currentProject.chapters.filter((_, index) => chapterMatchers.includes(index + 1));

        // 详细的章节匹配日志
        if (chapterMatchers.length > 1) {
            console.log(`📚 章节范围匹配: "${chapterIdentifier}" → 第${chapterMatchers[0]}章到第${chapterMatchers[chapterMatchers.length-1]}章 (共${chapterMatchers.length}个章节)`);
        } else {
            console.log(`📚 单章节匹配: 第${chapterMatchers[0]}章`);
        }
        console.log(`   找到 ${targetChapters.length} 个章节:`, targetChapters.map(ch => ch.title));

        const targetLines = targetChapters.flatMap(chapter =>
            chapter.scriptLines
                .filter(line => !nonAudioCharacterIds.includes(line.characterId || ''))
                .filter(line => matchType === 'chapter' || (line.characterId && targetCharacterIds.has(line.characterId)))
                .map(line => ({ line, chapterId: chapter.id }))
        );

        if (targetLines.length === 0) {
            let errorMsg = '';
            if (matchType === 'cv' || matchType === 'character') {
                if (targetCharacterIds.size === 0) {
                    // No characters matched at all
                    const availableCvs = [...new Set(characters.filter(c => c.cvName && c.status !== 'merged').map(c => c.cvName))];
                    const availableChars = characters.filter(c => c.status !== 'merged').map(c => c.name);
                    errorMsg = `标识符 "${identifier}" 既不匹配任何CV名也不匹配任何角色名\n`;
                    errorMsg += `可用的CV: ${availableCvs.length > 0 ? availableCvs.join(', ') : '无'}\n`;
                    errorMsg += `可用的角色: ${availableChars.join(', ')}`;
                } else {
                    // Characters matched, but no lines in target chapters
                    errorMsg = `虽然找到了匹配的角色，但在章节 ${chapterIdentifier} 中没有找到对应的文本行`;
                }
            } else {
                errorMsg = `章节 ${chapterIdentifier} 中没有找到符合条件的文本行`;
            }
            console.warn(`文件 ${file.name}: 未找到目标行。${errorMsg}`);
            return {
              filename: file.name,
              success: false,
              matched: 0,
              expected: 0,
              foundSegments: 0,
              errorMessage: errorMsg
            };
        }

        console.log(`✓ 成功匹配 ${matchMethod}`);
        console.log(`📊 匹配结果: ${targetChapters.length} 个章节，共 ${targetLines.length} 行文本`);

        // 2. Parse markers from audio
        let metadata;
        try {
            metadata = await mm.parseBlob(file);
        } catch (e: unknown) {
            // FIX: The 'e' variable is of type 'unknown' in a catch block. Check if it's an Error instance before accessing 'message' to prevent runtime errors.
            // Fix: Add instanceof Error check to safely access properties on the 'unknown' error object.
            const message = e instanceof Error ? e.message : String(e);
            const errorMsg = `音频文件解析失败: ${message}`;
            console.error(`Metadata parsing failed for ${file.name}:`, message);
            return {
              filename: file.name,
              success: false,
              matched: 0,
              expected: targetLines.length,
              foundSegments: 0,
              errorMessage: errorMsg
            };
        }

        let audioSegments: { startTime: number; endTime: number }[] = [];
        const chapters = metadata.common.chapters || [];
        if (chapters.length > 0) {
            audioSegments = chapters.map(ch => ({ startTime: ch.startTime / 1000, endTime: ch.endTime / 1000 }));
        } else {
            const duration = metadata.format.duration || 0;
            const xmpSegments = parseXmpCuePoints(metadata, duration);
            if (xmpSegments) {
                audioSegments = xmpSegments;
            } else {
                const errorMsg = `缺少音频标记（需要${targetLines.length}个片段，找到0个）\n请在Adobe Audition中添加CuePoint标记`;
                console.error(`❌ 文件 ${file.name} 没有找到音频标记`);
                console.log(`📝 该文件需要 ${targetLines.length} 个标记来匹配对应的文本行`);
                console.log(`💡 解决方法：在Adobe Audition中打开音频文件，添加CuePoint标记后重新导出`);
                return {
                  filename: file.name,
                  success: false,
                  matched: 0,
                  expected: targetLines.length,
                  foundSegments: 0,
                  errorMessage: errorMsg
                };
            }
        }

        // 检查标记数量是否匹配
        console.log(`📊 标记数量: ${audioSegments.length}, 目标行数: ${targetLines.length}`);

        let warningMessage = '';
        if (audioSegments.length < targetLines.length) {
            warningMessage = `⚠️ 片段不足：找到${audioSegments.length}个片段，需要${targetLines.length}个`;
            console.warn(`⚠️ 警告：音频标记数量 (${audioSegments.length}) 少于目标行数 (${targetLines.length})`);
            console.warn(`⚠️ 部分文本行将无法匹配音频`);
        } else if (audioSegments.length > targetLines.length) {
            warningMessage = `⚠️ 片段过多：找到${audioSegments.length}个片段，只需要${targetLines.length}个`;
            console.warn(`⚠️ 警告：音频标记数量 (${audioSegments.length}) 多于目标行数 (${targetLines.length})`);
            console.warn(`⚠️ 部分音频段落将被忽略`);
        }

        // 3. Store master audio
        const masterAudioEntry: MasterAudio = { id: sourceAudioId, projectId: currentProject.id, data: file };
        await db.masterAudios.put(masterAudioEntry);

        // 4. Decode, split, and assign
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const mainAudioBuffer = await audioContext.decodeAudioData(await file.arrayBuffer());

        let matchedCount = 0;
        const limit = Math.min(targetLines.length, audioSegments.length);

        for (let i = 0; i < limit; i++) {
            const segment = audioSegments[i];
            const lineInfo = targetLines[i];
            
            const duration = segment.endTime - segment.startTime;
            if (duration <= 0) continue;

            const startSample = Math.floor(segment.startTime * mainAudioBuffer.sampleRate);
            const endSample = Math.floor(segment.endTime * mainAudioBuffer.sampleRate);
            
            const segmentBuffer = audioContext.createBuffer(mainAudioBuffer.numberOfChannels, endSample - startSample, mainAudioBuffer.sampleRate);
            for (let ch = 0; ch < mainAudioBuffer.numberOfChannels; ch++) {
                segmentBuffer.copyToChannel(mainAudioBuffer.getChannelData(ch).subarray(startSample, endSample), ch);
            }

            const segmentBlob = bufferToWav(segmentBuffer);
            await assignAudioToLine(currentProject.id, lineInfo.chapterId, lineInfo.line.id, segmentBlob, sourceAudioId, file.name);
            matchedCount++;
        }

        audioContext.close();

        const success = matchedCount === targetLines.length && audioSegments.length === targetLines.length;

        // 生成章节范围描述
        let chapterRangeDesc = '';
        if (chapterMatchers.length > 1) {
            chapterRangeDesc = `第${chapterMatchers[0]}-${chapterMatchers[chapterMatchers.length-1]}章`;
        } else if (chapterMatchers.length === 1) {
            chapterRangeDesc = `第${chapterMatchers[0]}章`;
        }

        return {
          filename: file.name,
          success,
          matched: matchedCount,
          expected: targetLines.length,
          foundSegments: audioSegments.length,
          chapterRange: chapterRangeDesc,
          chapterCount: targetChapters.length,
          errorMessage: warningMessage || undefined
        };

    } catch (error: unknown) {
        // FIX: The 'error' variable is of type 'unknown'. Use 'instanceof Error' to safely access properties like 'message', or convert to string for logging. This prevents runtime errors.
        // Fix: Add instanceof Error check to safely access properties on the 'unknown' error object.
        const message = error instanceof Error ? error.message : String(error);
        const errorMsg = `处理失败: ${message}`;
        // FIX: The 'error' variable is of type 'unknown'. It should be converted to a string before being logged to avoid a runtime crash.
        // Fix: Safely convert 'error' of type 'unknown' to a string for logging.
        console.error(`Error processing master audio file ${file.name}:`, String(error));
        return {
          filename: file.name,
          success: false,
          matched: 0,
          expected: 0,
          foundSegments: 0,
          errorMessage: errorMsg
        };
    }
  }, [currentProject, characters, nonAudioCharacterIds, assignAudioToLine]);


  const handleFileSelectionForReturnMatch = React.useCallback(async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !currentProject) return;

    setIsReturnMatchLoading(true);

    try {
        const file = files[0]; // Process only the first file for return matching

        const chaptersToSearch = (multiSelectedChapterIds && multiSelectedChapterIds.length > 0)
            ? currentProject.chapters.filter(ch => multiSelectedChapterIds.includes(ch.id))
            : [];
        
        if (chaptersToSearch.length === 0) {
            throw new Error('请先在左侧章节列表中选择一个或多个章节范围。');
        }

        const targetLines = chaptersToSearch.flatMap(chapter =>
            chapter.scriptLines
                .filter(line => line.isMarkedForReturn)
                .map(line => ({ line, chapterId: chapter.id }))
        );

        if (targetLines.length === 0) {
            throw new Error('在选定范围内未找到标记为“返音”的句子。');
        }

        console.log(`返音匹配: 找到 ${targetLines.length} 条目标行`);

        const sourceAudioId = `${currentProject.id}_return_${file.name}_${Date.now()}`;

        const oldBlobs = await db.audioBlobs.where('sourceAudioId').equals(sourceAudioId).toArray();
        if (oldBlobs.length > 0) {
            await db.audioBlobs.bulkDelete(oldBlobs.map(b => b.id));
        }

        let metadata;
        try {
            metadata = await mm.parseBlob(file);
        } catch (e: unknown) {
            // FIX: The 'e' variable is of type 'unknown' in a catch block. Check if it's an Error instance before accessing 'message' to prevent runtime errors.
            // Fix: Add instanceof Error check to safely access properties on the 'unknown' error object.
            throw new Error(`音频文件解析失败: ${e instanceof Error ? e.message : String(e)}`);
        }
        
        const duration = metadata.format.duration || 0;
        const audioSegments = parseXmpCuePoints(metadata, duration);

        if (!audioSegments || audioSegments.length === 0) {
            throw new Error(`音频文件中未找到标记点 (Cue Points)。`);
        }

        let warningMessage = '';
        if (audioSegments.length !== targetLines.length) {
            warningMessage = `⚠️ 数量不匹配：找到 ${audioSegments.length} 个音频片段，但有 ${targetLines.length} 句返音。将按顺序匹配前 ${Math.min(audioSegments.length, targetLines.length)} 句。`;
            console.warn(warningMessage);
        }

        const masterAudioEntry: MasterAudio = { id: sourceAudioId, projectId: currentProject.id, data: file };
        await db.masterAudios.put(masterAudioEntry);

        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const mainAudioBuffer = await audioContext.decodeAudioData(await file.arrayBuffer());

        let matchedCount = 0;
        const limit = Math.min(targetLines.length, audioSegments.length);

        for (let i = 0; i < limit; i++) {
            const segment = audioSegments[i];
            const lineInfo = targetLines[i];
            
            const segmentDuration = segment.endTime - segment.startTime;
            if (segmentDuration <= 0) continue;

            const startSample = Math.floor(segment.startTime * mainAudioBuffer.sampleRate);
            const endSample = Math.floor(segment.endTime * mainAudioBuffer.sampleRate);
            
            const segmentBuffer = audioContext.createBuffer(mainAudioBuffer.numberOfChannels, endSample - startSample, mainAudioBuffer.sampleRate);
            for (let ch = 0; ch < mainAudioBuffer.numberOfChannels; ch++) {
                segmentBuffer.copyToChannel(mainAudioBuffer.getChannelData(ch).subarray(startSample, endSample), ch);
            }

            const segmentBlob = bufferToWav(segmentBuffer);
            await assignAudioToLine(currentProject.id, lineInfo.chapterId, lineInfo.line.id, segmentBlob, sourceAudioId, file.name);
            matchedCount++;
        }

        audioContext.close();

        const result: FileProcessResult = {
            filename: file.name,
            success: matchedCount === targetLines.length && audioSegments.length === targetLines.length,
            matched: matchedCount,
            expected: targetLines.length,
            foundSegments: audioSegments.length,
            errorMessage: warningMessage || undefined
        };
        
        let message = `返音匹配完成: ${result.filename}\n\n`;
        if (result.success) {
            message += `✅ 成功匹配所有 ${result.matched} 条返音。`;
        } else {
            message += `匹配: ${result.matched}/${result.expected} 行\n`;
            message += `找到片段: ${result.foundSegments}\n`;
            if (result.errorMessage) message += `原因: ${result.errorMessage}`;
        }
        alert(message);
        
    } catch (error: unknown) {
        // FIX: The 'error' variable is of type 'unknown' in a catch block. Check if it's an Error instance before accessing 'message' to prevent a runtime crash.
        // Fix: Add instanceof Error check to safely access properties on the 'unknown' error object.
        alert(`返音匹配失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        setIsReturnMatchLoading(false);
        if (event.target) event.target.value = '';
    }
  }, [currentProject, multiSelectedChapterIds, assignAudioToLine]);

  const handleFileSelection = React.useCallback(async (
    event: React.ChangeEvent<HTMLInputElement>,
    matchType: 'cv' | 'character' | 'chapter',
    setIsLoading: (loading: boolean) => void
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !currentProject) return;

    setIsLoading(true);
    const results: FileProcessResult[] = [];

    for (const file of Array.from(files)) {
      const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.'));
      const parts = nameWithoutExt.split(/[_]/);

      let identifier: string | null = null;
      if (matchType === 'chapter') {
          identifier = parts[0];
      } else if (parts.length >= 2) {
          // Changed from 'parts.length === 2' to 'parts.length >= 2' to support filenames with more than 2 parts
          // This allows files like "405-434_凌玄逆_v2.mp3" to work correctly
          identifier = parts[1]; // cvName or characterName
      }

      if (!identifier) {
        const errorMsg = `文件名格式不正确，期望格式: "章节编号_${matchType === 'cv' ? 'CV名称' : '角色名称'}.mp3"`;
        console.warn(`跳过格式不正确的文件: ${file.name}。${errorMsg}`);
        results.push({
          filename: file.name,
          success: false,
          matched: 0,
          expected: 0,
          foundSegments: 0,
          errorMessage: errorMsg
        });
        continue;
      }

      console.log(`处理文件: ${file.name}, 匹配类型: ${matchType}, 识别符: ${identifier}`);
      const result = await processMasterAudioFile(file, identifier, matchType, setIsLoading);
      results.push(result);
    }

    setIsLoading(false);

    // 生成报告
    const successFiles = results.filter(r => r.success);
    const warningFiles = results.filter(r => !r.success && r.errorMessage?.includes('⚠️'));
    const errorFiles = results.filter(r => !r.success && !r.errorMessage?.includes('⚠️'));
    const totalMatched = results.reduce((sum, r) => sum + r.matched, 0);

    let message = `🎯 匹配完成\n\n`;
    message += `✅ 成功: ${successFiles.length} 个文件\n`;
    message += `⚠️ 警告: ${warningFiles.length} 个文件\n`;
    message += `❌ 失败: ${errorFiles.length} 个文件\n`;
    message += `📊 总共匹配: ${totalMatched} 条音轨\n`;

    if (warningFiles.length > 0 || errorFiles.length > 0) {
        message += `\n━━━━━━━━━━━━━━━━━━\n⚠️ 有问题的文件详情:\n`;
        
        if (warningFiles.length > 0) {
            message += `\n--- 警告 ---\n`;
            warningFiles.forEach(r => {
                message += `\n📁 ${r.filename}\n`;
                if (r.chapterRange) {
                  message += `   章节: ${r.chapterRange} (${r.chapterCount}个章节)\n`;
                }
                message += `   匹配: ${r.matched}/${r.expected} 行 (片段数: ${r.foundSegments})\n`;
                message += `   原因: ${r.errorMessage}\n`;
            });
        }
        
        if (errorFiles.length > 0) {
            message += `\n--- 失败 ---\n`;
            errorFiles.forEach(r => {
                message += `\n📁 ${r.filename}\n`;
                if (r.expected > 0) {
                  message += `   需要片段: ${r.expected}\n`;
                  message += `   找到片段: ${r.foundSegments}\n`;
                }
                message += `   原因: ${r.errorMessage}\n`;
            });
        }
    }

    if (successFiles.length > 0) {
      message += `\n━━━━━━━━━━━━━━━━━━\n✅ 成功的文件列表:\n`;
      successFiles.forEach(r => {
        message += `• ${r.filename}\n`;
      });
    }

    alert(message);
    if (event.target) event.target.value = '';
  }, [currentProject, processMasterAudioFile]);

  const handleFileSelectionForSmartMatch = (e: React.ChangeEvent<HTMLInputElement>) => handleFileSelection(e, 'cv', setIsSmartMatchLoading);
  const handleFileSelectionForChapterMatch = (e: React.ChangeEvent<HTMLInputElement>) => handleFileSelection(e, 'chapter', setIsChapterMatchLoading);

  return {
    isSmartMatchLoading,
    handleFileSelectionForSmartMatch,
    isChapterMatchLoading,
    handleFileSelectionForChapterMatch,
    isReturnMatchLoading,
    handleFileSelectionForReturnMatch,
  };
};
