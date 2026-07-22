import type { AutomatedTaskCode, TaskExecutor } from './types'
import { executeScheduledSheetImport } from './tasks/sheetImport'
import { executeScheduledFtpSyncTask } from './tasks/ftpSync'

const executors: Record<AutomatedTaskCode, TaskExecutor> = {
  sheet_import: executeScheduledSheetImport,
  ftp_sync: executeScheduledFtpSyncTask,
}

export function getTaskExecutor(code: string): TaskExecutor | null {
  if (code in executors) {
    return executors[code as AutomatedTaskCode]
  }
  return null
}

export function isKnownTaskCode(code: string): code is AutomatedTaskCode {
  return code in executors
}
