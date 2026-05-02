#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const SERVER_INFO = {
  name: 'novel-electron-test',
  version: '0.1.0',
};

const TOOL_DEFINITIONS = [
  {
    name: 'ping',
    description: 'Verify that the MCP server is reachable and responding.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
      required: [],
    },
  },
  {
    name: 'list_directory',
    description: 'List files and folders under a local directory.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        dirPath: {
          type: 'string',
          description: 'Absolute or relative directory path.',
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
          description: 'Absolute or relative file path.',
        },
        maxChars: {
          type: 'integer',
          description: 'Maximum number of characters to return. Default 4000.',
        },
      },
      required: ['filePath'],
    },
  },
];

let receiveBuffer = Buffer.alloc(0);

function writeLog(...args) {
  process.stderr.write(`${args.join(' ')}\n`);
}

function sendMessage(message) {
  const json = JSON.stringify(message);
  const contentLength = Buffer.byteLength(json, 'utf8');
  process.stdout.write(`Content-Length: ${contentLength}\r\n\r\n${json}`);
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

function asResolvedPath(inputPath) {
  if (typeof inputPath !== 'string' || inputPath.trim() === '') {
    throw new Error('Path is required.');
  }
  const trimmed = inputPath.trim();
  return path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed);
}

function callTool(name, args) {
  if (name === 'ping') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              ok: true,
              server: SERVER_INFO.name,
              cwd: process.cwd(),
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (name === 'list_directory') {
    const dirPath = asResolvedPath(args.dirPath);
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: ${dirPath}`);
    }

    const entries = fs
      .readdirSync(dirPath, { withFileTypes: true })
      .map((entry) => `${entry.isDirectory() ? '[DIR]' : '[FILE]'} ${entry.name}`)
      .join('\n');

    return {
      content: [
        {
          type: 'text',
          text: entries || '(empty directory)',
        },
      ],
    };
  }

  if (name === 'read_text_file') {
    const filePath = asResolvedPath(args.filePath);
    const maxChars = Number.isInteger(args.maxChars) && args.maxChars > 0 ? args.maxChars : 4000;
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      throw new Error(`Not a file: ${filePath}`);
    }

    const fullText = fs.readFileSync(filePath, 'utf8');
    const truncated = fullText.length > maxChars ? `${fullText.slice(0, maxChars)}\n\n[TRUNCATED]` : fullText;

    return {
      content: [
        {
          type: 'text',
          text: truncated,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: `Unknown tool: ${name}`,
      },
    ],
    isError: true,
  };
}

function handleRequest(message) {
  const { id, method, params } = message || {};

  try {
    switch (method) {
      case 'initialize':
        sendResponse(id, {
          protocolVersion: params?.protocolVersion || '2025-03-26',
          capabilities: {
            tools: {},
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
        sendResponse(id, callTool(params?.name, params?.arguments || {}));
        return;

      default:
        sendError(id, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    sendResponse(id, {
      content: [
        {
          type: 'text',
          text: error instanceof Error ? error.message : String(error),
        },
      ],
      isError: true,
    });
  }
}

function processBuffer() {
  while (true) {
    const headerEndIndex = receiveBuffer.indexOf('\r\n\r\n');
    if (headerEndIndex === -1) return;

    const headerText = receiveBuffer.slice(0, headerEndIndex).toString('utf8');
    const contentLengthMatch = headerText.match(/Content-Length:\s*(\d+)/i);
    if (!contentLengthMatch) {
      writeLog('[mcp-test-server] Missing Content-Length header.');
      receiveBuffer = Buffer.alloc(0);
      return;
    }

    const contentLength = Number(contentLengthMatch[1]);
    const bodyStart = headerEndIndex + 4;
    const bodyEnd = bodyStart + contentLength;
    if (receiveBuffer.length < bodyEnd) return;

    const bodyText = receiveBuffer.slice(bodyStart, bodyEnd).toString('utf8');
    receiveBuffer = receiveBuffer.slice(bodyEnd);

    try {
      const message = JSON.parse(bodyText);
      handleRequest(message);
    } catch (error) {
      writeLog('[mcp-test-server] Failed to parse message:', error instanceof Error ? error.message : String(error));
    }
  }
}

process.stdin.on('data', (chunk) => {
  receiveBuffer = Buffer.concat([receiveBuffer, Buffer.from(chunk)]);
  processBuffer();
});

process.stdin.on('error', (error) => {
  writeLog('[mcp-test-server] stdin error:', error instanceof Error ? error.message : String(error));
});

process.on('uncaughtException', (error) => {
  writeLog('[mcp-test-server] uncaught exception:', error instanceof Error ? error.stack || error.message : String(error));
});

process.on('unhandledRejection', (error) => {
  writeLog('[mcp-test-server] unhandled rejection:', error instanceof Error ? error.stack || error.message : String(error));
});
