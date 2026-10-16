import { _electron as electron, type ElectronApplication } from 'playwright'

/**
 * Starts the real app with its window hidden. Runs the build in `out/` by default; set LEDGER_APP_PATH to the
 * executable of a packaged app to test that instead.
 */
export function launchApp(env: Record<string, string>): Promise<ElectronApplication> {
  // ELECTRON_RUN_AS_NODE makes Electron behave as plain Node; it is set when tests run inside another Electron app.
  const { ELECTRON_RUN_AS_NODE: _ignored, ...inherited } = process.env
  const packaged = process.env.LEDGER_APP_PATH
  return electron.launch({
    ...(packaged ? { executablePath: packaged, args: [] } : { args: ['.'] }),
    env: { ...(inherited as Record<string, string>), ...env, LEDGER_HIDE_WINDOW: '1' }
  })
}
