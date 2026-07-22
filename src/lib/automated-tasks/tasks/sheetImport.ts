import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { fetchSheetJsonFromGoogle } from '@/features/sheet-import/fetchSheetJsonFromGoogle'
import { parseSheetJsonToRows } from '@/features/sheet-import/mapSheetRow'
import { applySheetImport } from '@/features/sheet-import/applySheetImport'
import {
  importFieldsFromTaskConfig,
  type SheetImportFields,
} from '@/features/sheet-import/sheet-import-fields'
import type { AutomatedTaskRow, TaskExecutionOptions, TaskExecutionResult } from '../types'

function fieldsFromConfig(config: AutomatedTaskRow['config']): SheetImportFields {
  return importFieldsFromTaskConfig(config)
}

async function persistImportFingerprint(
  taskId: string,
  config: AutomatedTaskRow['config'],
  contentHash: string,
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient()
  const now = new Date().toISOString()
  await supabase
    .from('automated_tasks')
    .update({
      config: {
        ...config,
        lastImportContentHash: contentHash,
        lastImportAt: now,
      },
      updated_at: now,
    } as never)
    .eq('id', taskId)
}

export async function executeScheduledSheetImport(
  task: AutomatedTaskRow,
  options?: TaskExecutionOptions,
): Promise<TaskExecutionResult> {
  const force = options?.force === true
  const supabase = createSupabaseServiceRoleClient()
  const { json, contentHash } = await fetchSheetJsonFromGoogle()

  const previousHash =
    typeof task.config.lastImportContentHash === 'string' && task.config.lastImportContentHash.length > 0
      ? task.config.lastImportContentHash
      : null

  if (!force && previousHash !== null && previousHash === contentHash) {
    return {
      ok: true,
      message: 'Google Sheet inchangé depuis le dernier import — aucune action.',
      stats: {
        skippedUnchanged: true,
        contentHash,
        previousHash,
      },
    }
  }

  const { rows, errors: parseErrs } = parseSheetJsonToRows(json)

  if (rows.length === 0) {
    const msg =
      parseErrs.length > 0
        ? `Aucune ligne valide. ${parseErrs.slice(0, 5).join(' ')}`
        : 'Tableau JSON vide.'
    return {
      ok: false,
      message: msg,
      stats: { parseErrors: parseErrs.length, created: 0, updated: 0, skipped: 0, contentHash },
    }
  }

  const fields = fieldsFromConfig(task.config)
  const result = await applySheetImport(supabase, rows, fields)
  const allErrs = [...parseErrs, ...result.errors]
  const ok = allErrs.length === 0 || result.created > 0 || result.updated > 0

  if (ok) {
    await persistImportFingerprint(task.id, task.config, contentHash)
  }

  const messageParts = [
    `Créés : ${result.created}`,
    `Modifiés : ${result.updated}`,
    result.skipped > 0 ? `Ignorés : ${result.skipped}` : null,
    allErrs.length > 0 ? `Erreurs : ${allErrs.length}` : null,
  ].filter(Boolean)

  return {
    ok,
    message: messageParts.join(' · '),
    stats: {
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      parseErrors: parseErrs.length,
      applyErrors: result.errors.length,
      errorSamples: allErrs.slice(0, 10),
      contentHash,
      previousHash,
    },
  }
}
