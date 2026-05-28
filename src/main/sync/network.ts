import { net } from 'electron'
import { syncWorker } from './worker'

export function startNetworkWatcher(): void {
  // Fallback: retry flush every 30 seconds when online
  setInterval(() => {
    if (net.isOnline()) syncWorker.flush()
  }, 30_000)
}
