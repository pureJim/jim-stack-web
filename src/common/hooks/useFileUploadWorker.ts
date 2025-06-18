import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  IUploadChunk,
  IWorkerMessage,
  IWorkerOptions,
  IWorkerStatus,
  PromiseRejectType,
  PromiseResolveType,
} from '@/types/file-upload';

/**
 * 文件上传Worker钩子
 * 提供文件哈希计算和分片创建的高性能处理能力
 */
export default function useFileUploadWorker() {
  // Worker状态
  const [status, setStatus] = useState<IWorkerStatus>({
    hashProgress: 0,
    chunksProgress: 0,
    isWorking: false,
    error: null,
  });

  // Worker引用
  const workerRef = useRef<Worker | null>(null);

  // 等待中的Promise对象
  const pendingPromises = useRef<
    Record<
      string,
      {
        resolve: PromiseResolveType<unknown>;
        reject: PromiseRejectType;
      }
    >
  >({});
  /**
   * 检查浏览器是否支持Web Worker
   */
  const isWorkerSupported = (): boolean => {
    return typeof Worker !== 'undefined';
  };

  /**
   * 创建Worker实例
   */
  const createWorker = useCallback((): Worker => {
    return new Worker(new URL('../../workers/fileUploadWorker.ts', import.meta.url), {
      type: 'module',
    });
  }, []);

  /**
   * 解析指定操作的Promise
   */
  const resolvePromise = (operation: string, value: unknown): void => {
    if (pendingPromises.current[operation]) {
      pendingPromises.current[operation].resolve(value);
      delete pendingPromises.current[operation];
    }
  };

  /**
   * 拒绝所有等待中的Promise
   */
  const rejectAllPromises = (reason: string): void => {
    Object.keys(pendingPromises.current).forEach((key) => {
      pendingPromises.current[key].reject(new Error(reason));
      delete pendingPromises.current[key];
    });
  };

  /**
   * 更新哈希计算进度
   */
  const updateHashProgress = useCallback((data: IWorkerMessage): void => {
    setStatus((prev) => ({
      ...prev,
      hashProgress: data.progress || 0,
      samplingEnabled: data.samplingEnabled,
    }));
  }, []);

  /**
   * 更新分片创建进度
   */
  const updateChunksProgress = useCallback((data: IWorkerMessage): void => {
    setStatus((prev) => ({
      ...prev,
      chunksProgress: data.progress || 0,
    }));
  }, []);

  /**
   * 完成哈希计算
   */
  const completeHashCalculation = useCallback((data: IWorkerMessage): void => {
    setStatus((prev) => ({
      ...prev,
      isWorking: false,
      hashProgress: 100,
    }));

    resolvePromise('calculateHash', data.hash);
  }, []);

  /**
   * 完成分片创建
   */
  const completeChunksCreation = useCallback((data: IWorkerMessage): void => {
    setStatus((prev) => ({
      ...prev,
      isWorking: false,
      chunksProgress: 100,
    }));

    resolvePromise('createChunks', data.chunks);
  }, []);

  /**
   * 处理Worker错误
   */
  const handleWorkerError = useCallback((error: unknown): void => {
    let errorMessage = '未知错误';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }

    setStatus((prev) => ({
      ...prev,
      isWorking: false,
      error: errorMessage,
    }));

    // 拒绝所有等待中的Promise
    rejectAllPromises(errorMessage);
  }, []);

  /**
   * 计算文件哈希
   * @param file 要计算哈希的文件
   * @param options 可选的处理选项
   * @returns 文件哈希值的Promise
   */
  const calculateFileHash = (file: File, options?: IWorkerOptions): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker未初始化'));
        return;
      }

      // 重置状态
      setStatus((prev) => ({
        ...prev,
        isWorking: true,
        hashProgress: 0,
        error: null,
        samplingEnabled: false,
      }));

      // 保存Promise
      pendingPromises.current['calculateHash'] = {
        resolve: resolve as PromiseResolveType<unknown>,
        reject,
      };

      // 发送消息给Worker
      workerRef.current.postMessage({
        type: 'CALCULATE_HASH',
        file,
        options,
      });
    });
  };

  /**
   * 创建文件分片
   * @param file 要分片的文件
   * @param chunkSize 每个分片的大小
   * @param options 可选的处理选项
   * @returns 文件分片数组的Promise
   */
  const createFileChunks = (file: File, chunkSize: number, options?: IWorkerOptions): Promise<IUploadChunk[]> => {
    return new Promise<IUploadChunk[]>((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker未初始化'));
        return;
      }

      // 重置状态
      setStatus((prev) => ({
        ...prev,
        isWorking: true,
        chunksProgress: 0,
        error: null,
      }));

      // 保存Promise
      pendingPromises.current['createChunks'] = {
        resolve: resolve as PromiseResolveType<unknown>,
        reject,
      };

      // 发送消息给Worker
      workerRef.current.postMessage({
        type: 'CREATE_CHUNKS',
        file,
        chunkSize,
        options,
      });
    });
  };

  /**
   * 处理Worker消息
   */
  const handleWorkerMessage = useCallback(
    (event: MessageEvent<IWorkerMessage>): void => {
      const { type } = event.data;

      switch (type) {
        case 'HASH_PROGRESS':
          updateHashProgress(event.data);
          break;

        case 'CHUNKS_PROGRESS':
          updateChunksProgress(event.data);
          break;

        case 'HASH_COMPLETE':
          completeHashCalculation(event.data);
          break;

        case 'CHUNKS_CREATED':
          completeChunksCreation(event.data);
          break;

        case 'ERROR':
          handleWorkerError(event.data.error);
          break;

        default:
          break;
      }
    },
    [updateHashProgress, updateChunksProgress, completeHashCalculation, completeChunksCreation, handleWorkerError],
  );

  /**
   * 设置Worker事件处理器
   */
  const setupWorkerEventHandlers = useCallback(
    (worker: Worker): void => {
      worker.onmessage = handleWorkerMessage;
      worker.onerror = (error) => handleWorkerError(error);
    },
    [handleWorkerError, handleWorkerMessage],
  );

  /**
   * 初始化Worker
   */
  useEffect(() => {
    if (!isWorkerSupported()) {
      setStatus((prev) => ({
        ...prev,
        error: '当前浏览器不支持Web Worker',
      }));
      return () => {};
    }

    try {
      const worker = createWorker();
      setupWorkerEventHandlers(worker);
      workerRef.current = worker;
    } catch (error) {
      handleWorkerError(error);
    }

    // 组件卸载时清理
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [createWorker, handleWorkerError, setupWorkerEventHandlers]);

  return {
    status,
    calculateFileHash,
    createFileChunks,
    isWorkerSupported: isWorkerSupported(),
  };
}
