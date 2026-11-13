import type { Project } from '../model/project.ts'

/** A file name from the CV's name: "Maya Rahman CV" becomes "Maya_Rahman_CV". */
export function fileBase(project: Project): string {
  const base = (project.name || project.cv.name || 'CV').replace(/[\\/:*?"<>|]+/g, ' ').trim().replace(/\s+/g, '_')
  return /cv|resume/i.test(base) ? base : `${base}_CV`
}

/** Hands a made file to the browser to save. */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  // The browser needs the address to stay good until it has started on the file.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** Whether this device can pass a file to another app (the phone's share sheet). */
export function canShare(blob: Blob, name: string): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([blob], name, { type: blob.type })] })
  } catch {
    return false
  }
}

export async function shareBlob(blob: Blob, name: string): Promise<void> {
  await navigator.share({ files: [new File([blob], name, { type: blob.type })], title: name })
}
