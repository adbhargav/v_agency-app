import { ApiError, http } from './client';
import type { DriveFile } from '../types';

export interface UploadParams {
  projectId: string;
  folderId?: string | null;
  taskId?: string | null;
  file: File;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** 'requirement' stores the file in the project's requirements folder (client briefs). */
  purpose?: 'requirement';
}

/**
 * Three-step Google Drive resumable upload:
 * 1. POST /files/upload-session → { uploadUrl, uploadToken }
 * 2. PUT the raw bytes straight to Google (XHR for progress events). Google replies with the Drive file JSON (`id`).
 * 3. POST /files/complete { uploadToken, driveFileId } → { file }
 */
export async function uploadFile({ projectId, folderId, taskId, file, onProgress, signal, purpose }: UploadParams): Promise<DriveFile> {
  const { uploadUrl, uploadToken } = await http.post<{ uploadUrl: string; uploadToken: string }>('/files/upload-session', {
    projectId,
    folderId: folderId || undefined,
    taskId: taskId || undefined,
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    purpose,
  });

  const driveFileId = await new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(xhr.responseText) as { id?: string };
          if (body.id) return resolve(body.id);
        } catch {
          /* fallthrough */
        }
        reject(new ApiError(xhr.status, 'Upload finished but Drive did not return a file id.', 'INTERNAL'));
      } else {
        reject(new ApiError(xhr.status, `Upload failed (${xhr.status})`, 'INTERNAL'));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, 'Upload failed — network error.', 'NETWORK'));
    xhr.onabort = () => reject(new ApiError(0, 'Upload cancelled.', 'ABORTED'));
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(file);
  });

  onProgress?.(1);
  const { file: saved } = await http.post<{ file: DriveFile }>('/files/complete', { uploadToken, driveFileId });
  return saved;
}
