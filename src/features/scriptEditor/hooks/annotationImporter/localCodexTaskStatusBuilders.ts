import {
  formatLocalCodexBatchRange,
  initialLocalCodexTaskStatus,
  summarizeLocalCodexError,
  type LocalCodexRunContext,
  type LocalCodexTaskStatus,
} from './localCodex';

const buildLocalCodexTaskStatus = (
  overrides: Partial<LocalCodexTaskStatus> &
    Pick<
      LocalCodexTaskStatus,
      'phase' | 'title' | 'message' | 'detail' | 'currentChapterNumber' | 'totalChapterCount'
    >
): LocalCodexTaskStatus => ({
  ...initialLocalCodexTaskStatus,
  visible: true,
  isCancelling: false,
  canResume: false,
  resumeLabel: '',
  ...overrides,
});

const buildRunConfigurationDetail = (runContext: LocalCodexRunContext) =>
  `配置 ${runContext.localCodexExecutionSettings.summary} · ${
    runContext.batchPlans.length
  } 批自动分批${
    runContext.skippedChapterCount > 0 ? ` · 跳过 ${runContext.skippedChapterCount} 章空章节` : ''
  }`;

const getTaskDisplayLabel = (task: LocalCodexScriptRewriteTask) =>
  task.chapterTitle || task.chapterId;

const getTaskPriorityLabel = (task: LocalCodexScriptRewriteTask) =>
  task.priority === 'high' ? '高优先级' : '普通优先级';

export const buildLocalCodexProjectSwitchedStatus = ({
  runContext,
  processedChapterCount,
}: {
  runContext: LocalCodexRunContext;
  processedChapterCount: number;
}) =>
  buildLocalCodexTaskStatus({
    phase: 'error',
    title: '本地 Codex 无法继续',
    message: '当前项目已切换，请回到原项目后再继续失败批。',
    detail: '为避免把结果写到错误项目，本次未继续执行。',
    currentChapterNumber: processedChapterCount,
    totalChapterCount: runContext.processableChapterIds.length,
    canResume: true,
    resumeLabel: '从失败批继续',
  });

export const buildLocalCodexInitialRunningStatus = ({
  runContext,
  startBatchIndex,
  processedChapterCount,
}: {
  runContext: LocalCodexRunContext;
  startBatchIndex: number;
  processedChapterCount: number;
}) =>
  buildLocalCodexTaskStatus({
    phase: 'running',
    title: '本地 Codex 后台处理中',
    message:
      startBatchIndex > 0 || processedChapterCount > 0
        ? `已保留前 ${processedChapterCount}/${runContext.processableChapterIds.length} 章结果，正在从第 ${
            startBatchIndex + 1
          }/${runContext.batchPlans.length} 批继续`
        : `已完成 0/${runContext.processableChapterIds.length} 章，准备自动分成 ${runContext.batchPlans.length} 批`,
    detail: buildRunConfigurationDetail(runContext),
    currentChapterNumber: processedChapterCount,
    totalChapterCount: runContext.processableChapterIds.length,
  });

export const buildLocalCodexWaitingForPrerequisiteTasksStatus = ({
  runContext,
  processedChapterCount,
  pendingTasks,
}: {
  runContext: LocalCodexRunContext;
  processedChapterCount: number;
  pendingTasks: LocalCodexScriptRewriteTask[];
}) => {
  const runningTask = pendingTasks.find((task) => task.status === 'running');
  const queuedCount = pendingTasks.filter((task) => task.status === 'queued').length;

  return buildLocalCodexTaskStatus({
    phase: 'queued',
    title: '本地 Codex 排队中',
    message: runningTask
      ? `等待前置任务完成后开始角色标注，当前前面还有 ${pendingTasks.length} 个任务`
      : `等待前置任务完成后开始角色标注，当前前面还有 ${queuedCount} 个排队任务`,
    detail: runningTask
      ? `前置任务：${getTaskDisplayLabel(runningTask)} · ${getTaskPriorityLabel(runningTask)}`
      : `当前配置 ${runContext.localCodexExecutionSettings.summary} · 将在前置任务完成后自动开始`,
    currentChapterNumber: processedChapterCount,
    totalChapterCount: runContext.processableChapterIds.length,
  });
};

export const buildLocalCodexReadyStatus = ({
  runContext,
  processedChapterCount,
}: {
  runContext: LocalCodexRunContext;
  processedChapterCount: number;
}) =>
  buildLocalCodexTaskStatus({
    phase: 'running',
    title: '本地 Codex 后台处理中',
    message: `已完成 ${processedChapterCount}/${runContext.processableChapterIds.length} 章，准备自动分成 ${runContext.batchPlans.length} 批`,
    detail: buildRunConfigurationDetail(runContext),
    currentChapterNumber: processedChapterCount,
    totalChapterCount: runContext.processableChapterIds.length,
  });

export const buildLocalCodexYieldingToHighPriorityStatus = ({
  runContext,
  processedChapterCount,
  pendingTasks,
}: {
  runContext: LocalCodexRunContext;
  processedChapterCount: number;
  pendingTasks: LocalCodexScriptRewriteTask[];
}) => {
  const runningTask = pendingTasks.find((task) => task.status === 'running');

  return buildLocalCodexTaskStatus({
    phase: 'queued',
    title: '本地 Codex 暂时让行',
    message: `检测到高优先级局部重画任务，已在批次边界让行，当前已完成 ${processedChapterCount}/${runContext.processableChapterIds.length} 章`,
    detail: runningTask
      ? `插队任务：${getTaskDisplayLabel(runningTask)} · 高优先级`
      : '高优先级局部重画任务已插入队列，等待其先完成后继续角色标注',
    currentChapterNumber: processedChapterCount,
    totalChapterCount: runContext.processableChapterIds.length,
  });
};

export const buildLocalCodexBatchAttemptStatus = ({
  runContext,
  processedChapterCount,
  batchIndex,
  batchRange,
  batchChapterCount,
  batchLineCount,
  attempt,
  maxAttempts,
}: {
  runContext: LocalCodexRunContext;
  processedChapterCount: number;
  batchIndex: number;
  batchRange: string;
  batchChapterCount: number;
  batchLineCount: number;
  attempt: number;
  maxAttempts: number;
}) =>
  buildLocalCodexTaskStatus({
    phase: 'running',
    title: '本地 Codex 后台处理中',
    message: `已完成 ${processedChapterCount}/${runContext.processableChapterIds.length} 章，正在处理第 ${
      batchIndex + 1
    }/${runContext.batchPlans.length} 批`,
    detail: `${batchRange} · ${batchChapterCount} 章 / ${batchLineCount} 行 · 第 ${attempt}/${maxAttempts} 次尝试 · 配置 ${
      runContext.localCodexExecutionSettings.summary
    }`,
    currentChapterNumber: processedChapterCount,
    totalChapterCount: runContext.processableChapterIds.length,
  });

export const buildLocalCodexBatchRetryStatus = ({
  runContext,
  processedChapterCount,
  batchIndex,
  retryDelayMs,
  batchRange,
  attempt,
  maxAttempts,
  errorMessage,
}: {
  runContext: LocalCodexRunContext;
  processedChapterCount: number;
  batchIndex: number;
  retryDelayMs: number;
  batchRange: string;
  attempt: number;
  maxAttempts: number;
  errorMessage: string;
}) =>
  buildLocalCodexTaskStatus({
    phase: 'running',
    title: '本地 Codex 后台处理中',
    message: `第 ${batchIndex + 1}/${runContext.batchPlans.length} 批短暂断开，${
      Math.round(retryDelayMs / 1000)
    } 秒后自动重试`,
    detail: `${batchRange} · ${summarizeLocalCodexError(errorMessage)} · 已自动重试 ${attempt}/${
      maxAttempts - 1
    } 次`,
    currentChapterNumber: processedChapterCount,
    totalChapterCount: runContext.processableChapterIds.length,
  });

export const buildLocalCodexSuccessStatus = ({
  runContext,
  processedChapterCount,
  totalUpdatedCount,
  totalAssignments,
  totalDurationMs,
}: {
  runContext: LocalCodexRunContext;
  processedChapterCount: number;
  totalUpdatedCount: number;
  totalAssignments: number;
  totalDurationMs: number;
}) => {
  const durationText =
    totalDurationMs > 0 ? `，总耗时 ${(totalDurationMs / 1000).toFixed(1)} 秒` : '';

  return buildLocalCodexTaskStatus({
    phase: 'success',
    title: '本地 Codex 已完成',
    message: `已完成 ${processedChapterCount} 章，更新 ${totalUpdatedCount} 行角色`,
    detail: `共 ${runContext.batchPlans.length} 批，返回 ${totalAssignments} 行，配置 ${
      runContext.localCodexExecutionSettings.summary
    }${
      runContext.skippedChapterCount > 0
        ? `，跳过 ${runContext.skippedChapterCount} 章空章节`
        : ''
    }${durationText}`,
    currentChapterNumber: processedChapterCount,
    totalChapterCount: runContext.processableChapterIds.length,
  });
};

export const buildLocalCodexCancelledStatus = ({
  runContext,
  processedChapterCount,
}: {
  runContext: LocalCodexRunContext;
  processedChapterCount: number;
}) =>
  buildLocalCodexTaskStatus({
    phase: 'cancelled',
    title: '本地 Codex 已取消',
    message:
      processedChapterCount > 0
        ? `已取消，已保留前 ${processedChapterCount}/${runContext.processableChapterIds.length} 章结果`
        : '任务已取消，未写回任何章节',
    detail: `配置 ${runContext.localCodexExecutionSettings.summary} · 共 ${
      runContext.batchPlans.length
    } 批`,
    currentChapterNumber: processedChapterCount,
    totalChapterCount: runContext.processableChapterIds.length,
  });

export const resolveLocalCodexFailureResumeState = ({
  runContext,
  failedBatchIndex,
}: {
  runContext: LocalCodexRunContext;
  failedBatchIndex: number;
}) => {
  const safeFailedBatchIndex = Math.max(
    0,
    Math.min(failedBatchIndex, runContext.batchPlans.length - 1)
  );
  const failedBatchPlan = runContext.batchPlans[safeFailedBatchIndex];
  const failedBatchRange = failedBatchPlan
    ? formatLocalCodexBatchRange(failedBatchPlan)
    : '失败批次';
  const resumeLabel = failedBatchPlan
    ? `从失败批继续（${failedBatchRange}）`
    : '从失败批继续';

  return {
    safeFailedBatchIndex,
    resumeLabel,
  };
};

export const buildLocalCodexFailedStatus = ({
  runContext,
  processedChapterCount,
  errorMessage,
  resumeLabel,
}: {
  runContext: LocalCodexRunContext;
  processedChapterCount: number;
  errorMessage: string;
  resumeLabel: string;
}) => {
  const completedPrefix =
    processedChapterCount > 0
      ? `已顺序处理并写回 ${processedChapterCount}/${runContext.processableChapterIds.length} 章，已完成的章节不会回滚。`
      : '';

  return buildLocalCodexTaskStatus({
    phase: 'error',
    title: '本地 Codex 处理失败',
    message:
      processedChapterCount > 0
        ? `处理到第 ${processedChapterCount + 1}/${runContext.processableChapterIds.length} 章时失败，前面结果已保留`
        : '任务启动后未能完成任何章节',
    detail: `${summarizeLocalCodexError(errorMessage)}${
      completedPrefix ? ` ${completedPrefix}` : ''
    } 可点击“${resumeLabel}”继续剩余批次。`,
    currentChapterNumber: processedChapterCount,
    totalChapterCount: runContext.processableChapterIds.length,
    canResume: true,
    resumeLabel,
  });
};
