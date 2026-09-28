import { google } from 'googleapis';
import { config } from '../config.js';
import { getServiceAuth } from './google.js';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const FILE_FIELDS = 'id, name, mimeType, size, webViewLink, parents';

const drive = () => google.drive({ version: 'v3', auth: getServiceAuth() });

export async function createFolder(name, parentDriveId = config.google.sharedDriveId) {
  const { data } = await drive().files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: [parentDriveId] },
    fields: 'id',
    supportsAllDrives: true,
  });
  return data.id;
}

/**
 * Opens a Google resumable upload session. The browser PUTs the bytes straight to Google,
 * so multi-GB videos never pass through (or get stored on) the app server.
 */
export async function createUploadSession({ name, mimeType, size, parentDriveId, origin }) {
  const auth = getServiceAuth();
  const headers = {
    'Content-Type': 'application/json; charset=UTF-8',
    'X-Upload-Content-Type': mimeType || 'application/octet-stream',
  };
  if (size) headers['X-Upload-Content-Length'] = String(size);
  // Google echoes CORS headers for the session only if the Origin is set when it is created.
  if (origin) headers.Origin = origin;
  const res = await auth.request({
    url: 'https://www.googleapis.com/upload/drive/v3/files',
    method: 'POST',
    params: { uploadType: 'resumable', supportsAllDrives: true, fields: FILE_FIELDS },
    headers,
    data: { name, parents: [parentDriveId] },
  });
  return res.headers.location;
}

export async function getFile(driveFileId) {
  const { data } = await drive().files.get({ fileId: driveFileId, fields: FILE_FIELDS, supportsAllDrives: true });
  return data;
}

/** Streams a file's bytes from Drive (used to proxy downloads for users without Drive access). */
export async function streamFile(driveFileId) {
  const res = await drive().files.get(
    { fileId: driveFileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' },
  );
  return res.data;
}
