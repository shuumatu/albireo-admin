/// <reference lib="webworker" />
import { createSHA256 } from 'hash-wasm';

self.onmessage = async (e) => {
  const { file, chunkSize } = e.data as { file: File; chunkSize: number };

  try {
    const sha256 = await createSHA256();
    let offset = 0;
    let lastReport = 0;

    while (offset < file.size) {
      const slice = file.slice(offset, offset + chunkSize);
      const buffer = await slice.arrayBuffer();
      sha256.update(new Uint8Array(buffer));

      offset += chunkSize;

      // 节流，避免过多 postMessage 阻塞主线程渲染
      const now = Date.now();
      if (now - lastReport > 80 || offset >= file.size) {
        const progress = Math.min(1, offset / Math.max(file.size, 1));
        self.postMessage({ status: 'progress', progress });
        lastReport = now;
      }
    }

    const hash = sha256.digest('hex');
    self.postMessage({ status: 'done', hash });
  } catch (err: any) {
    self.postMessage({ status: 'error', error: err?.message || String(err) });
  }
};
