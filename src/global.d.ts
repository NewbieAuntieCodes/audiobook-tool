import { Buffer } from 'buffer';

type HotkeyOptionsMap = Record<string, string>;

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
  }

  interface Window {
    Buffer: typeof Buffer;
    electronAPI?: ElectronAPI;
  }
}

export {};
