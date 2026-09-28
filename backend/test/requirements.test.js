import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, loginAll, pool, resetDb } from './helpers.js';

let u;
let project;
const svc = {};

before(async () => {
  await resetDb();
  u = await loginAll();
  project = (await u.admin.get('/projects')).body.projects[0];
  for (const st of (await u.admin.get('/service-types')).body.serviceTypes) svc[st.name] = st;
});
after(() => pool.end());

const field = (st, label) => st.fields.find((f) => f.label === label);

describe('service types & custom fields (admin)', () => {
  test('admin designs a service form; others cannot', async () => {
    const created = await u.admin.post('/service-types', {
      name: 'SEO',
      color: '#0ea5e9',
      fields: [
        { label: 'Website', type: 'url', required: true },
        { label: 'Focus', type: 'select', options: ['Local', 'National'], required: true },
        { label: 'Keywords', type: 'textarea' },
      ],
    });
    assert.equal(created.status, 201);
    assert.deepEqual(created.body.serviceType.fields.map((f) => f.label), ['Website', 'Focus', 'Keywords']);

    const bad = await u.admin.post('/service-types', { name: 'Bad', fields: [{ label: 'Pick', type: 'select', options: [] }] });
    assert.equal(bad.status, 400);
    assert.equal((await u.admin.post('/service-types', { name: 'seo' })).status, 409);
    assert.equal((await u.editor.post('/service-types', { name: 'X' })).status, 403);
    assert.equal((await u.client.put(`/service-types/${created.body.serviceType.id}/fields`, { fields: [] })).status, 403);

    // Reorder, edit, drop a field and add a new one.
    const [website, focus] = created.body.serviceType.fields;
    const saved = await u.admin.put(`/service-types/${created.body.serviceType.id}/fields`, {
      fields: [
        { ...focus, options: ['Local', 'National', 'International'] },
        { ...website, required: false },
        { label: 'Competitors', type: 'text' },
      ],
    });
    assert.deepEqual(saved.body.serviceType.fields.map((f) => f.label), ['Focus', 'Website', 'Competitors']);
    assert.equal(saved.body.serviceType.fields[0].id, focus.id);
    assert.equal(saved.body.serviceType.fields[0].options.length, 3);
  });

  test('clients only see services linked to them', async () => {
    const names = (await u.client.get('/service-types')).body.serviceTypes.map((s) => s.name).sort();
    assert.deepEqual(names, ['Graphic Design', 'Marketing', 'Video Editing']);
    assert.equal((await u.client.get('/service-types')).body.serviceTypes[0].memberCount, undefined);
  });

  test('employees and clients are tagged with services', async () => {
    const team = (await u.admin.get(`/users?role=employee&serviceTypeId=${svc['Video Editing'].id}`)).body.users;
    assert.deepEqual(team.map((x) => x.email), ['editor@vagency.com']);
    const upd = await u.admin.patch(`/users/${u.designer.user.id}`, { serviceTypeIds: [svc['Graphic Design'].id, svc.Development.id] });
    assert.equal(upd.body.user.serviceTypeIds.length, 2);
    const client = (await u.admin.get('/clients')).body.clients[0];
    const c2 = await u.admin.patch(`/clients/${client.id}`, { serviceTypeIds: [...client.serviceTypeIds, svc.Development.id] });
    assert.equal(c2.body.client.serviceTypeIds.length, 4);
  });
});

describe('client requirements', () => {
  let reqId;
  let fileId;

  test('validates answers against the admin-defined form', async () => {
    const st = svc['Video Editing'];
    const missing = await u.client.post('/requirements', { projectId: project.id, serviceTypeId: st.id, title: 'Reel', answers: {} });
    assert.equal(missing.status, 400);
    assert.match(missing.body.error.message, /Video type is required/);
    const wrongOption = await u.client.post('/requirements', {
      projectId: project.id, serviceTypeId: st.id, title: 'Reel',
      answers: { [field(st, 'Video type').id]: 'Podcast', [field(st, 'Brief').id]: 'x' },
    });
    assert.match(wrongOption.body.error.message, /choose one of the options/);
  });

  test('client submits a brief with reference files; admins are notified', async () => {
    const st = svc['Video Editing'];
    // Simulate a completed Drive upload by the client (the upload itself goes browser → Google).
    const { rows } = await pool.query(
      `INSERT INTO files (project_id, drive_file_id, name, mime_type, size, uploaded_by)
       VALUES ($1, 'drive-abc', 'walkthrough.mp4', 'video/mp4', 5000000, $2) RETURNING id`,
      [project.id, u.client.user.id],
    );
    fileId = rows[0].id;
    const res = await u.client.post('/requirements', {
      projectId: project.id,
      serviceTypeId: st.id,
      title: 'Instagram reel for Palm Villa',
      priority: 'high',
      desiredDate: '2026-10-15',
      answers: {
        [field(st, 'Video type').id]: 'Reel / Short',
        [field(st, 'Platforms').id]: ['Instagram', 'Facebook'],
        [field(st, 'Brief').id]: 'Fast cuts, upbeat music, end with our logo',
        [field(st, 'Raw footage').id]: [fileId],
        [field(st, 'Reference link').id]: 'https://example.com/ref',
      },
    });
    assert.equal(res.status, 201);
    reqId = res.body.requirement.id;
    assert.equal(res.body.requirement.displayStatus, 'new');
    const footage = res.body.requirement.answers.find((a) => a.label === 'Raw footage');
    assert.equal(footage.files[0].name, 'walkthrough.mp4');
    assert.ok(footage.files[0].contentUrl.startsWith(`/api/files/${fileId}/content?t=`));

    const notes = (await u.admin.get('/notifications')).body.notifications;
    assert.ok(notes.some((n) => n.type === 'requirement_submitted'));
    // A file can only be attached once, and only by its uploader.
    const again = await u.client.post('/requirements', {
      projectId: project.id, serviceTypeId: st.id, title: 'dup',
      answers: { [field(st, 'Video type').id]: 'Ad', [field(st, 'Brief').id]: 'x', [field(st, 'Raw footage').id]: [fileId] },
    });
    assert.equal(again.status, 400);
  });

  test('clients cannot submit for services or projects outside their account', async () => {
    const res = await u.client.post('/requirements', { projectId: project.id, serviceTypeId: svc.Development.id, title: 'x', answers: {} });
    // Development was linked in the earlier test, so it is allowed now; SEO is not linked.
    assert.notEqual(res.status, 201);
    const seo = (await u.admin.get('/service-types')).body.serviceTypes.find((s) => s.name === 'SEO');
    const denied = await u.client.post('/requirements', { projectId: project.id, serviceTypeId: seo.id, title: 'x', answers: {} });
    assert.equal(denied.status, 400);
    assert.match(denied.body.error.message, /not available/);
  });

  test('employees cannot see a brief until a task on it is assigned to them', async () => {
    assert.equal((await u.editor.get(`/requirements/${reqId}`)).status, 404);
    assert.equal((await u.editor.get('/requirements')).body.requirements.length, 0);
  });

  test('admin converts the brief into a task for the right team member', async () => {
    const res = await u.admin.post(`/requirements/${reqId}/tasks`, {
      title: 'Edit Palm Villa reel',
      assigneeId: u.editor.user.id,
      dueDate: '2026-10-14T12:00:00.000Z',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.task.requirementId, reqId);
    assert.equal(res.body.task.serviceType.name, 'Video Editing');
    assert.equal(res.body.task.priority, 'high');

    const editorView = (await u.editor.get(`/requirements/${reqId}`)).body.requirement;
    assert.equal(editorView.answers.find((a) => a.label === 'Brief').value, 'Fast cuts, upbeat music, end with our logo');
    assert.equal(editorView.tasks.length, 1);
    assert.ok((await u.editor.get('/notifications')).body.notifications.some((n) => n.type === 'task_assigned'));
    assert.ok((await u.client.get('/notifications')).body.notifications.some((n) => n.type === 'requirement_accepted'));

    // The designer is not on this brief.
    assert.equal((await u.designer.get(`/requirements/${reqId}`)).status, 404);

    // Client sees progress but no people.
    const clientView = (await u.client.get(`/requirements/${reqId}`)).body.requirement;
    assert.equal(clientView.displayStatus, 'in_progress');
    assert.equal(clientView.submittedBy, undefined);
    assert.equal(clientView.tasks[0].assignee, undefined);

    // Master Kanban can filter by team.
    const byTeam = (await u.admin.get(`/tasks?serviceTypeIds=${svc['Video Editing'].id}`)).body.tasks;
    assert.ok(byTeam.every((t) => t.serviceType?.name === 'Video Editing'));
    assert.equal((await u.admin.post(`/requirements/${reqId}/decline`, { reason: 'x' })).status, 409);
  });

  test('admin can decline a new requirement with a reason', async () => {
    const st = svc['Graphic Design'];
    const created = await u.client.post('/requirements', {
      projectId: project.id, serviceTypeId: st.id, title: 'Logo refresh',
      answers: { [field(st, 'Deliverable').id]: 'Logo / branding', [field(st, 'Brief').id]: 'Modernise the logo' },
    });
    assert.equal((await u.admin.post(`/requirements/${created.body.requirement.id}/decline`, {})).status, 400);
    const declined = await u.admin.post(`/requirements/${created.body.requirement.id}/decline`, { reason: 'Please share the current logo files' });
    assert.equal(declined.body.requirement.displayStatus, 'declined');
    const list = (await u.client.get('/requirements')).body.requirements;
    assert.equal(list.length, 2);
  });

  test('file content links are scoped to one file and one viewer', async () => {
    const url = (await u.client.get(`/requirements/${reqId}`)).body.requirement.answers.find((a) => a.label === 'Raw footage').files[0].contentUrl;
    // Access passes; the stream itself needs Google Drive, which is not configured in tests.
    const ok = await request(app).get(url);
    assert.equal(ok.status, 503);
    const token = new URL(url, 'http://x').searchParams.get('t');
    // The file token cannot be used as a login.
    assert.equal((await request(app).get('/api/tasks').set('Authorization', `Bearer ${token}`)).status, 401);
    // ...nor for another file.
    const { rows } = await pool.query(`INSERT INTO files (project_id, drive_file_id, name, uploaded_by) VALUES ($1, 'd2', 'other', $2) RETURNING id`, [project.id, u.admin.user.id]);
    assert.equal((await request(app).get(`/api/files/${rows[0].id}/content?t=${token}`)).status, 401);
    // Draft files uploaded by the agency stay hidden from clients.
    const clientTokenForDraft = (await request(app).get(`/api/files/${rows[0].id}/content`).set('Authorization', `Bearer ${(await request(app).post('/api/auth/login').send({ email: 'client@skyline.test', password: 'password123' })).body.token}`));
    assert.equal(clientTokenForDraft.status, 404);
  });
});
