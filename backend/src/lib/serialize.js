export const serializeUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  employmentType: u.employment_type,
  clientId: u.client_id,
  isActive: u.is_active,
  googleCalendarConnected: !!u.google_refresh_token,
  createdAt: u.created_at,
});

export const serializeClient = (c) => ({
  id: c.id,
  name: c.name,
  company: c.company,
  email: c.email,
  phone: c.phone,
  createdAt: c.created_at,
  projectCount: Number(c.project_count ?? 0),
});

export const serializeMasterStatus = (s) => ({ id: s.id, name: s.name, position: s.position, color: s.color, isDone: s.is_done });

export const serializeCustomStatus = (s) => ({ id: s.id, name: s.name, masterStatusId: s.master_status_id, position: s.position });

export function serializeFile(f, viewer) {
  const out = {
    id: f.id,
    projectId: f.project_id,
    taskId: f.task_id,
    folderId: f.folder_id,
    driveFileId: f.drive_file_id,
    name: f.name,
    mimeType: f.mime_type,
    size: f.size === null ? null : Number(f.size),
    isFinal: f.is_final,
    webViewLink: f.web_view_link,
    createdAt: f.created_at,
  };
  if (viewer?.role !== 'client' && f.uploaded_by) out.uploadedBy = { id: f.uploaded_by, name: f.uploaded_by_name };
  return out;
}

export const serializeFolder = (f) => ({
  id: f.id,
  projectId: f.project_id,
  parentId: f.parent_id,
  driveFolderId: f.drive_folder_id,
  name: f.name,
  createdAt: f.created_at,
});

export const money = (v) => Number(v ?? 0).toFixed(2);
