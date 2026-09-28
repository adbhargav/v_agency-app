import { API_URL } from '../api/client';
import type { DriveFile } from '../types';

/**
 * The best link to open or preview a file. `contentUrl` streams through the app (no Google account needed),
 * so it is preferred over the Drive `webViewLink`. The server returns it as `/api/...`; when the API lives
 * on another origin (VITE_API_URL), rebase it there.
 */
export function fileHref(file: Pick<DriveFile, 'contentUrl' | 'webViewLink'>): string | null {
  const url = file.contentUrl;
  if (url) {
    if (url.startsWith('/api/') && API_URL !== '/api') return API_URL + url.slice(4);
    return url;
  }
  return file.webViewLink ?? null;
}

export function downloadHref(file: Pick<DriveFile, 'contentUrl' | 'webViewLink'>): string | null {
  const href = fileHref(file);
  if (!href || !file.contentUrl) return href;
  return href + (href.includes('?') ? '&' : '?') + 'download=1';
}

export const isImage = (f: Pick<DriveFile, 'mimeType'>) => !!f.mimeType?.startsWith('image/');
export const isVideo = (f: Pick<DriveFile, 'mimeType'>) => !!f.mimeType?.startsWith('video/');
