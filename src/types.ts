export interface Collaborator {
  id: string;
  username: string;
  role: 'reader' | 'editor';
}

export interface Character {
  id: string;
  name: string;
  projectId?: string; // To scope characters to a project
  color: string; // Character background: Tailwind color class (e.g., 'bg-blue-500') or hex code (e.g., '#3b82f6')
  textColor?: string; // Character text color: Tailwind color class or hex code
  cvName?: string;
  description?: string;
  profile?: CharacterProfile;
  cvBackgroundColor?: string; // CV background: Tailwind CSS class or hex code
  cvTextColor?: string;     // CV text color: Tailwind CSS class or hex code
  aiVoicePreset?: string; // Future use
  isStyleLockedToCv?: boolean; // If true, this character's style is individually locked and should not be changed by a CV-level "Unify Styles" action.
  status?: 'active' | 'merged'; // For soft deletion/merging
  mergedIntoCharacterId?: string; // If status is 'merged'
}

export interface CharacterProfile {
  age?: string;
  gender?: string;
  occupation?: string;
  personality?: string;
  voiceDirection?: string;
  relationships?: string;
  notes?: string;
}

export interface IgnoredSoundKeyword {
  keyword: string;
  index: number; // The character index of the keyword in the line.text
}

export interface PinnedSound {
  keyword: string;
  index: number; // The character index of the keyword in the line.text
  soundId: number;
  soundName: string;
}

export interface ScriptLine {
  id: string;
  text: string;
  originalText?: string; // To track if AI annotation changed it
  characterId?: string;
  audioBlobId?: string; // Path to AI-generated audio
  isNoAudio?: boolean; // @deprecated Use [静音]/[音效] roles instead; kept for legacy data migration.
  isAiAudioLoading: boolean;
  isAiAudioSynced: boolean; // True if current text matches generated/assigned audio
  isTextModifiedManual: boolean; // True if user manually edited text after initial load/AI annotation
  soundType?: string; // Off-screen / Off-stage sound type (e.g., 'OS', '电话音')
  emotion?: string;
  isMarkedForReturn?: boolean;
  feedback?: string;
  postSilence?: number; // Override for silence after this line, in seconds
  ignoredSoundKeywords?: IgnoredSoundKeyword[];
  pinnedSounds?: PinnedSound[];
}

export interface Chapter {
  id: string;
  title: string;
  rawContent: string; // Full raw text of the chapter
  scriptLines: ScriptLine[];
}

export type ProjectStatus = "in-progress" | "completed";
export type MainCategory = string; // Changed from "male" | "female" | "custom"

export type LineType = 'narration' | 'dialogue' | 'sfx';

export type SilencePairing = `${LineType}-to-${LineType}`;

export interface SilenceSettings {
  startPadding: number;
  endPadding: number;
  pairs: Record<SilencePairing, number>;
}

export interface TrackLufsSetting {
  enabled: boolean;
  target: number;
}

export interface PostProductionLufsSettings {
  voice: TrackLufsSetting;
  ambience: TrackLufsSetting;
  sfx: TrackLufsSetting;
  music: TrackLufsSetting;
}

export interface PostProductionTimeline {
  tracks: PostProductionTrack[];
  // Other global settings
}

// --- Sound Group (SFX Group) ---

/**
 * 一组“短时事件”音效：在某个锚点（文本行 + 字符偏移）一键插入多条音效，导出时按相对偏移展开。
 */
export interface SoundGroupClip {
  /** 优先使用 soundId；如果音效库重扫导致 id 变化，会回退用 soundName 匹配。 */
  soundId?: number;
  /** 音效库中保存的相对路径（如 "脚步/Run.mp3"）。 */
  soundName?: string;
  /** 相对锚点的偏移（秒），可为负数。 */
  offsetSeconds: number;
  /** 可选：额外增益（dB），导出到 Reaper 时会叠加在自动 LUFS 之上。 */
  gainDb?: number;
}

export interface SoundGroup {
  id: string;
  name: string;
  /**
   * - expanded: 在导出/时间轴中展开为多条音效片段（本地组合）
   * - reaperSubproject: 引用 Reaper 子工程（.rpp），导出时写入 RPP_PROJECT 绝对路径
   */
  kind?: 'expanded' | 'reaperSubproject';

  /** expanded 模式：音效条目 */
  clips?: SoundGroupClip[];

  /** reaperSubproject 模式：子工程文件名（例如：出厨房.rpp） */
  reaperFileName?: string;
  /** reaperSubproject 模式：预览 wav（例如：出厨房_preview.wav） */
  previewWavFileName?: string;
  /** reaperSubproject 模式：预览 wav 解析得到的时长（秒），用于导出 item 长度 */
  durationSeconds?: number;
}

// --- Pronunciation Notes (Pinyin Notes) ---

/**
 * 用于 CV 录制的“发音/拼音备注”。
 * - 作用域：默认按“本书(Project)”全局生效（整本书所有章节出现该词都会显示拼音）
 * - 用途：提示读音，不改动原文内容
 */
export interface PronunciationNote {
  id: string;
  /** 词/短语（建议 1-6 个字） */
  term: string;
  /** 拼音（建议带声调，例如：jìn liàng） */
  pinyin: string;
  /** 可选备注，例如：多音字说明 */
  note?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface Project {
  id: string;
  name: string; // Book name
  rawFullScript?: string; // Full raw text of the uploaded script
  chapters: Chapter[];
  status: ProjectStatus;
  mainCategory: MainCategory;
  subCategory: string; // Can be predefined or custom
  collaborators?: Collaborator[];
  lastModified: number; // Timestamp for sorting
  cvStyles?: CVStylesMap;
  customSoundTypes?: string[];
  lastViewedChapterId?: string;
  silenceSettings?: SilenceSettings;
  postProductionTimeline?: PostProductionTimeline;
  textMarkers?: TextMarker[];
  /** 可选：项目内维护的“音效组”库（短时事件包）。 */
  soundGroups?: SoundGroup[];
  /** 可选：本书全局拼音/发音备注（用于 CV 录制时常显提示）。 */
  pronunciationNotes?: PronunciationNote[];
  // Voice Library: default reference role mapping per Character
  referenceRoleByCharacterId?: Record<string, string>;
}

// For Gemini service response parsing
export interface AiAnnotatedLine {
  line_text: string;
  suggested_character_name: string;
}

// For storing audio data
export interface AudioBlob {
  id: string;
  lineId: string;
  data: Blob;
  sourceAudioId?: string; // ID linking to the master audio file
  sourceAudioFilename?: string; // Original filename of the master audio
}

export interface MasterAudio {
    id: string; // same as sourceAudioId
    projectId: string;
    data: Blob;
}

export interface AudioMarkerSet {
    sourceAudioId: string; // Primary Key
    markers: number[]; // Array of timestamps in seconds
    skipHeadSegments?: number; // Number of leading segments to ignore (e.g. intro without text)
    trimStart?: number; // Backward-compat: legacy intro offset in seconds
}

// Voice Library: stored prompt (reference) audio for TTS
export interface VoiceLibraryPrompt {
  id: string; // composed key: `${projectId}::${originalLineId}`
  projectId: string;
  originalLineId: string; // the script line this prompt belongs to
  fileName: string | null; // original file name
  serverPath: string | null; // path returned by TTS server for reuse when generating
  data: Blob; // the uploaded prompt audio data
  createdAt: number;
}

// Voice Role Library: local reference roles + samples for Voice Library auto-matching
export interface RoleLibraryRole {
  name: string; // role folder name
  handle: FileSystemDirectoryHandle;
  updatedAt: number;
}

export interface RoleLibrarySample {
  id?: number;
  roleName: string;
  relativePath: string; // path within role folder, includes filename
  fileName: string;
  handle: FileSystemFileHandle;
  duration: number;
  tags?: string[];
}


// For Editor Page UI State
export type CharacterFilterMode = 'currentChapter' | 'all';

// For Character Merge History
export interface ProjectLineReassignment {
  lineId: string;
  originalCharacterId: string; // The characterId before merge (one of the sourceCharacterIds)
}
export interface MergeHistoryEntry {
  id: string; // Unique ID for this merge event
  mergedAt: number; // Timestamp of the merge
  sourceCharacters: Character[]; // Full data of characters that were merged (and removed/marked)
  targetCharacterId: string; // ID of the character that received the lines
  projectLineReassignments: Record<string, ProjectLineReassignment[]>; // Key: projectId, Value: list of line reassignments
}

// Fix: Moved from App.tsx to break circular dependencies
export type AppView = "upload" | "dashboard" | "editor" | "audioAlignment" | "cvManagement" | "voiceLibrary" | "audioAlignmentAssistant" | "postProduction" | "tools";

export interface CVStyle {
  bgColor: string;
  textColor: string;
}
export type CVStylesMap = Record<string, CVStyle>;

// Definition for editable color presets
export interface PresetColor {
  name: string;
  bgColorClass: string;
  textColorClass: string;
}

export interface ParsedFileInfo {
  chapters: number[];
  characterName: string | null;
  cvName: string | null;
}

export interface AudioAssistantState {
  projectId: string;
  directoryName: string | null;
  scannedFiles: ParsedFileInfo[];
  manualOverrides: Record<string, boolean>;
}

export interface DirectoryHandleEntry {
  projectId: string;
  handle: FileSystemDirectoryHandle;
}

// Post Production Types
export interface SoundLibraryItem {
    id?: number;
    name: string;
    handle: FileSystemFileHandle;
    tags: string[];
    duration: number;
    category: string;
}

export type SoundLibraryHandleMap = Record<string, FileSystemDirectoryHandle>;

export type SoundLibraryRoot = 'music' | 'sfx';
export type SoundLibraryRootHandleMap = Partial<Record<SoundLibraryRoot, Array<FileSystemDirectoryHandle | null>>>;

export interface AudioClip {
    id: string;
    soundLibraryId: number;
    startTime: number; // in seconds on the timeline
    duration: number;
    // Optional properties for trimming within the clip
    trimStartTime?: number;
    trimEndTime?: number;
    volume: number;
}

export interface PostProductionTrack {
    id: string;
    name: string;
    type: 'music' | 'sfx' | 'ambience' | 'dialogue'; // dialogue is read-only
    clips: AudioClip[];
    isMuted: boolean;
    isSolo: boolean;
    volume: number; // 0-1
}

// FIX: Added TextMarker type to resolve import error in PostProductionPage.
export interface TextMarker {
  id: string;
  type: 'bgm' | 'sfx' | 'scene' | 'sfxGroup';
  name?: string;
  /** 仅 type === 'sfxGroup' 使用：引用 Project.soundGroups[].id */
  groupId?: string;
  startLineId: string;
  startOffset?: number;
  endLineId: string;
  endOffset?: number;
  color?: string; // 可选：自定义高亮颜色（BGM 用）
}
