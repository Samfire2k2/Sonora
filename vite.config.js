import { copyFileSync, createReadStream, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const copyFfmpegCore = {
  name: 'copy-ffmpeg-core',
  configureServer(server) {
    server.middlewares.use('/ffmpeg', (request, response, next) => {
      const file = request.url?.slice(1);
      if (!['ffmpeg-core.js', 'ffmpeg-core.wasm'].includes(file)) return next();
      response.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
      createReadStream(resolve('node_modules/@ffmpeg/core/dist/umd', file)).pipe(response);
    });
  },
  closeBundle() {
    const source = resolve('node_modules/@ffmpeg/core/dist/umd');
    const target = resolve('dist/ffmpeg');
    mkdirSync(target, { recursive: true });
    for (const file of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
      copyFileSync(resolve(source, file), resolve(target, file));
    }
  },
};

export default defineConfig({
  base: './',
  plugins: [copyFfmpegCore],
});
