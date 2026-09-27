/** Hands bytes to the browser as a file download. */
export function downloadBytes(bytes: Uint8Array, fileName: string, type: string): void {
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  // Let the download start before the URL is revoked.
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
