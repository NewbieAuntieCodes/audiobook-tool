const LOCAL_CODEX_PERF_DEBUG_KEY = '__local_codex_perf_debug__';
const LOCAL_CODEX_PERF_MAX_ENTRIES = 200;

export interface LocalCodexPerfEntry {
  id: string;
  timestamp: string;
  message: string;
  payload: Record<string, unknown>;
}

type LocalCodexPerfSubscriber = (entries: LocalCodexPerfEntry[]) => void;

const localCodexPerfEntries: LocalCodexPerfEntry[] = [];
const localCodexPerfSubscribers = new Set<LocalCodexPerfSubscriber>();

const getPerfNow = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const toPerfDuration = (value: number) => Number(value.toFixed(1));

const isElectronRenderer = () => {
  try {
    return typeof window !== 'undefined' && !!window.electronAPI;
  } catch (_) {
    return false;
  }
};

const shouldCaptureLocalCodexPerf = () =>
  isLocalCodexPerfDebugEnabled() || isElectronRenderer();

const notifyLocalCodexPerfSubscribers = () => {
  const snapshot = [...localCodexPerfEntries];
  localCodexPerfSubscribers.forEach((subscriber) => {
    try {
      subscriber(snapshot);
    } catch (error) {
      console.error('[LocalCodexPerf] subscriber failed:', error);
    }
  });
};

const pushLocalCodexPerfEntry = (
  message: string,
  payload: Record<string, unknown> = {}
) => {
  if (!shouldCaptureLocalCodexPerf()) {
    return;
  }

  localCodexPerfEntries.push({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    message,
    payload,
  });

  if (localCodexPerfEntries.length > LOCAL_CODEX_PERF_MAX_ENTRIES) {
    localCodexPerfEntries.splice(0, localCodexPerfEntries.length - LOCAL_CODEX_PERF_MAX_ENTRIES);
  }

  notifyLocalCodexPerfSubscribers();
};

export const isLocalCodexPerfDebugEnabled = () =>
  process.env.NODE_ENV === 'development' ||
  (() => {
    try {
      return (
        typeof window !== 'undefined' &&
        window.localStorage.getItem(LOCAL_CODEX_PERF_DEBUG_KEY) === '1'
      );
    } catch (_) {
      return false;
    }
  })();

export const logLocalCodexPerf = (
  message: string,
  payload: Record<string, unknown> = {}
) => {
  pushLocalCodexPerfEntry(message, payload);

  if (!isLocalCodexPerfDebugEnabled()) {
    return;
  }

  console.info('[LocalCodexPerf]', message, payload);
};

export const getLocalCodexPerfEntries = () => [...localCodexPerfEntries];

export const subscribeLocalCodexPerfEntries = (
  subscriber: LocalCodexPerfSubscriber
) => {
  localCodexPerfSubscribers.add(subscriber);
  subscriber(getLocalCodexPerfEntries());
  return () => {
    localCodexPerfSubscribers.delete(subscriber);
  };
};

export const clearLocalCodexPerfEntries = () => {
  localCodexPerfEntries.splice(0, localCodexPerfEntries.length);
  notifyLocalCodexPerfSubscribers();
};

export const formatLocalCodexPerfEntriesForClipboard = (
  entries: LocalCodexPerfEntry[]
) =>
  entries
    .map((entry) => {
      const payloadText =
        entry.payload && Object.keys(entry.payload).length > 0
          ? ` ${JSON.stringify(entry.payload)}`
          : '';
      return `[${entry.timestamp}] ${entry.message}${payloadText}`;
    })
    .join('\n');

export const measureLocalCodexPerfSync = <T>(
  measureName: string,
  fn: () => T
): { result: T; durationMs: number } => {
  const start = getPerfNow();
  const result = fn();
  return {
    result,
    durationMs: toPerfDuration(getPerfNow() - start),
  };
};

export const startLocalCodexPerfSpan = (
  measureName: string,
  payload: Record<string, unknown> = {}
) => {
  if (!shouldCaptureLocalCodexPerf()) {
    return (_extraPayload: Record<string, unknown> = {}) => {};
  }

  const startedAt = getPerfNow();
  pushLocalCodexPerfEntry(`${measureName}:start`, payload);
  if (isLocalCodexPerfDebugEnabled()) {
    console.info('[LocalCodexPerf]', `${measureName}:start`, payload);
  }

  return (extraPayload: Record<string, unknown> = {}) => {
    const endPayload = {
      ...payload,
      ...extraPayload,
      durationMs: toPerfDuration(getPerfNow() - startedAt),
    };
    pushLocalCodexPerfEntry(`${measureName}:end`, endPayload);
    if (isLocalCodexPerfDebugEnabled()) {
      console.info('[LocalCodexPerf]', `${measureName}:end`, endPayload);
    }
  };
};
