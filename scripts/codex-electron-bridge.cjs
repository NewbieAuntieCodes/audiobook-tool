const path = require('path');

function loadWebSocketModule() {
  try {
    return require('ws');
  } catch (_) {}

  try {
    const resolved = require.resolve('ws', {
      paths: [path.resolve(__dirname, '..', '..', 'electron-app')],
    });
    return require(resolved);
  } catch (_) {}

  throw new Error('未找到 ws 模块，无法连接 Electron 本地桥接服务。');
}

function createRequestId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function requestElectronRenderer(payload, options = {}) {
  const WebSocket = loadWebSocketModule();
  const url = typeof options.url === 'string' && options.url.trim()
    ? options.url.trim()
    : 'ws://127.0.0.1:9002';
  const timeoutMs =
    Number.isInteger(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 15000;
  const action = typeof payload.action === 'string' ? payload.action : '';
  const requestId =
    typeof payload.requestId === 'string' && payload.requestId.trim()
      ? payload.requestId.trim()
      : createRequestId(action || 'codex');
  const expectedAction =
    action === 'requestChapterSnapshot'
      ? 'chapterSnapshotResponse'
      : action === 'requestChapterSnapshots'
        ? 'chapterSnapshotsResponse'
      : action === 'applyCodexAssignments'
        ? 'codexAssignmentsApplied'
        : action === 'applyCodexAssignmentsBatch'
          ? 'codexAssignmentsBatchApplied'
        : '';

  if (!expectedAction) {
    throw new Error(`不支持的 Electron 桥接动作: ${action || '(empty)'}`);
  }

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let settled = false;

    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      } catch (_) {}
      handler(value);
    };

    const timeoutId = setTimeout(() => {
      finish(reject, new Error(`等待 Electron 响应超时: ${expectedAction}`));
    }, timeoutMs);

    ws.on('open', () => {
      try {
        ws.send(JSON.stringify({ action: 'registerClient', role: 'mcp' }));
        ws.send(JSON.stringify({ ...payload, requestId }));
      } catch (error) {
        finish(reject, error);
      }
    });

    ws.on('message', (rawMessage) => {
      try {
        const text = Buffer.isBuffer(rawMessage)
          ? rawMessage.toString('utf8')
          : String(rawMessage || '');
        const data = JSON.parse(text);
        if (!data || typeof data !== 'object') return;
        if (data.requestId !== requestId) return;
        if (data.action !== expectedAction) return;

        if (data.ok === false) {
          finish(reject, new Error(data.error || `${expectedAction} failed`));
          return;
        }

        finish(resolve, data);
      } catch (error) {
        finish(reject, error);
      }
    });

    ws.on('error', (error) => {
      finish(reject, error);
    });

    ws.on('close', () => {
      if (settled) return;
      finish(reject, new Error('Electron WebSocket 在返回结果前已断开。'));
    });
  });
}

async function getActiveChapterSnapshot(options = {}) {
  const response = await requestElectronRenderer({
    action: 'requestChapterSnapshot',
    ...(options.projectId ? { projectId: options.projectId } : {}),
    ...(options.chapterId ? { chapterId: options.chapterId } : {}),
  }, options);

  return response.snapshot || null;
}

async function getChapterSnapshots(options = {}) {
  const response = await requestElectronRenderer({
    action: 'requestChapterSnapshots',
    ...(options.projectId ? { projectId: options.projectId } : {}),
    ...(options.chapterId ? { chapterId: options.chapterId } : {}),
    ...(Array.isArray(options.chapterIds) ? { chapterIds: options.chapterIds } : {}),
    ...(Number.isInteger(options.count) ? { count: options.count } : {}),
  }, options);

  return response.bundle || null;
}

async function pushChapterAssignments(options = {}) {
  if (!options.projectId || !options.chapterId) {
    throw new Error('pushChapterAssignments 需要 projectId 和 chapterId。');
  }

  const response = await requestElectronRenderer({
    action: 'applyCodexAssignments',
    projectId: options.projectId,
    chapterId: options.chapterId,
    assignments: Array.isArray(options.assignments) ? options.assignments : [],
  }, options);

  return response.result || null;
}

async function pushChapterAssignmentsBatch(options = {}) {
  if (!options.projectId) {
    throw new Error('pushChapterAssignmentsBatch 需要 projectId。');
  }

  const response = await requestElectronRenderer({
    action: 'applyCodexAssignmentsBatch',
    projectId: options.projectId,
    chapters: Array.isArray(options.chapters) ? options.chapters : [],
  }, options);

  return response.result || null;
}

module.exports = {
  getActiveChapterSnapshot,
  getChapterSnapshots,
  pushChapterAssignments,
  pushChapterAssignmentsBatch,
  requestElectronRenderer,
};
