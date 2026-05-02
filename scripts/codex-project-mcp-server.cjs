#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  parseWorkbookDocumentFromFile,
  parseStep1ScriptLines,
  applyStep2AnnotationText,
} = require('./codex-document-tools.cjs');
const {
  getActiveChapterSnapshot,
  getChapterSnapshots,
  pushChapterAssignments,
  pushChapterAssignmentsBatch,
} = require('./codex-electron-bridge.cjs');

const configuredRoot = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const configuredName = process.argv[3] ? String(process.argv[3]).trim() : path.basename(configuredRoot);
const logFilePath = path.join(os.tmpdir(), `codex-project-mcp-${configuredName || 'unknown'}.log`);

const SERVER_INFO = {
  name: `project-mcp-${configuredName || 'unknown'}`,
  version: '0.7.0',
};

const TOOL_DEFINITIONS = [
  {
    name: 'ping',
    description: 'Verify that the MCP server is reachable and returns the configured project root.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
      required: [],
    },
  },
  {
    name: 'project_root',
    description: 'Return the configured project root for this MCP server.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
      required: [],
    },
  },
  {
    name: 'list_directory',
    description: 'List files and folders under a directory inside the configured project root.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        dirPath: {
          type: 'string',
          description: 'Relative path inside the configured project root. Use . for the root.',
        },
      },
      required: ['dirPath'],
    },
  },
  {
    name: 'read_text_file',
    description: 'Read a UTF-8 text file from disk and return a truncated preview.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        filePath: {
          type: 'string',
          description: 'Absolute path, or relative to the configured project root.',
        },
        maxChars: {
          type: 'integer',
          description: 'Maximum number of characters to return. Default 6000.',
        },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'parse_workbook_document',
    description: 'Parse a local .txt/.docx/HTML-workbook file into chapters and script lines using the same import logic as the frontend workbook flow.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        filePath: {
          type: 'string',
          description: 'Absolute path, or relative to the configured project root.',
        },
        chapterStart: {
          type: 'integer',
          description: 'Optional 1-based chapter start index.',
        },
        chapterEnd: {
          type: 'integer',
          description: 'Optional 1-based chapter end index.',
        },
        includeRawContent: {
          type: 'boolean',
          description: 'Whether to include rawContent in the response. Default true.',
        },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'parse_step1_script_lines',
    description: 'Apply the frontend 画本步骤1 rules to raw chapter text and return parsed script lines.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        rawText: {
          type: 'string',
          description: 'Raw chapter text to parse.',
        },
      },
      required: ['rawText'],
    },
  },
  {
    name: 'apply_step2_annotation_text',
    description: 'Apply the frontend 画本步骤2 matching rules to auxiliary annotation text and existing script lines.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        annotatedText: {
          type: 'string',
          description: 'The annotated helper text returned by an AI, e.g. 【角色】“台词”.',
        },
        lines: {
          type: 'array',
          description: 'Existing script lines to match against.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string' },
              text: { type: 'string' },
              originalText: { type: 'string' },
            },
            required: ['id', 'text', 'originalText'],
          },
        },
      },
      required: ['annotatedText', 'lines'],
    },
  },
  {
    name: 'get_active_chapter_snapshot',
    description: 'Read the currently selected project/chapter from the running Electron-hosted webpage and return its lines plus known characters for Codex role assignment.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        projectId: {
          type: 'string',
          description: 'Optional explicit project ID. Defaults to the webpage currently selected project.',
        },
        chapterId: {
          type: 'string',
          description: 'Optional explicit chapter ID. Defaults to the webpage currently selected chapter.',
        },
        timeoutMs: {
          type: 'integer',
          description: 'Optional timeout in milliseconds. Default 15000.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_chapter_snapshots',
    description: 'Read multiple chapters from the running Electron-hosted webpage. By default, returns the current selected chapter and the following chapters up to count.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        projectId: {
          type: 'string',
          description: 'Optional explicit project ID. Defaults to the webpage currently selected project.',
        },
        chapterId: {
          type: 'string',
          description: 'Optional explicit starting chapter ID. Defaults to the webpage currently selected chapter.',
        },
        chapterIds: {
          type: 'array',
          description: 'Optional explicit chapter IDs to fetch in order.',
          items: {
            type: 'string',
          },
        },
        count: {
          type: 'integer',
          description: 'Optional number of consecutive chapters to return. Default 1.',
        },
        timeoutMs: {
          type: 'integer',
          description: 'Optional timeout in milliseconds. Default 15000.',
        },
      },
      required: [],
    },
  },
  {
    name: 'push_chapter_assignments',
    description: 'Send Codex-produced role assignments back into the running webpage so the target chapter updates immediately.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        projectId: {
          type: 'string',
          description: 'Target project ID.',
        },
        chapterId: {
          type: 'string',
          description: 'Target chapter ID.',
        },
        timeoutMs: {
          type: 'integer',
          description: 'Optional timeout in milliseconds. Default 15000.',
        },
        assignments: {
          type: 'array',
          description: 'Assignments produced by Codex for this chapter.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              lineId: { type: 'string' },
              characterName: { type: 'string' },
              cvName: { type: 'string' },
            },
            required: ['lineId', 'characterName'],
          },
        },
      },
      required: ['projectId', 'chapterId', 'assignments'],
    },
  },
  {
    name: 'push_chapter_assignments_batch',
    description: 'Send role assignments for multiple chapters back into the running webpage in one batch so several chapters update together.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        projectId: {
          type: 'string',
          description: 'Target project ID.',
        },
        timeoutMs: {
          type: 'integer',
          description: 'Optional timeout in milliseconds. Default 15000.',
        },
        chapters: {
          type: 'array',
          description: 'Per-chapter assignments produced by Codex.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              chapterId: { type: 'string' },
              assignments: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    lineId: { type: 'string' },
                    characterName: { type: 'string' },
                    cvName: { type: 'string' },
                  },
                  required: ['lineId', 'characterName'],
                },
              },
            },
            required: ['chapterId', 'assignments'],
          },
        },
      },
      required: ['projectId', 'chapters'],
    },
  },
];

let receiveBuffer = Buffer.alloc(0);
let responseTransport = 'jsonl';

function writeLog(...args) {
  const line = `${new Date().toISOString()} ${args.join(' ')}`;
  try {
    fs.appendFileSync(logFilePath, `${line}\n`);
  } catch (_) {}
  try {
    process.stderr.write(`${line}\n`);
  } catch (_) {}
}

function sendMessage(message) {
  const json = JSON.stringify(message);
  if (responseTransport === 'content-length') {
    const contentLength = Buffer.byteLength(json, 'utf8');
    process.stdout.write(`Content-Length: ${contentLength}\r\n\r\n${json}`);
    return;
  }

  process.stdout.write(`${json}\n`);
}

function sendResponse(id, result) {
  if (id === undefined || id === null) return;
  sendMessage({
    jsonrpc: '2.0',
    id,
    result,
  });
}

function sendError(id, code, message, data) {
  if (id === undefined || id === null) return;
  sendMessage({
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      data,
    },
  });
}

function ensureProjectRootExists() {
  if (!fs.existsSync(configuredRoot)) {
    throw new Error(`Configured project root does not exist: ${configuredRoot}`);
  }
  const stat = fs.statSync(configuredRoot);
  if (!stat.isDirectory()) {
    throw new Error(`Configured project root is not a directory: ${configuredRoot}`);
  }
}

function toResolvedPath(inputPath) {
  if (typeof inputPath !== 'string' || inputPath.trim() === '') {
    throw new Error('Path is required.');
  }

  const trimmed = inputPath.trim();
  return path.isAbsolute(trimmed) ? path.resolve(trimmed) : path.resolve(configuredRoot, trimmed);
}

function formatToolResult(text, isError = false) {
  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
    ...(isError ? { isError: true } : {}),
  };
}

function formatJsonToolResult(value) {
  return formatToolResult(JSON.stringify(value, null, 2));
}

async function callTool(name, args) {
  ensureProjectRootExists();

  if (name === 'ping') {
    return formatJsonToolResult({
      ok: true,
      server: SERVER_INFO.name,
      projectRoot: configuredRoot,
    });
  }

  if (name === 'project_root') {
    return formatToolResult(configuredRoot);
  }

  if (name === 'list_directory') {
    const dirPath = toResolvedPath(args.dirPath);
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: ${dirPath}`);
    }

    const entries = fs
      .readdirSync(dirPath, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name, 'en'))
      .map((entry) => `${entry.isDirectory() ? '[DIR]' : '[FILE]'} ${entry.name}`)
      .join('\n');

    return formatToolResult(entries || '(empty directory)');
  }

  if (name === 'read_text_file') {
    const filePath = toResolvedPath(args.filePath);
    const maxChars = Number.isInteger(args.maxChars) && args.maxChars > 0 ? args.maxChars : 6000;
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      throw new Error(`Not a file: ${filePath}`);
    }

    const fullText = fs.readFileSync(filePath, 'utf8');
    const truncated =
      fullText.length > maxChars ? `${fullText.slice(0, maxChars)}\n\n[TRUNCATED]` : fullText;

    return formatToolResult(truncated);
  }

  if (name === 'parse_workbook_document') {
    const result = await parseWorkbookDocumentFromFile(toResolvedPath(args.filePath), {
      chapterStart: args.chapterStart,
      chapterEnd: args.chapterEnd,
      includeRawContent: args.includeRawContent,
    });
    return formatJsonToolResult(result);
  }

  if (name === 'parse_step1_script_lines') {
    return formatJsonToolResult(parseStep1ScriptLines(args.rawText));
  }

  if (name === 'apply_step2_annotation_text') {
    return formatJsonToolResult(
      applyStep2AnnotationText(
        Array.isArray(args.lines) ? args.lines : [],
        typeof args.annotatedText === 'string' ? args.annotatedText : ''
      )
    );
  }

  if (name === 'get_active_chapter_snapshot') {
    return formatJsonToolResult(
      await getActiveChapterSnapshot({
        projectId: typeof args.projectId === 'string' ? args.projectId : undefined,
        chapterId: typeof args.chapterId === 'string' ? args.chapterId : undefined,
        timeoutMs: args.timeoutMs,
      })
    );
  }

  if (name === 'get_chapter_snapshots') {
    return formatJsonToolResult(
      await getChapterSnapshots({
        projectId: typeof args.projectId === 'string' ? args.projectId : undefined,
        chapterId: typeof args.chapterId === 'string' ? args.chapterId : undefined,
        chapterIds: Array.isArray(args.chapterIds) ? args.chapterIds : undefined,
        count: args.count,
        timeoutMs: args.timeoutMs,
      })
    );
  }

  if (name === 'push_chapter_assignments') {
    return formatJsonToolResult(
      await pushChapterAssignments({
        projectId: args.projectId,
        chapterId: args.chapterId,
        assignments: Array.isArray(args.assignments) ? args.assignments : [],
        timeoutMs: args.timeoutMs,
      })
    );
  }

  if (name === 'push_chapter_assignments_batch') {
    return formatJsonToolResult(
      await pushChapterAssignmentsBatch({
        projectId: args.projectId,
        chapters: Array.isArray(args.chapters) ? args.chapters : [],
        timeoutMs: args.timeoutMs,
      })
    );
  }

  return formatToolResult(`Unknown tool: ${name}`, true);
}

async function handleRequest(message) {
  const { id, method, params } = message || {};
  writeLog('[project-mcp-server] method', method || '(none)');

  try {
    switch (method) {
      case 'initialize':
        sendResponse(id, {
          protocolVersion: params?.protocolVersion || '2025-06-18',
          capabilities: {
            tools: {
              listChanged: false,
            },
          },
          serverInfo: SERVER_INFO,
        });
        return;

      case 'notifications/initialized':
        return;

      case 'ping':
        sendResponse(id, {});
        return;

      case 'tools/list':
        sendResponse(id, { tools: TOOL_DEFINITIONS });
        return;

      case 'tools/call':
        sendResponse(id, await callTool(params?.name, params?.arguments || {}));
        return;

      default:
        sendError(id, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    sendResponse(
      id,
      formatToolResult(error instanceof Error ? error.message : String(error), true)
    );
  }
}

function tryProcessContentLength() {
  let headerEndIndex = receiveBuffer.indexOf('\r\n\r\n');
  let separatorLength = 4;
  if (headerEndIndex === -1) {
    headerEndIndex = receiveBuffer.indexOf('\n\n');
    separatorLength = 2;
  }
  if (headerEndIndex === -1) return false;

  const headerText = receiveBuffer.slice(0, headerEndIndex).toString('utf8');
  if (!/Content-Length:/i.test(headerText)) return false;

  const contentLengthMatch = headerText.match(/Content-Length:\s*(\d+)/i);
  if (!contentLengthMatch) {
    writeLog('[project-mcp-server] missing content-length header');
    receiveBuffer = Buffer.alloc(0);
    return false;
  }

  const contentLength = Number(contentLengthMatch[1]);
  const bodyStart = headerEndIndex + separatorLength;
  const bodyEnd = bodyStart + contentLength;
  if (receiveBuffer.length < bodyEnd) return false;

  const bodyText = receiveBuffer.slice(bodyStart, bodyEnd).toString('utf8');
  receiveBuffer = receiveBuffer.slice(bodyEnd);
  responseTransport = 'content-length';

  try {
      void handleRequest(JSON.parse(bodyText));
    } catch (error) {
      writeLog('[project-mcp-server] failed to parse content-length message', error instanceof Error ? error.message : String(error));
    }

  return true;
}

function tryProcessJsonLine() {
  const newlineIndex = receiveBuffer.indexOf('\n');
  if (newlineIndex === -1) return false;

  const rawLine = receiveBuffer.slice(0, newlineIndex).toString('utf8').trim();
  receiveBuffer = receiveBuffer.slice(newlineIndex + 1);
  if (!rawLine) return true;

  responseTransport = 'jsonl';

  try {
      void handleRequest(JSON.parse(rawLine));
    } catch (error) {
      writeLog('[project-mcp-server] failed to parse jsonl message', error instanceof Error ? error.message : String(error), JSON.stringify(rawLine));
    }

  return true;
}

function processBuffer() {
  while (true) {
    if (tryProcessContentLength()) continue;
    if (tryProcessJsonLine()) continue;
    return;
  }
}

writeLog('[project-mcp-server] started', `name=${SERVER_INFO.name}`, `root=${configuredRoot}`);

process.stdin.on('data', (chunk) => {
  writeLog('[project-mcp-server] chunk', String(chunk.length));
  writeLog('[project-mcp-server] raw', JSON.stringify(chunk.toString('utf8')));
  receiveBuffer = Buffer.concat([receiveBuffer, Buffer.from(chunk)]);
  processBuffer();
});

process.stdin.on('error', (error) => {
  writeLog('[project-mcp-server] stdin error', error instanceof Error ? error.message : String(error));
});

process.on('uncaughtException', (error) => {
  writeLog('[project-mcp-server] uncaught exception', error instanceof Error ? error.stack || error.message : String(error));
});

process.on('unhandledRejection', (error) => {
  writeLog('[project-mcp-server] unhandled rejection', error instanceof Error ? error.stack || error.message : String(error));
});
