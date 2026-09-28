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

/** Hands a data: URL (e.g. a chart PNG) to the browser as a file download. */
export function downloadDataUrl(dataUrl: string, fileName: string): void {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = fileName
  link.click()
}

/** Decodes a base64 data: URL into a Blob (for the clipboard). */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header = '', base64 = ''] = dataUrl.split(',')
  const type = /^data:([^;]+)/.exec(header)?.[1] ?? 'application/octet-stream'
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
  return new Blob([bytes], { type })
}

/** A file name from free text: "Revenue by region" → "revenue_by_region". */
export function fileNameFor(text: string, fallback = 'chart'): string {
  const name = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
  return name || fallback
}
