/// <reference lib="webworker" />
import { createSHA256 } from 'hash-wasm';

self.onmessage = async (e) => {
  const { file, chunkSize } = e.data as { file: File; chunkSize: number };

  try {
    const sha256 = await createSHA256(); // 创建增量计算器
    let offset = 0;

    while (offset < file.size) {
      //file.slice(start, end) → 截取文件的一部分（Blob）。
      const slice = file.slice(offset, offset + chunkSize);
      //slice.arrayBuffer() → 把这一块转成 ArrayBuffer。
      const buffer = await slice.arrayBuffer();
      //sha256.update() → 把这一块数据加入哈希计算。
      sha256.update(new Uint8Array(buffer));

      offset += chunkSize;
      //每次处理一块，就发一条消息给主线程，告诉它当前进度（百分比）。
      self.postMessage({ status: 'progress', progress: offset / file.size });
    }

    const hash = sha256.digest('hex'); // 得到 16进制字符串
    self.postMessage({ status: 'done', hash });
  } catch (err: any) {
    self.postMessage({ status: 'error', error: err.message });
  }
};
