import styles from './index.module.css';

interface WorkerStatusProps {
  workerStatus: {
    isWorking: boolean;
    hashProgress: number;
    chunksProgress: number;
    samplingEnabled?: boolean;
    error: string | null;
  };
}

/**
 * Worker处理进度组件
 */
const WorkerProgress: React.FC<WorkerStatusProps> = ({ workerStatus }) => {
  if (!workerStatus.isWorking) return null;

  return (
    <div className={styles['worker-container']}>
      {workerStatus.hashProgress > 0 && (
        <div>
          <div className={styles['small-progress-bar']}>
            <div className={styles['hash-progress-bar']} style={{ width: `${workerStatus.hashProgress}%` }} />
          </div>
          <div className={styles['progress-labels']}>
            <span className={styles['progress-label']}>文件哈希计算</span>
            <span className={styles['progress-label']}>
              {workerStatus.hashProgress}%{workerStatus.samplingEnabled && ' (采样模式)'}
            </span>
          </div>
        </div>
      )}

      {workerStatus.chunksProgress > 0 && (
        <div style={{ marginTop: '10px' }}>
          <div className={styles['small-progress-bar']}>
            <div className={styles['chunks-progress-bar']} style={{ width: `${workerStatus.chunksProgress}%` }} />
          </div>
          <div className={styles['progress-labels']}>
            <span className={styles['progress-label']}>文件分片处理</span>
            <span className={styles['progress-label']}>{workerStatus.chunksProgress}%</span>
          </div>
        </div>
      )}

      {workerStatus.error && <div className={styles['error-message']}>Worker错误: {workerStatus.error}</div>}
    </div>
  );
};

export default WorkerProgress;
