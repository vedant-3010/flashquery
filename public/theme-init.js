// Runs before first paint so a saved dark theme never flashes light.
// Keep the storage key and logic in sync with src/lib/theme.ts.
;(function () {
  var pref = 'system'
  try {
    pref = localStorage.getItem('askdata:theme') || 'system'
  } catch {
    // Storage blocked (private mode, sandbox): fall back to the system preference.
  }
  var dark =
    pref === 'dark' ||
    (pref !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
})()
