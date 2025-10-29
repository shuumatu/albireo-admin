<template>
    <n-upload
        directory-dnd
        multiple
        :custom-request="handleCustomRequest"
>
    <n-upload-dragger>
      <div style="margin-bottom: 12px">
        <n-icon size="48" :depth="3">
          <ArchiveIcon />
        </n-icon>
      </div>
      <n-text style="font-size: 16px">
        点击或者拖动文件到该区域来上传
      </n-text>
      <n-p depth="3" style="margin: 8px 0 0 0">
        ❤
      </n-p>
    </n-upload-dragger>
    </n-upload>
</template>

<script setup lang="ts">
import { ArchiveOutline as ArchiveIcon } from '@vicons/ionicons5'
import {initiateUpload,getParts,getUploadUrl,completeUpload, completeDirectUpload} from '../api/upload'
import type { UploadCustomRequestOptions } from 'naive-ui'
import { NUpload } from 'naive-ui'




function computeHash(file: File,chunkSize:number=4*1024*1024): Promise<string> {
    return new Promise((resolve, reject) => {
    // 创建 Worker
    const worker = new Worker(new URL("../workers/fileHashWorker.ts", import.meta.url), {
      type: "module",
    });

    //{ status: "progress", progress } → 更新进度条。
    //{ status: "done", hash } → 最终计算完成，保存哈希。
    //{ status: "error", error } → 出错时打印错误。
    worker.onmessage = (e) => {
    const { status, hash, progress, error } = e.data;
    if (status === "progress") {
      // 可选：如果你要同步 NaiveUI 的进度，可以在这里透传
      let progressPercentage = Math.min(parseFloat((progress * 100).toFixed(2)),100) // 转换为百分比并保留两位小数
      console.log("计算进度", progressPercentage + "%");
    } else if (status === "done") {
      resolve(hash);
      worker.terminate();

    } else if (status === "error") {
      reject(error);
      worker.terminate();

    }
  };

  worker.postMessage({ file, chunkSize});
  });
};

// 分片切分
function createParts(file: File, partSize: number) {
  const parts: Array<{ partNumber: number; start: number; end: number }> = []
  let partNumber = 1
  for (let offset = 0; offset < file.size; offset += partSize, partNumber++) {
    parts.push({
      partNumber,
      start: offset,
      end: Math.min(offset + partSize, file.size)
    })
  }
  return parts
}

    
async function handleCustomRequest({file,onProgress,onFinish,onError}:UploadCustomRequestOptions){
    try{
      
        if (!file.file) {
        onError?.();
        return;
        }

        const fileHash=await computeHash(file.file);
        console.log("文件 hash:", fileHash);
        // TODO: 接下来走你的分片上传逻辑
        // 1. 调用 /multipart/initiate
        const init=await initiateUpload({
            fileName:file.name,
            fileType:file.type?? "",
            fileSize:file.file.size,
            fileHash:fileHash
        })
        if(init.alreadyExists){
            console.log("文件已存在，无需上传");
            onProgress?.({ percent: 100 });
            onFinish();
            return;
        }else if(init.directUpload&&init.url){
            //TODO: 直接上传
            const resp=await fetch(init.url, { method: 'PUT', body: file.file })
            if (!resp.ok) throw new Error('上传失败')
            completeDirectUpload({fileHash,objectKey:init.key,fileType:file.type?? ""})
            onProgress?.({ percent: 100 });
            onFinish();
            return;
        }
        // 2. 调用 /multipart/list-parts
        const parts=createParts(file.file,init.partSize);

        const listed=await getParts({key:init.key,uploadId:init.uploadId});
        const uploadedSet = new Set<number>(listed.parts.map(p => p.partNumber))
        const totalParts = parts.length
        let doneCount = uploadedSet.size
        onProgress?.({ percent: Math.floor((doneCount / totalParts) * 100) })

        // 3. 分片上传 (记得在上传时调用 onProgress({ percent }))
        //for循环上传
        // const uploadedAll: Array<{ partNumber: number; eTag: string }> = []
        // uploadedAll.push(...listed.parts.map(p => ({ partNumber: p.partNumber, eTag: p.eTag })))

        // for (const part of parts) {
        //   if (uploadedSet.has(part.partNumber)) continue
        //   const { url } = await getUploadUrl({ key: init.key, uploadId: init.uploadId, partNumber: part.partNumber })
        //   const blob = file.file.slice(part.start, part.end)
        //   const resp = await fetch(url, { method: 'PUT', body: blob, headers: file.type ?{ 'Content-Type': file.type }:undefined })
        //   if (!resp.ok) throw new Error(`Part ${part.partNumber} upload failed`)
        //   const etagHeader = resp.headers.get('etag') || ''
        //   const eTag = etagHeader.replaceAll('"','')
        //   uploadedAll.push({ partNumber: part.partNumber, eTag })
        //   doneCount++
        //   onProgress?.({ percent: Math.min(99, Math.floor((doneCount / totalParts) * 100)) })
        // }

        // 3. 分片上传 (使用并发池)
        const uploadedAll = await uploadWithConcurrency(
        parts,
        file.file,
        init.key,
        init.uploadId,
        uploadedSet,
        8, // 并发数，可调节
        onProgress
        );

        // 4. 调用 /multipart/complete
        uploadedAll.sort((a,b)=>a.partNumber-b.partNumber)
        await completeUpload({ hash: fileHash, key: init.key, uploadId: init.uploadId, fileType: file.type?? "", parts: uploadedAll })

        onProgress?.({ percent: 100 })
        onFinish();

    }catch (err) {
    console.error("哈希计算失败", err);
    onError();
  }

}

// 并发池上传函数
async function uploadWithConcurrency(
  parts: { partNumber: number; start: number; end: number }[],
  file: File,
  key: string,
  uploadId: string,
  uploadedSet: Set<number>,
  concurrency: number,
  onProgress?: (info: { percent: number }) => void
) {
  const uploadedAll: Array<{ partNumber: number; eTag: string }> = [];
  const totalParts = parts.length;
  let doneCount = uploadedSet.size;

  // 已有的分片先放进去
  uploadedAll.push(
    ...[...uploadedSet].map((partNumber) => ({
      partNumber,
      eTag: "", // 如果你从后端 getParts 返回了 etag，可以在外面传入
    }))
  );

  let i = 0;
  const run = async () => {
    while (i < parts.length) {
      const part = parts[i++];
      if (uploadedSet.has(part.partNumber)) continue;

      const { url } = await getUploadUrl({
        key,
        uploadId,
        partNumber: part.partNumber,
      });

      const blob = file.slice(part.start, part.end);
      const resp = await fetch(url, {
        method: "PUT",
        body: blob,
        headers: file.type ? { "Content-Type": file.type } : undefined,
      });
      if (!resp.ok) throw new Error(`Part ${part.partNumber} upload failed`);

      const etagHeader = resp.headers.get("etag") || "";
      const eTag = etagHeader.replaceAll('"', "");
      uploadedAll.push({ partNumber: part.partNumber, eTag });

      doneCount++;
      onProgress?.({
        percent: Math.min(99, Math.floor((doneCount / totalParts) * 100)),
      });
    }
  };

  // 创建并发池
  const pool = [];
  for (let j = 0; j < concurrency && j < parts.length; j++) {
    pool.push(run());
  }
  await Promise.all(pool);

  return uploadedAll;
}





</script>