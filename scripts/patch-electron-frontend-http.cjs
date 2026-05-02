const fs = require('fs');

const mainPath = String.raw`E:\Coding_copy\audiobook-2025.10.28-electron\electron-app\main.js`;
let main = fs.readFileSync(mainPath, 'utf8');

function replaceOnce(text, searchValue, replaceValue, label) {
  if (!text.includes(searchValue)) {
    throw new Error(`Missing marker for ${label}`);
  }
  return text.replace(searchValue, replaceValue);
}

if (!main.includes("const http = require('http');")) {
  main = replaceOnce(
    main,
    "const ffmpegPath = require('ffmpeg-static');\nconst os = require('os');",
    "const ffmpegPath = require('ffmpeg-static');\nconst os = require('os');\nconst http = require('http');\nconst express = require('express');",
    'require block'
  );
}

if (!main.includes('FRONTEND_PUBLIC_URL')) {
  main = replaceOnce(
    main,
    "let pythonPathOverride = null; // OpenAI Whisper（Python）可选解释器路径（绝对路径）\n",
    "let pythonPathOverride = null; // OpenAI Whisper（Python）可选解释器路径（绝对路径）\nlet frontendServer = null;\nconst FRONTEND_SERVER_BIND_HOST = '127.0.0.1';\nconst FRONTEND_SERVER_PORT = 5173;\nconst FRONTEND_PUBLIC_URL = `http://localhost:${FRONTEND_SERVER_PORT}/`;\n",
    'frontend globals'
  );
}

if (!main.includes('function probeFrontendService(')) {
  const insertMarker = 'function createWindow() {';
  const helperBlock = String.raw`
function probeFrontendService(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      try {
        res.resume();
      } catch (_) {}
      resolve(true);
    });

    req.on('error', () => resolve(false));
    req.setTimeout(timeoutMs, () => {
      try {
        req.destroy();
      } catch (_) {}
      resolve(false);
    });
  });
}

function startFrontendStaticServer(port = FRONTEND_SERVER_PORT) {
  const distDir = path.join(__dirname, '..', 'huanhuan-test', 'dist');
  const indexPath = path.join(distDir, 'index.html');

  if (!fs.existsSync(indexPath)) {
    return Promise.reject(new Error(`未找到前端构建文件: ${indexPath}`));
  }

  return new Promise((resolve, reject) => {
    const frontendApp = express();
    frontendApp.disable('x-powered-by');
    frontendApp.use(express.static(distDir));
    frontendApp.get(/.*/, (_req, res) => {
      res.sendFile(indexPath);
    });

    let settled = false;
    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      handler(value);
    };

    const server = frontendApp.listen(port, FRONTEND_SERVER_BIND_HOST, () => {
      finish(resolve, server);
    });

    server.on('error', async (error) => {
      if (error && error.code === 'EADDRINUSE') {
        const reachable = await probeFrontendService(FRONTEND_PUBLIC_URL);
        if (reachable) {
          finish(resolve, null);
          return;
        }
      }
      finish(reject, error);
    });
  });
}

async function ensureFrontendHttpServer(port = FRONTEND_SERVER_PORT) {
  if (frontendServer && frontendServer.listening) {
    return { url: FRONTEND_PUBLIC_URL, owned: true };
  }

  const reachable = await probeFrontendService(FRONTEND_PUBLIC_URL);
  if (reachable) {
    console.log(`[Frontend] 复用现有前端服务: ${FRONTEND_PUBLIC_URL}`);
    return { url: FRONTEND_PUBLIC_URL, owned: false };
  }

  const server = await startFrontendStaticServer(port);
  if (server) {
    frontendServer = server;
    console.log(`[Frontend] 本地静态服务已启动: ${FRONTEND_PUBLIC_URL}`);
    return { url: FRONTEND_PUBLIC_URL, owned: true };
  }

  console.log(`[Frontend] 端口 ${port} 已有可用前端服务，直接加载: ${FRONTEND_PUBLIC_URL}`);
  return { url: FRONTEND_PUBLIC_URL, owned: false };
}

`;
  main = replaceOnce(main, insertMarker, helperBlock + insertMarker, 'frontend helper block');
}

const createWindowRegex = /function createWindow\(\) \{[\s\S]*?\n\}\n\n\/\/ 当 Electron 完成初始化后创建窗口/;
if (!createWindowRegex.test(main)) {
  throw new Error('Could not find createWindow block');
}

const createWindowReplacement = String.raw`
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, 'icon.png') // 可选：添加应用图标
  });

  try {
    const frontend = await ensureFrontendHttpServer(FRONTEND_SERVER_PORT);
    console.log(`[Frontend] 加载页面: ${frontend.url}`);
    await mainWindow.loadURL(frontend.url);
  } catch (error) {
    console.error('Failed to load frontend page:', error);
    const message = error?.message || String(error);
    const fallbackHtml = `
      <html>
        <body style="font-family: sans-serif; background: #0f172a; color: #e2e8f0; padding: 24px;">
          <h2>前端页面启动失败</h2>
          <pre style="white-space: pre-wrap; line-height: 1.5;">${message}</pre>
        </body>
      </html>
    `;
    if (!mainWindow.isDestroyed()) {
      await mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(fallbackHtml));
    }
  }

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    console.error('[Frontend] 页面加载失败:', {
      errorCode,
      errorDescription,
      validatedURL,
    });
  });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 当 Electron 完成初始化后创建窗口`;

main = main.replace(createWindowRegex, createWindowReplacement);

main = replaceOnce(
  main,
  "    // 创建窗口\n    createWindow();",
  "    // 创建窗口\n    await createWindow();",
  'await createWindow'
);

main = replaceOnce(
  main,
  "      createWindow();",
  "      void createWindow();",
  'activate createWindow'
);

if (!main.includes("[Frontend] 静态服务已关闭")) {
  main = replaceOnce(
    main,
    "  if (wss) {\n    wss.close();\n    console.log('? WebSocket 服务器已关闭');\n  }",
    "  if (wss) {\n    wss.close();\n    console.log('? WebSocket 服务器已关闭');\n  }\n\n  if (frontendServer) {\n    try {\n      frontendServer.close();\n      console.log('[Frontend] 静态服务已关闭');\n    } catch (error) {\n      console.error('[Frontend] 关闭静态服务失败:', error);\n    }\n  }",
    'frontend close block'
  );
}

fs.writeFileSync(mainPath, main, 'utf8');
console.log('patched');
