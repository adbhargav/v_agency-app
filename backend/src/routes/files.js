import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { serializeFile, serializeFolder } from '../lib/serialize.js';
import { assertProjectAccess } from '../services/projects.js';
import { getServiceAuth } from '../services/google.js';
import { createFolder, createUploadSession, getFile } from '../services/drive.js';
import { loadTaskRow } from '../services/tasks.js';
import { approvedAssets } from './dashboard.js';

// Mounted at /api: exposes /projects/:id/folders and /files/*.
const router = Router();
const uuid = z.string().uuid();

async function ensureProjectDriveFolder(project) {
  if (project.drive_folder_id) return project.drive_folder_id;
  getServiceAuth(); // throws NOT_CONFIGURED when Drive is not set up
  const { rows } = await query('SELECT name FROM clients WHERE id = $1', [project.client_id]);
  const id = await createFolder(`${rows[0].name} — ${project.name}`);
  await query('UPDATE projects SET drive_folder_id = $2 WHERE id = $1 AND drive_folder_id IS NULL', [project.id, id]);
  return id;
}

async function loadFolder(projectId, folderId) {
  if (!folderId) return null;
  const { rows } = await query('SELECT * FROM folders WHERE id = $1 AND project_id = $2', [folderId, projectId]);
  if (!rows[0]) throw notFound('Folder not found');
  return rows[0];
}

router.get('/projects/:id/folders', async (req, res) => {
  const projectId = parse(uuid, req.params.id);
  const parentId = parse(uuid.optional(), req.query.parentId || undefined) ?? null;
  await assertProjectAccess(req.user, projectId);
  const parent = await loadFolder(projectId, parentId);
  const isClient = req.user.role === 'client';
  const [{ rows: folders }, { rows: files }, breadcrumb] = await Promise.all([
    query(
      `SELECT * FROM folders WHERE project_id = $1 AND parent_id IS NOT DISTINCT FROM $2 ORDER BY name`,
      [projectId, parentId],
    ),
    query(
      `SELECT f.*, u.name AS uploaded_by_name FROM files f LEFT JOIN users u ON u.id = f.uploaded_by
        WHERE f.project_id = $1 AND f.folder_id IS NOT DISTINCT FROM $2
          ${isClient ? `AND (f.is_final OR u.role = 'client')` : ''}
        ORDER BY f.created_at DESC`,
      [projectId, parentId],
    ),
    query(
      `WITH RECURSIVE chain AS (
         SELECT id, parent_id, name, 0 AS depth FROM folders WHERE id = $1
         UNION ALL
         SELECT f.id, f.parent_id, f.name, c.depth + 1 FROM folders f JOIN chain c ON f.id = c.parent_id)
       SELECT id, name FROM chain ORDER BY depth DESC`,
      [parent?.id ?? null],
    ),
  ]);
  res.json({
    folders: folders.map(serializeFolder),
    files: files.map((f) => serializeFile(f, req.user)),
    breadcrumb: breadcrumb.rows,
  });
});

router.post('/projects/:id/folders', async (req, res) => {
  const projectId = parse(uuid, req.params.id);
  const b = parse(z.object({ name: z.string().trim().min(1).max(120), parentId: uuid.nullish() }), req.body);
  const project = await assertProjectAccess(req.user, projectId);
  const parent = await loadFolder(projectId, b.parentId);
  const driveParent = parent?.drive_folder_id ?? (await ensureProjectDriveFolder(project));
  const driveFolderId = await createFolder(b.name, driveParent);
  const { rows } = await query(
    `INSERT INTO folders (project_id, parent_id, drive_folder_id, name, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [projectId, parent?.id ?? null, driveFolderId, b.name, req.user.id],
  );
  res.status(201).json({ folder: serializeFolder(rows[0]) });
});

router.post('/files/upload-session', async (req, res) => {
  const b = parse(
    z.object({
      projectId: uuid,
      folderId: uuid.nullish(),
      taskId: uuid.nullish(),
      name: z.string().trim().min(1).max(255),
      mimeType: z.string().max(255).optional(),
      size: z.number().int().nonnegative().optional(),
    }),
    req.body,
  );
  const project = await assertProjectAccess(req.user, b.projectId);
  const folder = await loadFolder(b.projectId, b.folderId);
  if (b.taskId) {
    const task = await loadTaskRow(req.user, b.taskId);
    if (task.project_id !== b.projectId) throw badRequest('Task belongs to a different project');
  }
  const parentDriveId = folder?.drive_folder_id ?? (await ensureProjectDriveFolder(project));
  const uploadUrl = await createUploadSession({
    name: b.name,
    mimeType: b.mimeType,
    size: b.size,
    parentDriveId,
    origin: req.headers.origin,
  });
  const uploadToken = jwt.sign(
    { sub: req.user.id, purpose: 'upload', projectId: b.projectId, folderId: folder?.id ?? null, taskId: b.taskId ?? null, parentDriveId },
    config.jwtSecret,
    { expiresIn: '7d' },
  );
  res.json({ uploadUrl, uploadToken });
});

router.post('/files/complete', async (req, res) => {
  const b = parse(z.object({ uploadToken: z.string(), driveFileId: z.string().min(1).max(200) }), req.body);
  let t;
  try {
    t = jwt.verify(b.uploadToken, config.jwtSecret);
  } catch {
    throw badRequest('Upload token is invalid or expired');
  }
  if (t.purpose !== 'upload' || t.sub !== req.user.id) throw forbidden();
  // Confirm the file really landed in the folder this session was opened for.
  const meta = await getFile(b.driveFileId);
  if (!meta.parents?.includes(t.parentDriveId)) throw badRequest('File was not uploaded to the expected folder');
  const existing = await query('SELECT id FROM files WHERE drive_file_id = $1', [meta.id]);
  if (existing.rowCount) throw badRequest('File is already registered');
  const { rows } = await query(
    `INSERT INTO files (project_id, folder_id, task_id, drive_file_id, name, mime_type, size, web_view_link, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [t.projectId, t.folderId, t.taskId, meta.id, meta.name, meta.mimeType, meta.size ?? null, meta.webViewLink ?? null, req.user.id],
  );
  res.status(201).json({ file: serializeFile({ ...rows[0], uploaded_by_name: req.user.name }, req.user) });
});

router.patch('/files/:id', requireRole('admin'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  const b = parse(z.object({ isFinal: z.boolean() }), req.body);
  const { rows } = await query('UPDATE files SET is_final = $2 WHERE id = $1 RETURNING *', [id, b.isFinal]);
  if (!rows[0]) throw notFound('File not found');
  res.json({ file: serializeFile(rows[0], req.user) });
});

router.get('/files/approved', requireRole('client'), async (req, res) => {
  res.json({ files: await approvedAssets(req.user) });
});

export default router;
