import JSZip from 'jszip';
import { db } from '../db';
import {
  Project,
  Chapter,
  Character,
  ScriptLine,
  LineType,
  SilencePairing,
  SoundLibraryItem,
  TextMarker,
  PostProductionLufsSettings,
  SoundGroup,
} from '../types';
import { defaultSilenceSettings } from '../lib/defaultSilenceSettings';
import { bufferToWav } from '../lib/wavEncoder';
import { bufferToMp3 } from '../lib/mp3Encoder';
import { estimateLufsFromAudioBuffer } from '../lib/lufsNormalizer';
import { ensureSoundLufsFromBuffer, computeGainDbFromLufs } from './lufsService';
import { soundLibraryRepository } from '../repositories/soundLibraryRepository';
import { sfxGroupLibraryRepository } from '../repositories/sfxGroupLibraryRepository';
import { getNearestFolderNameFromSoundName, getSoundFileNameFromSoundName } from '../lib/soundPath';

// --- Helper Functions ---

// NOTE: Reaper 子工程（RPP_PROJECT）引用需要“绝对路径”才能稳定定位。
// 该路径可在“后期制作 -> 插入音效组”弹窗中配置；此常量仅作为兜底默认值。
const DEFAULT_SFX_GROUP_LIBRARY_BASE_PATH = 'D:\\WDG\\SfxGroups';

const sanitizeForRpp = (str: string): string => {
  return str.replace(/"/g, "'").replace(/[\r\n]/g, ' ');
};

const sanitizeFilename = (name: string, maxLength: number = 200): string => {
  const sanitized = name
    .replace(/[\r\n]/g, ' ')
    .replace(/[<>:"/\\|?*]+/g, '_')
    .replace(/_+/g, '_');
  const trimmed = sanitized.replace(/^[_ ]+|[_ ]+$/g, '');
  if (trimmed.length > maxLength) {
    return trimmed.substring(0, maxLength).trim() + '...';
  }
  return trimmed;
};

const joinWindowsPath = (basePath: string, filePath: string): string => {
  const base = (basePath || '').replace(/[\\/]+$/g, '');
  const rel = (filePath || '').replace(/^[/\\]+/g, '');
  if (!base) return rel;
  if (!rel) return base;
  return `${base}\\${rel}`;
};

const getRppSourceTypeFromFileName = (fileName: string): 'WAVE' | 'MP3' => {
  return fileName.toLowerCase().endsWith('.mp3') ? 'MP3' : 'WAVE';
};

const getLineType = (line: ScriptLine | undefined, characters: Character[]): LineType => {
  if (!line || !line.characterId) return 'narration';
  const character = characters.find((c) => c.id === line.characterId);
  if (
    !character ||
    character.name === 'Narrator' ||
    character.name === '旁白' ||
    character.name === '[旁白]'
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
  gainLinear?: number;
}

interface FxClip {
  startTime: number;
  duration: number;
  name: string;
  filePath: string;
  gainLinear?: number;
}

interface BgmClip extends FxClip {
  sourceDuration: number;
}

interface SubprojectClip {
  startTime: number;
  duration: number;
  name: string;
  filePath: string;
}

const dialogueItemToRpp = (item: TimelineItem, sourceFileName: string): string => {
  const sourceType = getRppSourceTypeFromFileName(sourceFileName);
  const volLine =
    typeof item.gainLinear === 'number' && isFinite(item.gainLinear) && item.gainLinear !== 1
      ? `      VOLPAN ${item.gainLinear.toFixed(6)} 0 1 -1\n`
      : '';

  return `
    <ITEM
      POSITION ${item.mainTimelineStartTime.toFixed(6)}
      LENGTH ${item.duration.toFixed(6)}
      NAME "${sanitizeForRpp(item.generatedItemName)}"
${volLine}      SOFFS ${item.sourceStartTime.toFixed(6)}
      <SOURCE ${sourceType}
        FILE "${sanitizeForRpp(sourceFileName)}"
      >
    >
  `;
};

const generateDialogueRppTrackItems = (items: TimelineItem[], sourceFileName: string): string =>
  items.map((item) => dialogueItemToRpp(item, sourceFileName)).join('');

const sfxClipToRpp = (clip: FxClip): string => {
  const sourceType = getRppSourceTypeFromFileName(clip.filePath);
  const volLine =
    typeof clip.gainLinear === 'number' && isFinite(clip.gainLinear) && clip.gainLinear !== 1
      ? `      VOLPAN ${clip.gainLinear.toFixed(6)} 0 1 -1\n`
      : '';

  return `
    <ITEM
      POSITION ${clip.startTime.toFixed(6)}
      LENGTH ${clip.duration.toFixed(6)}
      NAME "${sanitizeForRpp(clip.name)}"
${volLine}      <SOURCE ${sourceType}
        FILE "${sanitizeForRpp(clip.filePath)}"
      >
    >
  `;
};

const generateSfxRppTrackItems = (clips: FxClip[]): string =>
  clips.map((clip) => sfxClipToRpp(clip)).join('');

const generateBgmRppTrackItems = (clips: BgmClip[]): string =>
  clips
    .map((clip) => {
      const sourceType = getRppSourceTypeFromFileName(clip.filePath);
      const itemLength = clip.duration;
      const sourceDuration = clip.sourceDuration;
      const loopCount = Math.ceil(itemLength / sourceDuration);
      let itemsRpp = '';

      const volLine =
        typeof clip.gainLinear === 'number' &&
        isFinite(clip.gainLinear) &&
        clip.gainLinear !== 1
          ? `      VOLPAN ${clip.gainLinear.toFixed(6)} 0 1 -1\n`
          : '';

      for (let i = 0; i < loopCount; i++) {
        const pos = clip.startTime + i * sourceDuration;
        const len = Math.min(sourceDuration, itemLength - i * sourceDuration);
        if (len <= 0) continue;

        itemsRpp += `
    <ITEM
      POSITION ${pos.toFixed(6)}
      LENGTH ${len.toFixed(6)}
      NAME "${sanitizeForRpp(clip.name)}"
      SOFFS 0
${volLine}      <SOURCE ${sourceType}
        FILE "${sanitizeForRpp(clip.filePath)}"
      >
    >`;
      }

      return itemsRpp;
    })
    .join('');

const subprojectClipToRpp = (clip: SubprojectClip): string => {
  return `
    <ITEM
      POSITION ${clip.startTime.toFixed(6)}
      LENGTH ${clip.duration.toFixed(6)}
      NAME "${sanitizeForRpp(clip.name)}"
      <SOURCE RPP_PROJECT
        FILE "${sanitizeForRpp(clip.filePath)}"
      >
    >
  `;
};

const generateSubprojectRppTrackItems = (clips: SubprojectClip[]): string =>
  clips.map((clip) => subprojectClipToRpp(clip)).join('');

// Track names for sound library categories (fallback to category key if missing)
const SOUND_CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  // Plan A root-scan categories
  music_1: '音乐1',
  music_2: '音乐2',
  sfx_1: '音效1',
  sfx_2: '音效2',

  music1: '音乐1',
  music2: '音乐2',
  ambience1: '环境音1',
  ambience2: '环境音2',
  footsteps: '脚步',
  fabric: '衣物',
  doors_windows: '门窗',
  transportation: '交通',
  horror: '惊悚',
  suspense: '悬疑',
  fighting: '打斗',
  firearms: '枪械爆炸',
  variety: '综艺',
  fantasy: '奇幻',
  sci_fi: '科幻',
  animals: '动物',
  other_sfx: '其他音效',
};

const getCategoryTrackName = (category: string | undefined): string => {
  if (!category) return '音效';
  return SOUND_CATEGORY_DISPLAY_NAMES[category] || category;
};

const getSoundTrackNameByFolder = (sound: SoundLibraryItem): string => {
  const folder = getNearestFolderNameFromSoundName(sound.name);
  if (folder) return folder;
  return getCategoryTrackName(sound.category);
};

const generateRppContent = (
  projectName: string,
  sampleRate: number,
  dialogueTrackItemsByName: Record<string, string>,
  sfxTrackItemsByName: Record<string, string>,
  bgmTrackItemsByName: Record<string, string>,
  subprojectTrackItemsByName: Record<string, string>,
): string => {
  const getDialogueOrder = (trackName: string): number => {
    if (trackName === '旁白 PB') return 0;
    if (trackName.startsWith('对白 - ')) {
      const label = trackName.slice('对白 - '.length).trim();
      const special = ['OS', '电话', '系统', '旁白', '旁白OS', '系统提示', '内心独白'];
      if (special.includes(label)) return 1;
      return 2;
    }
    return 3;
  };

  const dialogueNames = Object.keys(dialogueTrackItemsByName);
  dialogueNames.sort(
    (a, b) => getDialogueOrder(a) - getDialogueOrder(b) || a.localeCompare(b, 'zh-CN'),
  );

  const dialogueTracksRpp = dialogueNames
    .map((trackName) => {
      const items = dialogueTrackItemsByName[trackName];
      if (!items || items.trim() === '') return '';
      return `  <TRACK\n    NAME "${sanitizeForRpp(trackName)}"${items}\n  >`;
    })
    .filter(Boolean)
    .join('\n');

  const buildFxTracks = (trackItemsByName: Record<string, string>): string => {
    const names = Object.keys(trackItemsByName).filter(
      (name) => trackItemsByName[name] && trackItemsByName[name].trim() !== '',
    );
    names.sort((a, b) => a.localeCompare(b, 'zh-CN'));
    return names
      .map(
        (name) =>
          `  <TRACK\n    NAME "${sanitizeForRpp(name)}"${trackItemsByName[name]}\n  >`,
      )
      .join('\n');
  };

  const sfxTracksRpp = buildFxTracks(sfxTrackItemsByName);
  const bgmTracksRpp = buildFxTracks(bgmTrackItemsByName);
  const subprojectTracksRpp = buildFxTracks(subprojectTrackItemsByName);

  return `
<REAPER_PROJECT 0.1 "7.0/js-web-exporter" 1700000000
  SAMPLERATE ${sampleRate}
${dialogueTracksRpp}
${sfxTracksRpp}
${bgmTracksRpp}
${subprojectTracksRpp}
>
  `.trim();
};

// --- Scene mapping helper ---

const buildLineIdToSceneName = (project: Project): Map<string, string> => {
  const sceneMarkers: TextMarker[] = (project.textMarkers || []).filter(
    (m) => m.type === 'scene' && !!m.name && !!m.startLineId && !!m.endLineId,
  );

  const lineOrder = new Map<string, number>();
  const lineById = new Map<string, ScriptLine>();

  project.chapters.forEach((ch, chIdx) => {
    ch.scriptLines.forEach((ln, lnIdx) => {
      lineOrder.set(ln.id, chIdx * 100000 + lnIdx);
      lineById.set(ln.id, ln);
    });
  });

  const keyOf = (lineId: string, offset: number): number | null => {
    const base = lineOrder.get(lineId);
    if (base === undefined) return null;
    const off = Number.isFinite(offset) ? offset : 0;
    return base * 1e4 + off;
  };

  const markerRanges = sceneMarkers
    .map((m) => {
      if (!m.name) return null;
      const startLine = lineById.get(m.startLineId);
      const endLine = lineById.get(m.endLineId);
      if (!startLine || !endLine) return null;

      const startTextLen = (startLine.text || '').length || 1;
      const endTextLen = (endLine.text || '').length || 1;

      const startOff = Math.max(0, Math.min(startTextLen, m.startOffset ?? 0));
      const endOff = Math.max(0, Math.min(endTextLen, m.endOffset ?? endTextLen));

      const a = keyOf(m.startLineId, startOff);
      const b = keyOf(m.endLineId, endOff);
      if (a === null || b === null) return null;

      const startKey = Math.min(a, b);
      const endKey = Math.max(a, b);
      return { startKey, endKey, name: m.name };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  const intersects = (lineStart: number, lineEnd: number, rangeStart: number, rangeEnd: number) => {
    const a0 = Math.min(lineStart, lineEnd);
    const a1 = Math.max(lineStart, lineEnd);
    const b0 = Math.min(rangeStart, rangeEnd);
    const b1 = Math.max(rangeStart, rangeEnd);
    return !(a1 <= b0 || a0 >= b1);
  };

  const lineIdToSceneName = new Map<string, string>();

  project.chapters.forEach((ch) => {
    ch.scriptLines.forEach((line) => {
      const textLen = (line.text || '').length || 1;
      const lineStartKey = keyOf(line.id, 0);
      const lineEndKey = keyOf(line.id, textLen);
      if (lineStartKey === null || lineEndKey === null) return;

      let best: { startKey: number; name: string } | null = null;
      for (const r of markerRanges) {
        if (!intersects(lineStartKey, lineEndKey, r.startKey, r.endKey)) continue;
        if (!best || r.startKey > best.startKey) {
          best = { startKey: r.startKey, name: r.name };
        }
      }
      if (best) {
        lineIdToSceneName.set(line.id, best.name);
      }
    });
  });

  return lineIdToSceneName;
};

// --- Main Export Function ---

export const exportPostProductionToReaper = async (
  project: Project,
  chaptersToExport: Chapter[],
  allCharacters: Character[],
  soundLibrary: SoundLibraryItem[],
  lufsSettings: PostProductionLufsSettings,
  options?: { audioFormat?: 'wav' | 'mp3'; mp3BitrateKbps?: number },
): Promise<void> => {
  const { silenceSettings: projectSilenceSettings } = project;
  const silenceSettings = projectSilenceSettings || defaultSilenceSettings;
  const audioFormat = options?.audioFormat ?? 'wav';

  const audioContext = new AudioContext();
  const zip = new JSZip();

  try {
    // Best-effort: try to restore read permission for linked sound library roots.
    // If permission is not granted, we still export dialogue audio and skip SFX/BGM.
    const hasSoundLibraryPermission = await soundLibraryRepository.requestRootReadPermission();

    // Reaper 子工程库路径（用于 RPP_PROJECT 的绝对路径引用）
    const configuredSfxGroupLibraryBasePath = (await sfxGroupLibraryRepository.getBasePath()).trim();
    const sfxGroupLibraryBasePath = (
      configuredSfxGroupLibraryBasePath || DEFAULT_SFX_GROUP_LIBRARY_BASE_PATH
    ).replace(/[\\/]+$/g, '');

    // Step 1: Build dialogue timeline and single audio file
    const chapterNumberMap = new Map<string, number>();
    project.chapters.forEach((ch, idx) => chapterNumberMap.set(ch.id, idx + 1));

    const baseItemsPromises = chaptersToExport.flatMap((chapter) =>
      chapter.scriptLines.map(async (line, lineIndexInChapter) => {
        if (!line.audioBlobId) return null;
        const audioBlobRecord = await db.audioBlobs.get(line.audioBlobId);
        if (!audioBlobRecord) return null;

        const buffer = await audioContext.decodeAudioData(
          await audioBlobRecord.data.arrayBuffer(),
        );
        return {
          line,
          audioBlob: audioBlobRecord.data,
          duration: buffer.duration,
          audioBuffer: buffer,
          character: allCharacters.find((c) => c.id === line.characterId),
          chapterIndex: chapterNumberMap.get(chapter.id) || 0,
          lineIndexInChapter,
        } as Omit<
          TimelineItem,
          'mainTimelineStartTime' | 'sourceStartTime' | 'generatedItemName' | 'gainLinear'
        >;
      }),
    );

    const baseItemsUnsorted = (await Promise.all(baseItemsPromises)).filter(
      (item): item is NonNullable<typeof item> => item !== null,
    );

    if (baseItemsUnsorted.length === 0) {
      throw new Error('当前项目中没有可导出的对白音频。');
    }

    baseItemsUnsorted.sort((a, b) =>
      a.chapterIndex !== b.chapterIndex
        ? a.chapterIndex - b.chapterIndex
        : a.lineIndexInChapter - b.lineIndexInChapter,
    );

    let mainTimelineTime =
      silenceSettings.startPadding && silenceSettings.startPadding > 0
        ? silenceSettings.startPadding
        : 0;
    let sourceTimelineTime = 0;
    const finalTimelineItems: TimelineItem[] = [];

    for (const [index, item] of baseItemsUnsorted.entries()) {
      const chapterNumStr = item.chapterIndex.toString().padStart(3, '0');
      const characterName = sanitizeFilename(item.character?.name || '未知', 20);
      const lineNumStr = (index + 1).toString().padStart(4, '0');
      const abridgedText = sanitizeFilename(item.line.text || '', 30);
      const generatedItemName = `Ch${chapterNumStr}_${lineNumStr}_${characterName}_${abridgedText}`;

      finalTimelineItems.push({
        ...item,
        mainTimelineStartTime: mainTimelineTime,
        sourceStartTime: sourceTimelineTime,
        generatedItemName,
      });

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

    const totalSamples = finalTimelineItems.reduce(
      (sum, item) => sum + item.audioBuffer.length,
      0,
    );
    if (totalSamples === 0) {
      throw new Error('对白音频总长度为 0，无法导出。');
    }

    // 双声道导出
    const offlineCtx = new OfflineAudioContext(2, totalSamples, audioContext.sampleRate);
    finalTimelineItems.forEach((item) => {
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

    // Optional LUFS normalization for voice (对白/旁白)
    if (lufsSettings.voice.enabled) {
      for (const item of finalTimelineItems) {
        const measuredLufs = estimateLufsFromAudioBuffer(item.audioBuffer);
        const gainDb = computeGainDbFromLufs(measuredLufs, lufsSettings.voice.target);
        const gainLinear = Math.pow(10, gainDb / 20);
        item.gainLinear = gainLinear;
      }
    }

    // Step 1b: Build scene mapping for dialogue
    const lineIdToSceneName = buildLineIdToSceneName(project);

    // Dialogue tracks grouped by final Reaper track name
    const dialogueTracksByName = new Map<string, TimelineItem[]>();
    const addDialogueItem = (trackName: string, item: TimelineItem) => {
      const existing = dialogueTracksByName.get(trackName);
      if (existing) {
        existing.push(item);
      } else {
        dialogueTracksByName.set(trackName, [item]);
      }
    };

    finalTimelineItems.forEach((item) => {
      const lineType = getLineType(item.line, allCharacters);
      const soundTypeRaw = item.line.soundType || '';
      const soundType = soundTypeRaw.trim();

      if (lineType === 'narration') {
        addDialogueItem('旁白 PB', item);
        return;
      }

      if (soundType) {
        const trackName = `对白 - ${soundType}`;
        addDialogueItem(trackName, item);
        return;
      }

      const sceneName = lineIdToSceneName.get(item.line.id) || '默认场景';
      const trackName = `对白 - ${sceneName}`;
      addDialogueItem(trackName, item);
    });

    const dialogueTrackItemsStrings: Record<string, string> = {};
    dialogueTracksByName.forEach((items, trackName) => {
      if (!items || items.length === 0) return;
      dialogueTrackItemsStrings[trackName] = generateDialogueRppTrackItems(
        items,
        singleAudioFilename,
      );
    });

    // Step 2: SFX and BGM Processing
    const sfxClipsByTrack = new Map<string, FxClip[]>();
    const bgmClipsByTrack = new Map<string, BgmClip[]>();
    const subprojectClipsByTrack = new Map<string, SubprojectClip[]>();
    const usedSoundFiles = new Map<number, { blob: Blob; path: string }>();
    const missingSoundFiles: Array<{ id: number; name: string; category: string; reason: string }> = [];
    const missingSoundIds = new Set<number>();

    const recordMissingSoundFile = (sound: SoundLibraryItem, reason: string) => {
      if (sound.id === undefined) return;
      if (missingSoundIds.has(sound.id)) return;
      missingSoundIds.add(sound.id);
      missingSoundFiles.push({
        id: sound.id,
        name: sound.name,
        category: sound.category,
        reason,
      });
    };

    const lineStartTimes = new Map<string, number>(
      finalTimelineItems.map((item) => [item.line.id, item.mainTimelineStartTime]),
    );
    const lineDurations = new Map<string, number>(
      finalTimelineItems.map((item) => [item.line.id, item.duration]),
    );

    const soundLibraryById = new Map<number, SoundLibraryItem>();
    for (const s of soundLibrary) {
      if (typeof s.id === 'number') {
        soundLibraryById.set(s.id, s);
      }
    }

    const soundLufsById = new Map<number, number>();

    const ensureAudioForSound = async (
      sound: SoundLibraryItem,
    ): Promise<{ path: string; duration: number }> => {
      if (sound.id === undefined) {
        throw new Error('SoundLibraryItem 缺少 id，无法导出到 Reaper');
      }
      const existing = usedSoundFiles.get(sound.id);
      if (existing) {
        return { path: existing.path, duration: sound.duration };
      }

      let file: File;
      try {
        if (!hasSoundLibraryPermission) {
          throw new Error('Missing read permission for sound library roots');
        }
        file = await soundLibraryRepository.getSoundFile(sound, {
          requestPermission: false,
          allowRootResolve: true,
        });
      } catch (err) {
        const name = err instanceof Error ? err.name : '';
        if (name === 'NotFoundError') {
          throw new Error(
            `找不到音效库文件（可能已被移动/删除）：${sound.name}（id=${sound.id}）。请在“音效库”面板点击“更新”重新扫描，或重新关联根目录后再导出。`,
          );
        }
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `读取音效库文件失败：${sound.name}（id=${sound.id}）。${message}`,
        );
      }
      const arrayBuffer = await file.arrayBuffer();
      const decoded = await audioContext.decodeAudioData(arrayBuffer);

      const outputBlob =
        audioFormat === 'mp3'
          ? (() => {
              const ext = (file.name || '').split('.').pop()?.toLowerCase();
              if (ext === 'mp3') return file;
              return bufferToMp3(decoded, { bitrateKbps: options?.mp3BitrateKbps });
            })()
          : bufferToWav(decoded);

      if (lufsSettings.music.enabled || lufsSettings.ambience.enabled || lufsSettings.sfx.enabled) {
        try {
          const lufs = await ensureSoundLufsFromBuffer(sound.id, decoded);
          soundLufsById.set(sound.id, lufs);
        } catch (error) {
          console.error('Failed to analyze LUFS for sound during Reaper export:', error);
        }
      }

      const baseName = sanitizeFilename(sound.name).replace(/\.[^.]+$/, '');
      const outputName = `${baseName || 'sound'}_${sound.id}.${audioFormat === 'mp3' ? 'mp3' : 'wav'}`;

      usedSoundFiles.set(sound.id, { blob: outputBlob, path: outputName });
      return { path: outputName, duration: sound.duration || decoded.duration };
    };

    // 2a. 从钉住的 SFX 生成音效片段（[] 里的音效）
    for (const chapter of project.chapters) {
      for (const line of chapter.scriptLines) {
        const pins = line.pinnedSounds;
        if (!pins || pins.length === 0) continue;

        const lineStartTime = lineStartTimes.get(line.id);
        if (lineStartTime === undefined) continue;

        const lineDuration = lineDurations.get(line.id) || 0.0001;
        const text = line.text || '';
        const textLength = text.length || 1;

        for (const pin of pins) {
          if (pin.soundId === undefined || pin.soundId === null) continue;
          const sound = soundLibraryById.get(pin.soundId);
          if (!sound) continue;

          const isBgmKeyword = pin.keyword.startsWith('<') && pin.keyword.endsWith('>');
          // BGM 钉住只用来选音乐，不直接生成片段；这里只处理 SFX。
          if (isBgmKeyword) continue;

          let wavInfo: { path: string; duration: number };
          try {
            wavInfo = await ensureAudioForSound(sound);
          } catch (e) {
            const reason = e instanceof Error ? e.message : String(e);
            recordMissingSoundFile(sound, reason);
            continue;
          }
          const { path, duration } = wavInfo;
          const timeOffset = (pin.index / textLength) * lineDuration;
          const startTime = lineStartTime + timeOffset;

          const fileName = getSoundFileNameFromSoundName(sound.name) ?? sound.name;
          const labelName = fileName;
          const trackName = getSoundTrackNameByFolder(sound);

          let gainLinear: number | undefined;
          if (sound.id !== undefined) {
            const measuredLufs = soundLufsById.get(sound.id);
            if (typeof measuredLufs === 'number') {
              const category = (sound.category || '').toLowerCase();
              const isAmbienceCategory = category.includes('ambience');
              if (!isAmbienceCategory && lufsSettings.sfx.enabled) {
                const gainDb = computeGainDbFromLufs(measuredLufs, lufsSettings.sfx.target);
                gainLinear = Math.pow(10, gainDb / 20);
              }
            }
          }

          const existing = sfxClipsByTrack.get(trackName) || [];
          existing.push({
            startTime,
            duration,
            name: labelName,
            filePath: path,
            gainLinear,
          });
          sfxClipsByTrack.set(trackName, existing);
        }
      }
    }

    // 2a-2. 从“音效组”插入点生成音效片段：
    // - expanded: 展开为多条音效
    // - reaperSubproject: 写入 RPP_PROJECT（绝对路径引用）
    const soundGroupsById = new Map<string, SoundGroup>();
    (project.soundGroups || []).forEach((g) => {
      if (g && g.id) soundGroupsById.set(g.id, g);
    });

    const soundLibraryByName = new Map<string, SoundLibraryItem>();
    for (const s of soundLibrary) {
      if (s && typeof s.name === 'string') {
        soundLibraryByName.set(s.name, s);
      }
    }

    const lineByIdForGroups = new Map<string, ScriptLine>();
    for (const chapter of project.chapters) {
      for (const line of chapter.scriptLines) {
        lineByIdForGroups.set(line.id, line);
      }
    }

    const sfxGroupMarkers = (project.textMarkers || []).filter(
      (m) => m.type === 'sfxGroup' && !!m.groupId && !!m.startLineId,
    );

    const sfxGroupSubprojectTrackName = 'SFX Group Subprojects';

    for (const marker of sfxGroupMarkers) {
      const groupId = (marker.groupId || '').trim();
      if (!groupId) continue;
      const group = soundGroupsById.get(groupId);
      if (!group) continue;

      const lineStartTime = lineStartTimes.get(marker.startLineId);
      if (lineStartTime === undefined) continue;

      const lineDuration = lineDurations.get(marker.startLineId) || 0.0001;
      const line = lineByIdForGroups.get(marker.startLineId);
      if (!line) continue;
      const text = line.text || '';
      const textLength = text.length || 1;
      const rel = Math.max(0, Math.min(1, (marker.startOffset ?? 0) / textLength));
      const anchorTime = lineStartTime + rel * lineDuration;

      const kind = (group.kind || 'expanded') as NonNullable<SoundGroup['kind']> | 'expanded';
      if (kind === 'reaperSubproject') {
        const displayName = ((marker.name || group.name || '音效组') as string).trim() || '音效组';
        const reaperFileName = (group.reaperFileName || `${group.name}.rpp`).trim();
        if (!reaperFileName) continue;
        const duration =
          typeof group.durationSeconds === 'number' && isFinite(group.durationSeconds)
            ? Math.max(0.05, group.durationSeconds)
            : 1;

        const filePath = joinWindowsPath(sfxGroupLibraryBasePath, reaperFileName);
        const existing = subprojectClipsByTrack.get(sfxGroupSubprojectTrackName) || [];
        existing.push({
          startTime: Math.max(0, anchorTime),
          duration,
          name: `SFX Group: ${displayName}`,
          filePath,
        });
        subprojectClipsByTrack.set(sfxGroupSubprojectTrackName, existing);
        continue;
      }

      if (!group.clips || group.clips.length === 0) continue;

      for (let i = 0; i < group.clips.length; i++) {
        const clip = group.clips[i];
        const soundId = typeof clip.soundId === 'number' ? clip.soundId : undefined;
        const soundName = typeof clip.soundName === 'string' ? clip.soundName : undefined;

        const sound =
          (soundId !== undefined ? soundLibraryById.get(soundId) : undefined) ||
          (soundName ? soundLibraryByName.get(soundName) : undefined);
        if (!sound) continue;

        let wavInfo: { path: string; duration: number };
        try {
          wavInfo = await ensureAudioForSound(sound);
        } catch (e) {
          const reason = e instanceof Error ? e.message : String(e);
          recordMissingSoundFile(sound, reason);
          continue;
        }
        const { path, duration } = wavInfo;

        const baseStart = anchorTime + (Number.isFinite(clip.offsetSeconds) ? clip.offsetSeconds : 0);
        const startTime = Math.max(0, baseStart);

        const fileName = getSoundFileNameFromSoundName(sound.name) ?? sound.name;
        const labelName = fileName;
        const trackName = getSoundTrackNameByFolder(sound);

        let gainLinear: number | undefined;
        if (sound.id !== undefined) {
          const measuredLufs = soundLufsById.get(sound.id);
          if (typeof measuredLufs === 'number') {
            const category = (sound.category || '').toLowerCase();
            const isAmbienceCategory = category.includes('ambience');
            const isMusicCategory = category.startsWith('music');

            if (isAmbienceCategory && lufsSettings.ambience.enabled) {
              const gainDb = computeGainDbFromLufs(measuredLufs, lufsSettings.ambience.target);
              gainLinear = Math.pow(10, gainDb / 20);
            } else if (isMusicCategory && lufsSettings.music.enabled) {
              const gainDb = computeGainDbFromLufs(measuredLufs, lufsSettings.music.target);
              gainLinear = Math.pow(10, gainDb / 20);
            } else if (!isAmbienceCategory && !isMusicCategory && lufsSettings.sfx.enabled) {
              const gainDb = computeGainDbFromLufs(measuredLufs, lufsSettings.sfx.target);
              gainLinear = Math.pow(10, gainDb / 20);
            }
          }
        }

        // Optional additional gain from group definition
        if (typeof clip.gainDb === 'number' && isFinite(clip.gainDb)) {
          const extra = Math.pow(10, clip.gainDb / 20);
          gainLinear = typeof gainLinear === 'number' ? gainLinear * extra : extra;
        }

        const category = (sound.category || '').toLowerCase();
        const isAmbienceCategory = category.includes('ambience');
        const isMusicCategory = category.startsWith('music');

        if (isAmbienceCategory || isMusicCategory) {
          const existing = bgmClipsByTrack.get(trackName) || [];
          existing.push({
            startTime,
            duration,
            name: labelName,
            filePath: path,
            sourceDuration: duration,
            gainLinear,
          });
          bgmClipsByTrack.set(trackName, existing);
        } else {
          const existing = sfxClipsByTrack.get(trackName) || [];
          existing.push({
            startTime,
            duration,
            name: labelName,
            filePath: path,
            gainLinear,
          });
          sfxClipsByTrack.set(trackName, existing);
        }
      }
    }

    // 2b. 从 BGM 文本范围 (<BGM> ... //) 生成 BGM 片段
    const lineById = new Map<string, ScriptLine>();
    for (const chapter of project.chapters) {
      for (const line of chapter.scriptLines) {
        lineById.set(line.id, line);
      }
    }

    const bgmMarkers = (project.textMarkers || []).filter(
      (m) => m.type === 'bgm' && m.startLineId && m.endLineId,
    );

    const findBgmSoundForMarker = (marker: TextMarker): SoundLibraryItem | undefined => {
      const name = (marker.name || '').trim();
      if (!name) return undefined;
      const expectedKeyword = `<${name}>`;

      // 1) 优先从钉住的 BGM 里找对应的声音
      for (const chapter of project.chapters) {
        for (const line of chapter.scriptLines) {
          const pins = line.pinnedSounds || [];
          const match = pins.find(
            (p) => p.keyword === expectedKeyword && p.soundId !== undefined && p.soundId !== null,
          );
          if (match && match.soundId !== undefined && match.soundId !== null) {
            const snd = soundLibraryById.get(match.soundId);
            if (snd) return snd;
          }
        }
      }

      // 2) 回退：按名称在音乐/环境库里模糊匹配
      const lowerName = name.toLowerCase();
      const musicCandidates = soundLibrary.filter((s) => {
        const cat = (s.category || '').toLowerCase();
        const isMusicLike = cat.includes('music') || cat.includes('ambience');
        return isMusicLike && s.name.toLowerCase().includes(lowerName);
      });
      if (musicCandidates.length > 0) {
        return musicCandidates[0];
      }

      return undefined;
    };

    for (const marker of bgmMarkers) {
      const startLine = lineById.get(marker.startLineId);
      const endLine = lineById.get(marker.endLineId);
      if (!startLine || !endLine) continue;

      const startLineTime = lineStartTimes.get(marker.startLineId);
      const endLineTime = lineStartTimes.get(marker.endLineId);
      const startLineDur = lineDurations.get(marker.startLineId) || 0;
      const endLineDur = lineDurations.get(marker.endLineId) || 0;

      if (startLineTime === undefined || endLineTime === undefined) continue;

      const startText = startLine.text || '';
      const endText = endLine.text || '';
      const startTextLen = startText.length || 1;
      const endTextLen = endText.length || 1;

      const startOffset = marker.startOffset ?? 0;
      const endOffset = marker.endOffset ?? 0;

      const startRel = Math.max(0, Math.min(1, startOffset / startTextLen));
      const endRel = Math.max(0, Math.min(1, endOffset / endTextLen));

      const startTime = startLineTime + startRel * startLineDur;
      const endTime = endLineTime + endRel * endLineDur;

      if (!isFinite(startTime) || !isFinite(endTime)) continue;
      const rangeDuration = endTime - startTime;
      if (rangeDuration <= 0.05) continue;

      const sound = findBgmSoundForMarker(marker);
      if (!sound) {
        // 没有绑定具体音乐，就跳过；将来如有需要，也可以插入占位 item
        continue;
      }

      let wavInfo: { path: string; duration: number };
      try {
        wavInfo = await ensureAudioForSound(sound);
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        recordMissingSoundFile(sound, reason);
        continue;
      }
      const { path, duration: sourceDuration } = wavInfo;

      let gainLinear: number | undefined;
      if (sound.id !== undefined) {
        const measuredLufs = soundLufsById.get(sound.id);
        if (typeof measuredLufs === 'number') {
          const category = (sound.category || '').toLowerCase();
          const isAmbienceCategory = category.includes('ambience');
          if (isAmbienceCategory && lufsSettings.ambience.enabled) {
            const gainDb = computeGainDbFromLufs(measuredLufs, lufsSettings.ambience.target);
            gainLinear = Math.pow(10, gainDb / 20);
          } else if (!isAmbienceCategory && lufsSettings.music.enabled) {
            const gainDb = computeGainDbFromLufs(measuredLufs, lufsSettings.music.target);
            gainLinear = Math.pow(10, gainDb / 20);
          }
        }
      }

      const trackName = getSoundTrackNameByFolder(sound);
      const existing = bgmClipsByTrack.get(trackName) || [];
      const fileName = getSoundFileNameFromSoundName(sound.name) ?? sound.name;
      existing.push({
        startTime,
        duration: rangeDuration,
        name: fileName,
        filePath: path,
        sourceDuration,
        gainLinear,
      });
      bgmClipsByTrack.set(trackName, existing);
    }

    // 2c. 从场景标记生成子工程占位片段（RPP_PROJECT 引用）
    const sceneMarkers = (project.textMarkers || []).filter(
      (m) => m.type === 'scene' && m.startLineId && m.endLineId,
    );

    const subprojectTrackName = 'Scene Subprojects';

    for (const marker of sceneMarkers) {
      const sceneNameRaw = (marker.name || '').trim();
      if (!sceneNameRaw) continue;

      const startLine = lineById.get(marker.startLineId);
      const endLine = lineById.get(marker.endLineId);
      if (!startLine || !endLine) continue;

      const startLineTime = lineStartTimes.get(marker.startLineId);
      const endLineTime = lineStartTimes.get(marker.endLineId);
      const startLineDur = lineDurations.get(marker.startLineId) || 0;
      const endLineDur = lineDurations.get(marker.endLineId) || 0;

      if (startLineTime === undefined || endLineTime === undefined) continue;

      const startText = startLine.text || '';
      const endText = endLine.text || '';
      const startTextLen = startText.length || 1;
      const endTextLen = endText.length || 1;

      const startOffset = marker.startOffset ?? 0;
      const endOffset = marker.endOffset ?? 0;

      const startRel = Math.max(0, Math.min(1, startOffset / startTextLen));
      const endRel = Math.max(0, Math.min(1, endOffset / endTextLen));

      const startTime = startLineTime + startRel * startLineDur;
      const endTime = endLineTime + endRel * endLineDur;

      if (!isFinite(startTime) || !isFinite(endTime)) continue;
      const rangeDuration = endTime - startTime;
      if (rangeDuration <= 0.05) continue;

      const sceneDisplayName = sceneNameRaw;
      const sceneFileBase = sanitizeFilename(sceneNameRaw).replace(/\.[^.]+$/, '') || 'scene';
      // 约定: 子工程路径 = 基础库目录 \ 场景文件夹名 \ 同名 .rpp
      const sceneFilePath = `${sfxGroupLibraryBasePath}\\${sceneFileBase}\\${sceneFileBase}.rpp`;

      const existing = subprojectClipsByTrack.get(subprojectTrackName) || [];
      existing.push({
        startTime,
        duration: rangeDuration,
        name: `Scene: ${sceneDisplayName}`,
        filePath: sceneFilePath,
      });
      subprojectClipsByTrack.set(subprojectTrackName, existing);
    }

    // Step 3: Generate RPP content with all tracks
    const sfxTrackItemsByName: Record<string, string> = {};
    sfxClipsByTrack.forEach((clips, trackName) => {
      if (!clips || clips.length === 0) return;
      sfxTrackItemsByName[trackName] = generateSfxRppTrackItems(clips);
    });

    const bgmTrackItemsByName: Record<string, string> = {};
    bgmClipsByTrack.forEach((clips, trackName) => {
      if (!clips || clips.length === 0) return;
      bgmTrackItemsByName[trackName] = generateBgmRppTrackItems(clips);
    });

    const subprojectTrackItemsByName: Record<string, string> = {};
    subprojectClipsByTrack.forEach((clips, trackName) => {
      if (!clips || clips.length === 0) return;
      subprojectTrackItemsByName[trackName] = generateSubprojectRppTrackItems(clips);
    });

    // Add all converted SFX/BGM audio files into the ZIP
    usedSoundFiles.forEach(({ blob, path }) => {
      zip.file(path, blob);
    });

    const rppContent = generateRppContent(
      project.name,
      audioContext.sampleRate,
      dialogueTrackItemsStrings,
      sfxTrackItemsByName,
      bgmTrackItemsByName,
      subprojectTrackItemsByName,
    );

    // Step 4: Create ZIP
    const missingSoundSection = (() => {
      if (missingSoundFiles.length === 0) return '';
      const lines = missingSoundFiles
        .map((m) => `- id=${m.id} | ${m.category} | ${m.name} | ${m.reason}`)
        .join('\n');
      return `\n\n注意：导出过程中有部分音效/BGM 文件无法读取，已跳过相关片段。\n${lines}\n`;
    })();

    const sfxGroupLibraryNote = configuredSfxGroupLibraryBasePath
      ? `音效组库绝对路径（来自应用设置）：${sfxGroupLibraryBasePath}`
      : `音效组库绝对路径（当前未设置，使用默认值）：${sfxGroupLibraryBasePath}\n建议：在“后期制作 -> 插入音效组”里设置正确路径。`;

    const readme = `本 ZIP 由 AI 后期制作页面自动导出为 Reaper 工程。

包含内容:
- *.${audioFormat === 'mp3' ? 'mp3' : 'wav'}: 所有对白、环境音、音效、音乐素材
- project.rpp: 主 Reaper 工程文件
- （可选）引用型音效组/场景子工程：通过 RPP_PROJECT 绝对路径引用（不在 zip 内）

使用建议:
1. 将整个 .zip 解压到一个独立文件夹
2. ${sfxGroupLibraryNote}
   - 引用型音效组命名：组名.rpp + 组名_preview.wav（preview 可选）
   - 场景子工程命名（如使用）：场景名\\场景名.rpp
3. 使用 Reaper 打开 project.rpp
4. 如 Reaper 提示找不到子工程或素材，可在 Reaper 中批量重定位媒体文件（RPP_PROJECT 引用为绝对路径，换电脑/换盘符可能需要重定位）
${audioFormat === 'mp3' ? '\n注意：MP3 为有损压缩，且不同软件对 MP3 的编码延迟处理可能略有差异。如需最精准的样本级对齐与后期处理，建议改用 WAV 导出。' : ''}${missingSoundSection}`;

    zip.file('project.rpp', rppContent);
    zip.file('README.txt', readme);

    const blob = await zip.generateAsync({ type: 'blob' });

    if (missingSoundFiles.length > 0) {
      alert(
        `导出已完成，但有 ${missingSoundFiles.length} 个音效/BGM 文件无法读取，已跳过相关片段。详情见 README.txt。`,
      );
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeFilename(project.name)}_ReaperExport.zip`;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    audioContext.close().catch(() => {});
  }
};
