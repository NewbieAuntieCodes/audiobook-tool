import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    // 支持 Google AI Studio IDE 环境变量
    const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';

    const localResponsesProxyPlugin = {
      name: 'local-responses-proxy',
      configureServer(server: any) {
        server.middlewares.use('/__responses_proxy__', async (req: any, res: any, next: any) => {
          if (req.method !== 'POST') {
            next();
            return;
          }

          try {
            const chunks: Uint8Array[] = [];
            for await (const chunk of req) {
              chunks.push(Buffer.from(chunk));
            }

            const rawBody = Buffer.concat(chunks).toString('utf8');
            const parsed = rawBody ? JSON.parse(rawBody) : {};
            const endpoint = String(parsed?.endpoint || '').trim();
            const headers = parsed?.headers && typeof parsed.headers === 'object' ? parsed.headers : {};
            const body = parsed?.body;

            if (!endpoint) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: 'Missing endpoint.' }));
              return;
            }

            const upstream = await fetch(endpoint, {
              method: 'POST',
              headers,
              body: JSON.stringify(body),
            });

            const text = await upstream.text();
            res.statusCode = upstream.status;
            res.setHeader(
              'Content-Type',
              upstream.headers.get('content-type') || 'application/json; charset=utf-8'
            );
            res.end(text);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorCause =
              error instanceof Error && (error as Error & { cause?: unknown }).cause
                ? String((error as Error & { cause?: unknown }).cause)
                : '';
            console.error('[local-responses-proxy] upstream fetch failed:', errorMessage, errorCause);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(
              JSON.stringify({
                error: errorMessage,
                cause: errorCause,
              })
            );
          }
        });
      },
    };

    return {
      plugins: [react(), localResponsesProxyPlugin],
      // 使用相对路径，兼容 GitHub Pages（子路径）与 Electron file:// 本地加载
      base: './',
      define: {
        'process.env.API_KEY': JSON.stringify(apiKey),
        'process.env.GEMINI_API_KEY': JSON.stringify(apiKey),
        global: 'globalThis',
      },
      resolve: {
        alias: {
          buffer: 'buffer',
        },
      },
      optimizeDeps: {
        include: ['buffer'],
      },
      build: {
        target: 'es2015',
        rollupOptions: {
          external: []
        }
      },
      esbuild: {
        target: 'es2015'
      }
    };
});
