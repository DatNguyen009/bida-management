import { ipcMain } from 'electron'
import { query, queryOne } from '../db'

export function registerSettingsHandlers() {
  ipcMain.handle('settings:getAll', () =>
    query<{ key: string; value: string }>('SELECT * FROM settings')
  )
  ipcMain.handle('settings:set', (_e, key: string, value: string) =>
    queryOne(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2 RETURNING *',
      [key, value]
    )
  )
}
