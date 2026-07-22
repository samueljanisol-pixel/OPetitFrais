import { executeScheduledFtpSync } from '@/lib/sync/scheduledFtpSync'
import type { AutomatedTaskRow, TaskExecutionOptions, TaskExecutionResult } from '../types'

export async function executeScheduledFtpSyncTask(
  _task: AutomatedTaskRow,
  _options?: TaskExecutionOptions,
): Promise<TaskExecutionResult> {
  const result = await executeScheduledFtpSync()

  return {
    ok: result.ok,
    message: result.message,
    stats: {
      processedDays: result.processedDays,
      lastSyncedDate: result.lastSyncedDate,
      syncRunId: result.syncRunId,
      insertError: result.insertError ?? null,
    },
  }
}
