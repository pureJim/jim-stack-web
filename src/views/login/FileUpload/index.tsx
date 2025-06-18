import { useCallback, useRef, useState } from 'react';

import useFileUploadWorker from '@/common/hooks/useFileUploadWorker';
import { request } from '@/services/request';

import FileInfo from './FileInfo';
import ProgressBar from './ProgressBar';
import WorkerProgress from './WorkerProgress';

import styles from './index.module.css';

/**
 * 配置常量
 */
const CONFIG = {
  CHUNK_SIZE: 4 * 1024 * 1024, // 每个分片大小为4MB
  CONCURRENCY: 4, // 并发上传分片数量
  MAX_RETRIES: 3, // 单个分片上传失败后的最大重试次数
};

/**
 * 上传分片接口
 */
interface IUploadChunk {
  index: number;
  blob: Blob;
}

/**
 * 文件上传组件
 * 支持分片上传、断点续传、并发控制、进度跟踪
 * 使用Web Worker优化文件哈希计算和分片处理
 */
const FileUpload: React.FC = () => {
  // 状态管理
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number; type: string } | null>(null);
  const uploadingRef = useRef(false); // 防止重复上传

  // 使用文件上传Worker
  const { status: workerStatus, calculateFileHash, createFileChunks, isWorkerSupported } = useFileUploadWorker();

  /**
   * 处理文件选择事件
   */
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
    setUploadProgress(0);
    setStatusMessage('');
    uploadingRef.current = false;

    // 设置文件信息用于显示
    if (selectedFile) {
      setFileInfo({
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type,
      });
    } else {
      setFileInfo(null);
    }
  }, []);

  /**
   * 上传单个分片
   */
  const uploadChunk = useCallback(
    async (
      chunk: IUploadChunk,
      fileHash: string,
      fileName: string,
      chunkLoaded: number[],
      updateProgress: (diff: number) => void,
      attempt: number = 1,
    ): Promise<void> => {
      const { index, blob } = chunk;
      const formData = new FormData();
      formData.append('chunk', blob);
      formData.append('fileHash', fileHash);
      formData.append('chunkIndex', String(index));
      formData.append('fileName', fileName);

      try {
        const uploadRst = await request<API.IRestInfo>('/api/file/upload', {
          method: 'POST',
          data: formData,
          headers: {
            'X-File-Hash': fileHash,
            'X-Chunk-Index': String(index),
          },
          withCredentials: true,
          onUploadProgress: (event) => {
            // HTTP 进度事件会多次触发，需要计算每次的增量
            const currentLoaded = event.loaded;
            const prevLoaded = chunkLoaded[index] || 0;
            const increment = currentLoaded - prevLoaded;

            if (increment > 0) {
              updateProgress(increment);
              chunkLoaded[index] = currentLoaded;
            }
          },
        });

        if (uploadRst.code !== 0) {
          throw new Error(uploadRst.msg);
        }

        // 确保计算正确的完成字节数
        const finalDiff = blob.size - chunkLoaded[index];
        if (finalDiff > 0) {
          updateProgress(finalDiff);
        }
        chunkLoaded[index] = blob.size;
      } catch (err) {
        console.error(`分片 ${index} 上传失败, 尝试次数: ${attempt}`, err);

        if (attempt < CONFIG.MAX_RETRIES) {
          // 重试当前分片
          await uploadChunk(chunk, fileHash, fileName, chunkLoaded, updateProgress, attempt + 1);
        } else {
          throw new Error(`分片 ${index} 上传失败，已重试${attempt}次`);
        }
      }
    },
    [],
  );

  /**
   * 并发控制上传分片
   */
  const uploadChunksWithConcurrency = useCallback(
    async (
      chunks: IUploadChunk[],
      fileHash: string,
      fileName: string,
      chunkLoaded: number[],
      updateProgress: (diff: number) => void,
    ): Promise<void> => {
      return new Promise<void>((resolve, reject) => {
        let currentIndex = 0;
        let activeCount = 0;
        let completedCount = 0;

        // 声明scheduleNext函数
        let scheduleNext: () => void = () => {};

        // 创建内部函数来处理单个分片的上传
        function processChunk(chunk: IUploadChunk) {
          activeCount++;

          // 显示当前进度状态
          setStatusMessage(`正在上传第 ${chunk.index + 1}/${chunks.length} 个分片...`);

          // 上传当前分片
          uploadChunk(chunk, fileHash, fileName, chunkLoaded, updateProgress)
            .then(() => {
              activeCount--;
              completedCount++;
              // 更新状态，显示完成进度
              setStatusMessage(`已完成 ${completedCount}/${chunks.length} 个分片上传`);
              // 调度下一个分片
              scheduleNext();
              return true; // 添加明确的返回值
            })
            .catch((error) => {
              reject(error instanceof Error ? error : new Error(String(error)));
            });
        }

        // 定义调度下一个分片上传的函数
        scheduleNext = () => {
          // 所有分片上传完成
          if (completedCount === chunks.length) {
            resolve();
            return;
          }

          // 在并发限制内启动新的上传任务
          while (activeCount < CONFIG.CONCURRENCY && currentIndex < chunks.length) {
            processChunk(chunks[currentIndex++]);
          }
        };

        // 开始调度上传
        scheduleNext();
      });
    },
    [uploadChunk],
  );

  /**
   * 处理文件上传的主函数
   */
  const handleUpload = useCallback(async () => {
    if (!file || uploadingRef.current) {
      return;
    }

    uploadingRef.current = true;
    setStatusMessage('上传准备中...');

    try {
      // 1. 使用Web Worker计算文件哈希标识
      setStatusMessage('计算文件哈希...');

      // 根据文件大小优化哈希计算
      let hashChunkSize = 2 * 1024 * 1024; // 默认2MB

      if (file.size > 1024 * 1024 * 1024) {
        // 如果文件大于1GB
        hashChunkSize = 8 * 1024 * 1024; // 使用8MB分片
      } else if (file.size > 100 * 1024 * 1024) {
        // 如果文件大于100MB
        hashChunkSize = 4 * 1024 * 1024; // 使用4MB分片
      }

      const hashOptions = { hashChunkSize };

      const fileHash = await calculateFileHash(file, hashOptions);

      // 2. 获取已上传的分片索引列表（断点续传）
      type CheckResponseType = {
        fileExists: boolean;
        uploadedChunks: number[];
      };

      const checkResponse = await request<API.IRestModal<CheckResponseType>>('/api/file/check', {
        method: 'GET',
        params: {
          fileHash,
          fileName: file.name,
        },
      });

      if (checkResponse.code !== 0) {
        setStatusMessage(String(checkResponse.msg));
        return;
      }

      if (checkResponse.data.fileExists) {
        setStatusMessage('文件已存在，请勿重复上传');
        setUploadProgress(100);
        return;
      }

      const uploadedChunks: number[] = checkResponse.data.uploadedChunks || [];

      // 3. 使用Web Worker创建文件分片
      setStatusMessage('准备文件分片...');

      // 根据文件大小优化分片处理
      const chunkOptions = {
        reportInterval: file.size > 500 * 1024 * 1024 ? 20 : 10, // 大文件降低报告频率减少UI更新开销
      };

      const chunks = await createFileChunks(file, CONFIG.CHUNK_SIZE, chunkOptions);
      const totalChunks = chunks.length;

      console.log(`文件总分片数: ${totalChunks}，已上传: ${uploadedChunks.toString()}`);

      // 4. 过滤出尚未上传的分片
      const chunksToUpload = chunks.filter((chunk) => !uploadedChunks.includes(chunk.index));

      if (chunksToUpload.length === 0) {
        setStatusMessage('所有分片已上传，正在合并...');
        setUploadProgress(99);
      } else {
        // 5. 上传未完成的分片
        // 初始化进度追踪
        const totalSize = file.size;
        let uploadedBytes = 0;

        // 计算已上传的字节数
        uploadedBytes = uploadedChunks.reduce((acc, index) => {
          const chunk = chunks.find((c) => c.index === index);
          return acc + (chunk ? chunk.blob.size : 0);
        }, 0);

        // 初始化分片加载进度
        const chunkLoaded: number[] = [];
        chunks.forEach((chunk) => {
          // 对已上传的分片，设置为完整大小
          chunkLoaded[chunk.index] = uploadedChunks.includes(chunk.index) ? chunk.blob.size : 0;
        });

        // 更新进度的函数
        const updateProgress = (diffBytes: number) => {
          uploadedBytes += diffBytes;
          const percent = (uploadedBytes / totalSize) * 100;
          setUploadProgress(Math.min(99, percent)); // 留1%给合并操作
        };

        // 初始显示已上传的进度
        updateProgress(0);

        // 显示已经上传的分片信息
        if (uploadedChunks.length > 0) {
          setStatusMessage(`检测到${uploadedChunks.length}个分片已上传，继续上传剩余${chunksToUpload.length}个分片...`);
        }

        // 6. 并发上传所有分片
        await uploadChunksWithConcurrency(chunksToUpload, fileHash, file.name, chunkLoaded, updateProgress);
      }

      // 7. 所有分片上传完成，请求服务器合并文件
      setStatusMessage('分片上传完成，通知服务器合并...');
      await request<API.IRestInfo>('/api/file/merge', {
        method: 'POST',
        data: {
          fileName: file.name,
          fileHash,
          totalChunks,
        },
      });

      setStatusMessage('上传完成，文件合并成功！');
      setUploadProgress(100);
      alert('文件上传成功！');
    } catch (err: unknown) {
      console.error('上传失败:', err);
      setStatusMessage(`❌ 上传失败: ${(err as Error).message}`);
    } finally {
      uploadingRef.current = false;
    }
  }, [file, calculateFileHash, createFileChunks, uploadChunksWithConcurrency]);

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>大文件上传（支持断点续传 + Web Worker优化）</h2>

      {!isWorkerSupported && (
        <div className={styles['warning-message']}>⚠️ 您的浏览器不支持Web Worker，大文件处理可能会导致页面卡顿</div>
      )}

      <div className={styles['file-input-container']}>
        <input type="file" onChange={handleFileChange} className={styles['file-input']} />
        <button
          onClick={() => {
            handleUpload();
          }}
          disabled={!file || uploadingRef.current}
          className={`${styles['upload-button']} ${!file || uploadingRef.current ? styles.disabled : styles.enabled}`}
        >
          {uploadingRef.current ? '上传中...' : '开始上传'}
        </button>
      </div>

      {/* 文件信息展示 */}
      <FileInfo file={fileInfo} />

      {/* 进度条和状态显示 */}
      {(uploadProgress > 0 || workerStatus.isWorking || statusMessage) && (
        <div className={styles['progress-container']}>
          <ProgressBar progress={uploadProgress} />

          {/* 状态消息 */}
          <div className={styles['status-message']}>
            <div>{statusMessage}</div>
          </div>

          {/* Worker处理进度 */}
          <WorkerProgress workerStatus={workerStatus} />
        </div>
      )}
    </div>
  );
};

export default FileUpload;
