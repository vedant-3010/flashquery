// Origin Private File System helpers (F-DATA-12): files only this site can read, kept by the
// browser across reloads. Used to keep loaded datasets when the user opts in.

const DIRECTORY = 'flashQuery-files'

/** OPFS with writable file streams (Chrome, Edge, Firefox; recent Safari). */
export function opfsSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.storage?.getDirectory === 'function' &&
    typeof FileSystemFileHandle !== 'undefined' &&
    'createWritable' in FileSystemFileHandle.prototype
  )
}

async function directory(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle(DIRECTORY, { create: true })
}

export async function writeOpfsFile(name: string, data: Blob): Promise<void> {
  const handle = await (await directory()).getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  try {
    await data.stream().pipeTo(writable)
  } catch (error) {
    await writable.abort().catch(() => undefined)
    throw error
  }
}

/** The stored file (read lazily, like an uploaded File). */
export async function readOpfsFile(name: string): Promise<File> {
  return (await (await directory()).getFileHandle(name)).getFile()
}

export async function removeOpfsFile(name: string): Promise<void> {
  await (await directory()).removeEntry(name).catch(() => undefined)
}

export async function clearOpfs(): Promise<void> {
  if (!opfsSupported()) return
  const root = await navigator.storage.getDirectory()
  await root.removeEntry(DIRECTORY, { recursive: true }).catch(() => undefined)
}
