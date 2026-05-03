import React from 'react';
import { db } from '../../../db';
import { bufferToWav } from '../../../lib/wavEncoder';
import { normalizeCharacterNameKey } from '../../../lib/characterName';
import { Character, Chapter, MasterAudio, Project } from '../../../types';
import mammoth from 'mammoth';

type AsrSegment = { start: number; end: number; text: string };

type TimestampCue = { start: number; text: string };

type NormalizedText = {
  raw: string;
  norm: string;
  bigrams: Map<string, number>;
};

type AlignmentOp =
  | { kind: 'match'; lineIndex: number; unitIndex: number; sim: number }
  | { kind: 'skipLine'; lineIndex: number }
  | { kind: 'skipUnit'; unitIndex: number };

const NON_AUDIO_ROLE_NAME_KEYS = new Set(['[静音]', '静音', '音效', '[音效]', 'sfx'].map(normalizeCharacterNameKey));

const normalizeForMatch = (text: string): string => {
  return (text || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    // Strip common punctuation/symbols (keep CJK, digits, Latin)
    .replace(/[“”"'\u2018\u2019\u201C\u201D]/g, '')
    .replace(/[，,。．.！？!?：:；;、】【\[\]（）(){}《》<>…—\-~·•]/g, '')
    .trim();
};

const buildBigrams = (s: string): Map<string, number> => {
  const map = new Map<string, number>();
  if (!s) return map;
  if (s.length === 1) {
    map.set(s, 1);
    return map;
  }
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    map.set(g, (map.get(g) || 0) + 1);
  }
  return map;
};

const prepareText = (raw: string): NormalizedText => {
  const norm = normalizeForMatch(raw);
  return { raw, norm, bigrams: buildBigrams(norm) };
};

const diceSimilarity = (a: NormalizedText, b: NormalizedText): number => {
  const aLen = a.norm.length;
  const bLen = b.norm.length;
  if (aLen === 0 || bLen === 0) return 0;
  if (aLen <= 2 || bLen <= 2) return a.norm === b.norm ? 1 : 0;

  const totalA = Math.max(1, aLen - 1);
  const totalB = Math.max(1, bLen - 1);
  const [small, large] = a.bigrams.size <= b.bigrams.size ? [a.bigrams, b.bigrams] : [b.bigrams, a.bigrams];

  let inter = 0;
  for (const [g, countSmall] of small) {
    const countLarge = large.get(g);
    if (countLarge) inter += Math.min(countSmall, countLarge);
  }
  const dice = (2 * inter) / (totalA + totalB);

  const lenRatio = Math.min(aLen, bLen) / Math.max(aLen, bLen);
  return dice * Math.sqrt(lenRatio);
};

const isGoodMatch = (sim: number, lineLen: number, unitLen: number): boolean => {
  const minLen = Math.min(lineLen, unitLen);
  if (minLen <= 2) return sim >= 0.95;
  if (minLen <= 6) return sim >= 0.6;
  return sim >= 0.35;
};

const splitTextToUnits = (segments: AsrSegment[]): Array<{ start: number; end: number; text: string }> => {
  const PUNCT_HARD = new Set(['。', '！', '？', '.', '!', '?', '…']);
  const PUNCT_SOFT = new Set(['，', ',', '；', ';', '：', ':']);
  const MAX_SOFT_SPLIT_LEN = 40;

  const out: Array<{ start: number; end: number; text: string }> = [];

  for (const seg of segments) {
    const raw = (seg.text || '').trim();
    if (!raw) continue;

    const hardParts: string[] = [];
    let buf = '';
    for (const ch of raw) {
      buf += ch;
      if (PUNCT_HARD.has(ch)) {
        const part = buf.trim();
        if (part) hardParts.push(part);
        buf = '';
      }
    }
    const tail = buf.trim();
    if (tail) hardParts.push(tail);

    const parts: string[] = [];
    for (const p of hardParts.length > 0 ? hardParts : [raw]) {
      const normLen = normalizeForMatch(p).length;
      if (normLen > MAX_SOFT_SPLIT_LEN) {
        let sbuf = '';
        for (const ch of p) {
          sbuf += ch;
          if (PUNCT_SOFT.has(ch)) {
            const sp = sbuf.trim();
            if (sp) parts.push(sp);
            sbuf = '';
          }
        }
        const stail = sbuf.trim();
        if (stail) parts.push(stail);
      } else {
        parts.push(p);
      }
    }

    const segDur = Math.max(0, seg.end - seg.start);
    const partLens = parts.map((p) => Math.max(1, normalizeForMatch(p).length));
    const totalLen = partLens.reduce((a, b) => a + b, 0);
    let cursor = seg.start;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const ratio = totalLen > 0 ? partLens[i] / totalLen : 1 / parts.length;
      const partStart = cursor;
      const partEnd = i === parts.length - 1 ? seg.end : cursor + segDur * ratio;
      cursor = partEnd;
      out.push({ start: partStart, end: partEnd, text: part });
    }
  }

  return out;
};

const alignLinesToUnits = (
  lines: NormalizedText[],
  units: NormalizedText[],
): { ops: AlignmentOp[]; unitToLine: Array<number | null> } => {
  const n = lines.length;
  const m = units.length;

  const MATCH_WEIGHT = 6;
  const BASELINE = 0.35;
  const GAP_LINE = 1.0;
  const GAP_UNIT = 0.7;

  const dp: Float64Array[] = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const dir: Uint8Array[] = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));

  for (let i = 1; i <= n; i++) {
    dp[i][0] = dp[i - 1][0] - GAP_LINE;
    dir[i][0] = 1; // skipLine
  }
  for (let j = 1; j <= m; j++) {
    dp[0][j] = dp[0][j - 1] - GAP_UNIT;
    dir[0][j] = 2; // skipUnit
  }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sim = diceSimilarity(lines[i - 1], units[j - 1]);
      const matchScore = (sim - BASELINE) * MATCH_WEIGHT;
      const scoreMatch = dp[i - 1][j - 1] + matchScore;
      const scoreSkipLine = dp[i - 1][j] - GAP_LINE;
      const scoreSkipUnit = dp[i][j - 1] - GAP_UNIT;

      let best = scoreMatch;
      let bestDir = 0;
      if (scoreSkipLine > best) {
        best = scoreSkipLine;
        bestDir = 1;
      }
      if (scoreSkipUnit > best) {
        best = scoreSkipUnit;
        bestDir = 2;
      }

      dp[i][j] = best;
      dir[i][j] = bestDir;
    }
  }

  const ops: AlignmentOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const d = dir[i][j];
    if (i > 0 && j > 0 && d === 0) {
      const sim = diceSimilarity(lines[i - 1], units[j - 1]);
      ops.push({ kind: 'match', lineIndex: i - 1, unitIndex: j - 1, sim });
      i--;
      j--;
    } else if (i > 0 && (j === 0 || d === 1)) {
      ops.push({ kind: 'skipLine', lineIndex: i - 1 });
      i--;
    } else {
      ops.push({ kind: 'skipUnit', unitIndex: j - 1 });
      j--;
    }
  }
  ops.reverse();

  const unitToLine: Array<number | null> = Array.from({ length: m }, () => null);
  for (const op of ops) {
    if (op.kind !== 'match') continue;
    const line = lines[op.lineIndex];
    const unit = units[op.unitIndex];
    if (isGoodMatch(op.sim, line.norm.length, unit.norm.length)) {
      unitToLine[op.unitIndex] = op.lineIndex;
    }
  }

  return { ops, unitToLine };
};

const parseHmsToSeconds = (value: string): number | null => {
  const s = (value || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const ss = parseInt(m[3], 10);
  const ms = m[4] ? parseInt(m[4].padEnd(3, '0'), 10) : 0;
  if (![hh, mm, ss, ms].every(Number.isFinite)) return null;
  return hh * 3600 + mm * 60 + ss + ms / 1000;
};

const normalizeCuesMonotonic = (cues: TimestampCue[]): TimestampCue[] => {
  const EPS = 0.01; // 10ms，避免同秒时间戳导致 start 不递增
  const out = cues
    .map((c) => ({ start: c.start, text: c.text }))
    .filter((c) => Number.isFinite(c.start) && c.text.trim().length > 0)
    .sort((a, b) => a.start - b.start || 0);

  // 保持单调递增，避免后续 end<=start 被过滤
  for (let i = 1; i < out.length; i++) {
    if (out[i].start <= out[i - 1].start) {
      out[i].start = out[i - 1].start + EPS;
    }
  }
  return out;
};

const parseTimestampedLines = (rawText: string): TimestampCue[] => {
  const lines = (rawText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const cues: TimestampCue[] = [];
  for (const line of lines) {
    // 常见格式：
    // 1号讲话人  00:00:01欢迎收听...
    // 00:00:01 欢迎收听...
    const mSpeaker = line.match(/^(.+?)\s+(\d{1,2}:\d{2}:\d{2}(?:\.\d{1,3})?)\s*(.*)$/);
    const mBare = line.match(/^(\d{1,2}:\d{2}:\d{2}(?:\.\d{1,3})?)\s*(.*)$/);
    const ts = mSpeaker?.[2] || mBare?.[1];
    const text = (mSpeaker?.[3] || mBare?.[2] || '').trim();
    if (!ts || !text) continue;
    const start = parseHmsToSeconds(ts);
    if (start === null) continue;
    cues.push({ start, text });
  }

  return normalizeCuesMonotonic(cues);
};

const parseTimestampedDocx = async (file: File): Promise<TimestampCue[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return parseTimestampedLines(result.value || '');
};

const parseTimestampedTxt = async (file: File): Promise<TimestampCue[]> => {
  const text = await file.text();
  return parseTimestampedLines(text);
};

const cuesToSegments = (cues: TimestampCue[], fullDuration: number): AsrSegment[] => {
  const out: AsrSegment[] = [];
  if (!cues || cues.length === 0) return out;

  for (let i = 0; i < cues.length; i++) {
    const start = Math.max(0, Math.min(fullDuration, cues[i].start));
    const nextStart = i < cues.length - 1 ? cues[i + 1].start : fullDuration;
    const end = Math.max(start, Math.min(fullDuration, nextStart));
    if (end <= start) continue;
    out.push({ start, end, text: cues[i].text });
  }

  return out;
};

const extractChapterNumberFromFilename = (fileName: string): number | null => {
  const base = fileName.includes('.') ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName;
  const firstPart = base.split('_')[0] || base;
  const match = firstPart.match(/\d+/);
  if (!match) return null;
  const n = parseInt(match[0], 10);
  return Number.isFinite(n) ? n : null;
};

const getChapterBySelectionOrFilename = (
  currentProject: Project,
  selectedChapterId: string | null,
  fileName: string,
): Chapter | null => {
  if (selectedChapterId) {
    const ch = currentProject.chapters.find((c) => c.id === selectedChapterId);
    if (ch) return ch;
  }
  const num = extractChapterNumberFromFilename(fileName);
  if (!num) return null;
  const idx = num - 1;
  return idx >= 0 && idx < currentProject.chapters.length ? currentProject.chapters[idx] : null;
};

export const useAsrAutoAligner = (args: {
  currentProject: Project | undefined;
  selectedChapterId: string | null;
  characters: Character[];
  assignAudioToLine: (
    projectId: string,
    chapterId: string,
    lineId: string,
    audioBlob: Blob,
    sourceAudioId?: string,
    sourceAudioFilename?: string,
  ) => Promise<void>;
}) => {
  const { currentProject, selectedChapterId, characters, assignAudioToLine } = args;
  const [isAsrAlignLoading, setIsAsrAlignLoading] = React.useState(false);

  // 支持两种方式：
  // 1) 选择“音频 + 带时间戳转写文档(.docx/.txt)”（网页也可用）
  // 2) 只选音频则会调用 Electron 的 Whisper 转写
  const isAsrSupported = true;

  const nonAudioCharacterIds = React.useMemo(() => {
    return characters
      .filter((c) => NON_AUDIO_ROLE_NAME_KEYS.has(normalizeCharacterNameKey(c.name)))
      .map((c) => c.id);
  }, [characters]);

  const handleFileSelectionForAsrAlign = React.useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files || files.length === 0) return;
    if (!currentProject) return;

    setIsAsrAlignLoading(true);
    try {
      const isAudioFile = (f: File) => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i.test(f.name);
      const isTranscriptFile = (f: File) => /\.(docx|txt)$/i.test(f.name);

      const audioFile = files.find(isAudioFile);
      const transcriptFile = files.find(isTranscriptFile);

      if (!audioFile) {
        throw new Error('请先选择音频文件（可同时选择带时间戳的转写文档 .docx/.txt）。');
      }

      const chapter = getChapterBySelectionOrFilename(currentProject, selectedChapterId, audioFile.name);
      if (!chapter) {
        throw new Error('无法确定目标章节：请先在左侧选择章节，或使用包含章节号的文件名（如 001_*.mp3）。');
      }

      const targetLines = chapter.scriptLines
        .map((line, idx) => ({ line, idx }))
        .filter(({ line }) => !nonAudioCharacterIds.includes(line.characterId || ''));

      if (targetLines.length === 0) {
        throw new Error('该章节没有可对轨的台词行（可能都是[静音]/[音效]）。');
      }

      let alignMode = transcriptFile ? '转写文档' : 'ASR（Whisper）';

      let parsedCues: TimestampCue[] = [];
      let asrSegments: AsrSegment[] = [];

      if (transcriptFile) {
        const lower = transcriptFile.name.toLowerCase();
        parsedCues = lower.endsWith('.docx') ? await parseTimestampedDocx(transcriptFile) : await parseTimestampedTxt(transcriptFile);
        if (parsedCues.length === 0) {
          throw new Error('转写文档中未解析到任何时间戳（需类似 00:00:01 开头的时间信息）。');
        }
      } else {
        if (
          !window.electronAPI?.asrTranscribeFasterWhisper &&
          !window.electronAPI?.asrTranscribeOpenAIWhisper &&
          !window.electronAPI?.asrTranscribeWhisperCpp
        ) {
          throw new Error('未检测到 Electron 助手：请同时选择“音频 + 带时间戳转写文档(.docx/.txt)”来对齐。');
        }

        const filePath = (audioFile as any).path as string | undefined;
        if (!filePath) {
          throw new Error('未获取到音频文件本地路径。若在网页中使用，请同时选择转写文档(.docx/.txt)。');
        }

        const asrRes = window.electronAPI.asrTranscribeFasterWhisper
          ? await window.electronAPI.asrTranscribeFasterWhisper({
              audioPath: filePath,
              language: 'zh',
              model: 'small',
              device: 'cuda',
              computeType: 'float16',
              beamSize: 1,
            })
          : window.electronAPI.asrTranscribeOpenAIWhisper
          ? await window.electronAPI.asrTranscribeOpenAIWhisper({
              audioPath: filePath,
              language: 'zh',
              model: 'medium',
            })
          : await window.electronAPI.asrTranscribeWhisperCpp!({
              audioPath: filePath,
              language: 'zh',
            });

        if (!asrRes?.success) {
          throw new Error(asrRes?.error || 'ASR 转写失败');
        }

        alignMode =
          asrRes.meta?.engine === 'faster-whisper'
            ? `AI辅助对轨（faster-whisper ${asrRes.meta.model || 'small'} / ${asrRes.meta.device || 'cuda'}，转写${asrRes.meta.durationMs ? ` ${(asrRes.meta.durationMs / 1000).toFixed(1)}秒` : ''}）`
            : asrRes.meta?.engine === 'openai-whisper'
            ? `ASR（openai-whisper ${asrRes.meta.model || ''}）`
            : 'ASR（whisper.cpp）';
        asrSegments = asrRes.segments || [];
        if (asrSegments.length === 0) {
          throw new Error('ASR 未返回任何可用片段');
        }
      }

      const sourceAudioId = `${currentProject.id}_${audioFile.name}`;

      // Clean up previous audio segments from the same source file.
      const oldBlobs = await db.audioBlobs.where('sourceAudioId').equals(sourceAudioId).toArray();
      if (oldBlobs.length > 0) {
        await db.audioBlobs.bulkDelete(oldBlobs.map((b) => b.id));
      }

      // Store master audio
      const masterAudioEntry: MasterAudio = { id: sourceAudioId, projectId: currentProject.id, data: audioFile };
      await db.masterAudios.put(masterAudioEntry);

      // Decode audio (for duration + slicing)
      let audioContext: AudioContext | null = null;
      try {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const mainAudioBuffer = await audioContext.decodeAudioData(await audioFile.arrayBuffer());
        const fullDuration = mainAudioBuffer.duration;

        if (transcriptFile) {
          asrSegments = cuesToSegments(parsedCues, fullDuration);
          if (asrSegments.length === 0) {
            throw new Error('转写文档时间戳无法生成有效片段（可能时间超出音频长度或格式异常）。');
          }
        }

        // Build ASR units (smaller than raw segments for better alignment)
        const unitsRaw = splitTextToUnits(asrSegments)
          .map((u) => ({
            start: Math.max(0, Math.min(fullDuration, u.start)),
            end: Math.max(0, Math.min(fullDuration, u.end)),
            text: u.text,
          }))
          .filter((u) => u.end > u.start && u.text.trim().length > 0);

        if (unitsRaw.length === 0) {
          throw new Error('ASR 片段无法用于对齐（可能是空文本）。');
        }

        const lineTexts = targetLines.map(({ line }) => prepareText(line.text));
        const unitTexts = unitsRaw.map((u) => prepareText(u.text));

        const { unitToLine } = alignLinesToUnits(lineTexts, unitTexts);

        // Create segments covering the whole audio, partitioned by matched units.
        const segmentsToAssign: Array<{ lineIndex: number; start: number; end: number }> = [];
        let currentLineIndex: number | null = null;
        let currentStart = 0;

        for (let ui = 0; ui < unitsRaw.length; ui++) {
          const li = unitToLine[ui];
          if (li === null || li === undefined) continue;
          const boundaryCandidate = Math.max(0, Math.min(fullDuration, unitsRaw[ui].start));
          const boundary = Math.max(currentStart, boundaryCandidate);
          if (currentLineIndex === null) {
            currentLineIndex = li;
            currentStart = boundaryCandidate;
            continue;
          }
          if (boundary > currentStart) {
            segmentsToAssign.push({ lineIndex: currentLineIndex, start: currentStart, end: boundary });
          }
          currentLineIndex = li;
          currentStart = boundary;
        }

        if (currentLineIndex !== null && fullDuration > currentStart) {
          segmentsToAssign.push({ lineIndex: currentLineIndex, start: currentStart, end: fullDuration });
        }

        // Deduplicate in case of weird alignment results (keep first occurrence in audio order)
        const seenLineIndexes = new Set<number>();
        const finalSegments = segmentsToAssign.filter((s) => {
          if (seenLineIndexes.has(s.lineIndex)) return false;
          seenLineIndexes.add(s.lineIndex);
          return true;
        });

        if (finalSegments.length === 0) {
          throw new Error('未能将 ASR 内容对齐到任何台词行（请检查录音内容或换更大的模型）。');
        }

        // Persist markers (end times of each segment except last)
        const markers = finalSegments
          .slice(0, -1)
          .map((s) => s.end)
          .filter((t) => t > 0 && t < fullDuration);
        await db.audioMarkers.put({ sourceAudioId, markers });

        // Slice + assign
        let matchedCount = 0;
        for (const seg of finalSegments) {
          const lineInfo = targetLines[seg.lineIndex];
          if (!lineInfo) continue;

          const startSample = Math.floor(seg.start * mainAudioBuffer.sampleRate);
          const endSample = Math.floor(seg.end * mainAudioBuffer.sampleRate);
          if (endSample <= startSample) continue;

          const segmentBuffer = audioContext.createBuffer(
            mainAudioBuffer.numberOfChannels,
            endSample - startSample,
            mainAudioBuffer.sampleRate,
          );

          for (let ch = 0; ch < mainAudioBuffer.numberOfChannels; ch++) {
            segmentBuffer.copyToChannel(
              mainAudioBuffer.getChannelData(ch).subarray(startSample, endSample),
              ch,
            );
          }

          const segmentBlob = bufferToWav(segmentBuffer);
          await assignAudioToLine(currentProject.id, chapter.id, lineInfo.line.id, segmentBlob, sourceAudioId, audioFile.name);
          matchedCount++;
        }

        const missingCount = targetLines.length - matchedCount;
        alert(
          `自动对齐完成（${alignMode}）：\n\n` +
            `章节：${chapter.title}\n` +
            `匹配：${matchedCount}/${targetLines.length} 句\n` +
            `漏句：${Math.max(0, missingCount)} 句\n\n` +
            `提示：你可以点任意一句的“校准音频标记”按钮做微调。`,
        );
      } finally {
        try {
          if (audioContext && audioContext.state !== 'closed') {
            await audioContext.close();
          }
        } catch (_) {}
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Auto align failed:', e);
      alert(`自动对齐失败：${msg}`);
    } finally {
      setIsAsrAlignLoading(false);
      if (event.target) event.target.value = '';
    }
  }, [currentProject, selectedChapterId, nonAudioCharacterIds, assignAudioToLine]);

  return {
    isAsrSupported,
    isAsrAlignLoading,
    handleFileSelectionForAsrAlign,
  };
};
