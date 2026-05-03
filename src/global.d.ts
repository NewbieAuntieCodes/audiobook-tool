import { Buffer } from 'buffer';

type HotkeyOptionsMap = Record<string, string>;
type LocalCodexKnownCharacter = {
  name: string;
  cvName: string;
};

type LocalCodexRoleSyncLine = {
  lineId: string;
  index: number;
  text: string;
  originalText: string;
  currentCharacterName: string;
  isDialogue: boolean;
};

type LocalCodexRoleSyncChapter = {
  chapterId: string;
  title: string;
  lines: LocalCodexRoleSyncLine[];
};

type LocalCodexRoleSyncAssignment = {
  chapterId: string;
  lineId: string;
  characterName: string;
  cvName: string;
};

type LocalCodexExecutionOptions = {
  model?: string;
  reasoningEffort?: string;
};

type DeepSeekRoleSyncMode = 'flash' | 'pro';

type DeepSeekRoleSyncSettings = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

type DeepSeekCharacterProfile = {
  age?: string;
  gender?: string;
  occupation?: string;
  personality?: string;
  voiceDirection?: string;
  relationships?: string;
  notes?: string;
};

type LocalCodexScriptRewriteMode =
  | 'faithful_parse'
  | 'atmosphere_keep'
  | 'compress_extract'
  | 'grouped_comments';

type LocalCodexScriptRewriteLine = {
  kind: 'narration' | 'dialogue' | 'sfx';
  speakerName: string;
  text: string;
  soundType: string;
};

type LocalCodexScriptRewriteSelectionBlock = {
  lineId: string;
  index: number;
  speakerName: string;
  text: string;
  originalText: string;
  soundType: string;
};

type LocalCodexScriptRewriteSelectionSegment = {
  segmentId: string;
  startLine: number;
  endLine: number;
  contextBefore?: string;
  contextAfter?: string;
  blocks: LocalCodexScriptRewriteSelectionBlock[];
};

type LocalCodexScriptRewriteResultSegment = {
  segmentId: string;
  startLine: number;
  endLine: number;
  lines: LocalCodexScriptRewriteLine[];
};

type LocalCodexScriptRewriteApplySegment = {
  segmentId: string;
  selectedLineIds: string[];
  startLine: number;
  endLine: number;
  lines: LocalCodexScriptRewriteLine[];
};

type LocalCodexTaskKind = 'role_sync' | 'script_rewrite';

type LocalCodexTaskStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

type LocalCodexTaskPriority = 'normal' | 'high';

type LocalCodexScriptRewriteTask = {
  id: string;
  kind: 'script_rewrite';
  status: LocalCodexTaskStatus;
  priority: LocalCodexTaskPriority;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
  error?: string;
  projectId: string;
  projectName: string;
  chapterId: string;
  chapterTitle: string;
  mode: LocalCodexScriptRewriteMode;
  selection: {
    text: string;
    startLine: number;
    endLine: number;
    contextBefore?: string;
    contextAfter?: string;
    blocks: LocalCodexScriptRewriteSelectionBlock[];
    segments: LocalCodexScriptRewriteSelectionSegment[];
  };
  executionOptions?: LocalCodexExecutionOptions;
  result?: {
    summary: string;
    lines: LocalCodexScriptRewriteLine[];
    segments: LocalCodexScriptRewriteResultSegment[];
  };
};

type LocalCodexAuthStatusResult = {
  success: boolean;
  available: boolean;
  loggedIn: boolean;
  codexHome: string;
  defaultCodexHome: string;
  loginCommand: string;
  bootstrappedFromDefault: boolean;
  message: string;
  statusOutput?: string;
  error?: string;
};

declare global {
  interface ElectronAPI {
    openTestPage: () => Promise<{ success: boolean; error?: string }>;
    toggleHotkey: (enable: boolean) => Promise<{ success: boolean; enabled: boolean; error?: string }>;
    getHotkeyStatus: () => Promise<{ enabled: boolean }>;
    getHotkeyOptions: () => Promise<{ options: HotkeyOptionsMap; current: string }>;
    changeHotkey: (newHotkey: string) => Promise<{ success: boolean; hotkey: string; error?: string }>;
    transferMarkers?: (payload: {
      sources: string[];
      targets: string[];
      outputDir?: string | null;
      overwrite?: boolean;
    }) => Promise<{
      success: boolean;
      results: Array<{
        source: string;
        target: string;
        output: string | null;
        ok: boolean;
        error?: string;
        chapterNumber?: number | null;
      }>;
      error?: string;
    }>;

    convertM4aToMp3?: (payload: {
      files: string[];
      bitrateKbps?: number;
      overwrite?: boolean;
    }) => Promise<{
      success: boolean;
      results: Array<{
        input: string;
        output: string | null;
        ok: boolean;
        error?: string;
      }>;
      error?: string;
    }>;

    asrTranscribeWhisperCpp?: (payload: {
      audioPath: string;
      modelPath?: string;
      language?: string; // e.g. "zh"
      threads?: number;
      extraArgs?: string[];
    }) => Promise<{
      success: boolean;
      segments: Array<{
        start: number; // seconds
        end: number; // seconds
        text: string;
      }>;
      meta?: {
        engine: 'whisper.cpp';
        binaryPath?: string;
        modelPath?: string;
        jsonPath?: string;
        stderr?: string;
      };
      error?: string;
    }>;

    asrTranscribeFasterWhisper?: (payload: {
      audioPath: string;
      pythonPath?: string;
      scriptPath?: string;
      model?: string;
      language?: string;
      modelDir?: string;
      device?: 'cuda' | 'cpu' | string;
      computeType?: string;
      beamSize?: number;
    }) => Promise<{
      success: boolean;
      segments: Array<{
        start: number;
        end: number;
        text: string;
      }>;
      meta?: {
        engine: 'faster-whisper';
        pythonPath?: string;
        scriptPath?: string;
        model?: string;
        modelDir?: string;
        device?: string;
        computeType?: string;
        jsonPath?: string;
        durationMs?: number;
        language?: string;
        languageProbability?: number;
        stderr?: string;
      };
      error?: string;
    }>;

    asrTranscribeOpenAIWhisper?: (payload: {
      audioPath: string;
      pythonPath?: string; // default: "python"
      model?: string; // e.g. "small" | "medium" | "large-v3"
      language?: string; // e.g. "zh"
      modelDir?: string; // where .pt models live / are downloaded
      device?: string; // "cuda" | "cpu"
      extraArgs?: string[];
    }) => Promise<{
      success: boolean;
      segments: Array<{
        start: number; // seconds
        end: number; // seconds
        text: string;
      }>;
      meta?: {
        engine: 'openai-whisper';
        pythonPath?: string;
        model?: string;
        modelDir?: string;
        jsonPath?: string;
        stderr?: string;
      };
      error?: string;
    }>;

    writeAuditionCuePoints?: (payload: {
      audioPath: string;
      transcriptPath: string;
      outputPath?: string | null;
      overwrite?: boolean;
    }) => Promise<{
      success: boolean;
      outputPath?: string;
      markerCount?: number;
      sampleRate?: number;
      error?: string;
    }>;

    cleanTranscriptText?: (payload: { text: string; removeEmptyLines?: boolean }) => Promise<{
      success: boolean;
      text?: string;
      error?: string;
    }>;

    runLocalCodexRoleSync?: (payload: {
      projectId: string;
      projectName: string;
      chapterIds: string[];
      knownCharacters: LocalCodexKnownCharacter[];
      chapters: LocalCodexRoleSyncChapter[];
      executionOptions?: LocalCodexExecutionOptions;
    }) => Promise<{
      success: boolean;
      assignments: LocalCodexRoleSyncAssignment[];
      error?: string;
      meta?: {
        durationMs?: number;
        rawOutput?: string;
      };
    }>;

    runDeepSeekRoleSync?: (payload: {
      projectId: string;
      projectName: string;
      chapterIds: string[];
      knownCharacters: LocalCodexKnownCharacter[];
      chapters: LocalCodexRoleSyncChapter[];
      mode: DeepSeekRoleSyncMode;
      settings: DeepSeekRoleSyncSettings;
    }) => Promise<{
      success: boolean;
      assignments: LocalCodexRoleSyncAssignment[];
      error?: string;
      meta?: {
        durationMs?: number;
        rawOutput?: string;
        model?: string;
        mode?: DeepSeekRoleSyncMode;
        usage?: unknown;
      };
    }>;

    runDeepSeekCharacterProfile?: (payload: {
      projectId: string;
      projectName: string;
      character: {
        id: string;
        name: string;
        cvName?: string;
        description?: string;
        profile?: DeepSeekCharacterProfile;
      };
      knownCharacters: LocalCodexKnownCharacter[];
      evidence: {
        assignedLines: Array<{
          chapterTitle: string;
          index: number;
          text: string;
        }>;
        contextSnippets: Array<{
          chapterTitle: string;
          lines: Array<{
            speaker: string;
            text: string;
          }>;
        }>;
      };
      settings: DeepSeekRoleSyncSettings;
    }) => Promise<{
      success: boolean;
      profile?: DeepSeekCharacterProfile;
      error?: string;
      meta?: {
        durationMs?: number;
        rawOutput?: string;
        model?: string;
        usage?: unknown;
      };
    }>;

    runDeepSeekScriptRewrite?: (payload: {
      projectId: string;
      projectName: string;
      chapterId: string;
      chapterTitle: string;
      knownCharacters: LocalCodexKnownCharacter[];
      mode: LocalCodexScriptRewriteMode;
      customInstructions?: string;
      settings: DeepSeekRoleSyncSettings;
      selection: {
        text: string;
        startLine: number;
        endLine: number;
        contextBefore?: string;
        contextAfter?: string;
        blocks?: LocalCodexScriptRewriteSelectionBlock[];
        segments?: LocalCodexScriptRewriteSelectionSegment[];
      };
    }) => Promise<{
      success: boolean;
      summary: string;
      lines: LocalCodexScriptRewriteLine[];
      segments: LocalCodexScriptRewriteResultSegment[];
      error?: string;
      meta?: {
        durationMs?: number;
        rawOutput?: string;
        model?: string;
        usage?: unknown;
      };
    }>;

    runLocalCodexScriptRewrite?: (payload: {
      projectId: string;
      projectName: string;
      chapterId: string;
      chapterTitle: string;
      knownCharacters: LocalCodexKnownCharacter[];
      mode: LocalCodexScriptRewriteMode;
      priority?: LocalCodexTaskPriority;
      customInstructions?: string;
      selection: {
        text: string;
        startLine: number;
        endLine: number;
        contextBefore?: string;
        contextAfter?: string;
        blocks?: LocalCodexScriptRewriteSelectionBlock[];
        segments?: LocalCodexScriptRewriteSelectionSegment[];
      };
      executionOptions?: LocalCodexExecutionOptions;
    }) => Promise<{
      success: boolean;
      summary: string;
      lines: LocalCodexScriptRewriteLine[];
      segments: LocalCodexScriptRewriteResultSegment[];
      error?: string;
      meta?: {
        durationMs?: number;
        rawOutput?: string;
      };
    }>;

    enqueueLocalCodexScriptRewrite?: (payload: {
      projectId: string;
      projectName: string;
      chapterId: string;
      chapterTitle: string;
      knownCharacters: LocalCodexKnownCharacter[];
      mode: LocalCodexScriptRewriteMode;
      priority?: LocalCodexTaskPriority;
      customInstructions?: string;
      selection: {
        text: string;
        startLine: number;
        endLine: number;
        contextBefore?: string;
        contextAfter?: string;
        blocks?: LocalCodexScriptRewriteSelectionBlock[];
        segments?: LocalCodexScriptRewriteSelectionSegment[];
      };
      executionOptions?: LocalCodexExecutionOptions;
    }) => Promise<{
      success: boolean;
      taskId?: string;
      task?: LocalCodexScriptRewriteTask;
      error?: string;
    }>;

    listLocalCodexTasks?: (payload?: {
      projectId?: string;
      kind?: LocalCodexTaskKind;
    }) => Promise<{
      success: boolean;
      tasks: LocalCodexScriptRewriteTask[];
      error?: string;
    }>;

    cancelLocalCodexTask?: (payload: {
      taskId: string;
    }) => Promise<{
      success: boolean;
      cancelled: boolean;
      error?: string;
    }>;

    removeLocalCodexTask?: (payload: {
      taskId: string;
    }) => Promise<{
      success: boolean;
      removed: boolean;
      error?: string;
    }>;

    prioritizeLocalCodexTask?: (payload: {
      taskId: string;
    }) => Promise<{
      success: boolean;
      prioritized: boolean;
      task?: LocalCodexScriptRewriteTask;
      error?: string;
    }>;

    getLocalCodexAuthStatus?: () => Promise<LocalCodexAuthStatusResult>;

    cancelLocalCodexRoleSync?: () => Promise<{
      success: boolean;
      cancelled: boolean;
      error?: string;
    }>;
  }

  interface Window {
    Buffer: typeof Buffer;
    electronAPI?: ElectronAPI;
  }
}

export {};
