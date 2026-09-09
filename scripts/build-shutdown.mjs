// Vinext exits immediately after prerendering. On Windows + Node 24 this can
// race pending native close callbacks (UV_HANDLE_CLOSING). Delay only a successful
// CLI exit so callbacks drain; all failure exit codes pass through unchanged.
if (process.platform === 'win32') {
  const originalExit = process.exit.bind(process);
  process.exit = (code = 0) => {
    if (code !== 0) return originalExit(code);
    setTimeout(() => originalExit(code), 1000);
  };
}
