import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { loginAll, pool, resetDb } from './helpers.js';
import { runDeadlineAlerts } from '../src/services/jobs.js';

let u;
const byTitle = (tasks, title) => tasks.find((t) => t.title === title);

before(async () => {
  await resetDb();
  u = await loginAll();
});
after(() => pool.end());

describe('auth', () => {
  test('rejects bad credentials and missing token', async () => {
    const { default: request } = await import('supertest');
    const { app } = await import('./helpers.js');
    assert.equal((await request(app).post('/api/auth/login').send({ email: 'admin@vagency.com', password: 'nope' })).status, 401);
    assert.equal((await request(app).get('/api/tasks')).status, 401);
  });
});

describe('visibility silos', () => {
  test('admin sees every task with assignee and time', async () => {
    const { body } = await u.admin.get('/tasks');
    assert.equal(body.tasks.length, 4);
    assert.ok(body.tasks[0].assignee);
    assert.ok('timeSpentSeconds' in body.tasks[0]);
  });

  test('employee sees only their own tasks', async () => {
    const { body } = await u.designer.get('/tasks');
    assert.deepEqual(body.tasks.map((t) => t.title), ['Design Meta Ad Carousels']);
    const other = byTitle((await u.admin.get('/tasks')).body.tasks, 'Edit Property Tour Video');
    assert.equal((await u.designer.get(`/tasks/${other.id}`)).status, 404);
    // Employees cannot filter their way into other people's work.
    const filtered = await u.designer.get(`/tasks?assigneeIds=${u.editor.user.id}`);
    assert.equal(filtered.body.tasks.length, 1);
  });

  test('client never sees assignees, time tracking, or internal comments', async () => {
    const { body } = await u.client.get('/tasks');
    assert.equal(body.tasks.length, 4);
    for (const t of body.tasks) {
      assert.equal(t.assignee, undefined);
      assert.equal(t.timeSpentSeconds, undefined);
      assert.equal(t.activeTimer, undefined);
    }
    assert.equal(byTitle(body.tasks, 'Design Meta Ad Carousels').approvalState, 'none'); // internal review is hidden
    const { body: dash } = await u.client.get('/dashboard/client');
    assert.equal(dash.projects[0].progress > 0, true);
    assert.equal((await u.client.get('/finance/summary')).status, 403);
    assert.equal((await u.client.get('/eod')).status, 403);
  });

  test('employee project list hides the client timeline', async () => {
    const { body } = await u.designer.get('/projects');
    assert.equal(body.projects.length, 1);
    assert.equal(body.projects[0].startDate, null);
    assert.equal(body.projects[0].taskCount, 1);
  });
});

describe('master kanban filters', () => {
  test('filters by member, client, priority and due', async () => {
    const byMember = await u.admin.get(`/tasks?assigneeIds=${u.editor.user.id}`);
    assert.equal(byMember.body.tasks.length, 3);
    const combo = await u.admin.get(`/tasks?assigneeIds=${u.editor.user.id}&clientIds=${u.client.user.clientId}&priorities=very_urgent,medium`);
    assert.equal(combo.body.tasks.length, 2);
    const overdue = await u.admin.get('/tasks?due=overdue');
    assert.deepEqual(overdue.body.tasks.map((t) => t.title), ['Shoot Day 1 — Raw Footage']);
    assert.equal((await u.admin.get('/tasks?priorities=nope')).status, 400);
  });

  test('admin dashboard prioritises approvals, overdue, today', async () => {
    const { body } = await u.admin.get('/dashboard/admin');
    assert.equal(body.pendingApprovals.length, 1);
    assert.equal(body.overdueTasks.length, 1);
    assert.ok(body.todaysTasks.some((t) => t.title === 'Edit Property Tour Video'));
    assert.equal(body.finance.totalEarnings, '1450.00');
  });
});

describe('status mapping', () => {
  test('employee columns map to master statuses', async () => {
    const { body: master } = await u.editor.get('/statuses/master');
    const inProgress = master.statuses.find((s) => s.name === 'In Progress');
    const { body: defaults } = await u.editor.get('/statuses/custom');
    assert.equal(defaults.statuses.length, 4);

    assert.equal((await u.editor.post('/statuses/custom', { name: 'Editing' })).status, 400);
    const { body: created } = await u.editor.post('/statuses/custom', { name: 'Editing', masterStatusId: inProgress.id });

    const task = byTitle((await u.editor.get('/tasks')).body.tasks, 'Shoot Day 1 — Raw Footage');
    const moved = await u.editor.patch(`/tasks/${task.id}`, { customStatusId: created.status.id });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.task.customStatusId, created.status.id);
    assert.equal(moved.body.task.masterStatusId, inProgress.id);

    // The admin's Master Kanban still only knows the rigid master status.
    const adminView = (await u.admin.get(`/tasks/${task.id}`)).body.task;
    assert.equal(adminView.masterStatusName, 'In Progress');
    assert.equal(adminView.customStatusId, null);

    // Someone else's custom status cannot be used.
    const designerTask = (await u.designer.get('/tasks')).body.tasks[0];
    assert.equal((await u.designer.patch(`/tasks/${designerTask.id}`, { customStatusId: created.status.id })).status, 400);
  });
});

describe('task creation', () => {
  test('employee creates tasks only in their projects, auto-assigned to self', async () => {
    const project = (await u.editor.get('/projects')).body.projects[0];
    const res = await u.editor.post('/tasks', { projectId: project.id, title: 'Export reels', priority: 'high', assigneeId: u.designer.user.id });
    assert.equal(res.status, 201);
    assert.equal(res.body.task.assignee.id, u.editor.user.id);

    const other = await u.admin.post('/projects', { clientId: u.client.user.clientId, name: 'Secret project' });
    assert.equal((await u.editor.post('/tasks', { projectId: other.body.project.id, title: 'x', priority: 'low' })).status, 403);
    assert.equal((await u.client.post('/tasks', { projectId: project.id, title: 'x', priority: 'low' })).status, 403);
  });

  test('admin assignment notifies the employee', async () => {
    const project = (await u.admin.get('/projects')).body.projects.find((p) => p.name === 'Real Estate August Campaign');
    const res = await u.admin.post('/tasks', { projectId: project.id, title: 'Voiceover script', priority: 'low', assigneeId: u.designer.user.id });
    assert.equal(res.status, 201);
    const { body } = await u.designer.get('/notifications');
    assert.ok(body.notifications.some((n) => n.type === 'task_assigned' && n.taskId === res.body.task.id));
  });
});

describe('approval & revision workflow', () => {
  test('employee → manager → client pipeline with task-based comments', async () => {
    const task = byTitle((await u.editor.get('/tasks')).body.tasks, 'Edit Property Tour Video');

    assert.equal((await u.admin.post(`/tasks/${task.id}/approve`)).status, 409); // not submitted yet
    const submitted = await u.editor.post(`/tasks/${task.id}/submit`, { comment: 'First cut ready' });
    assert.equal(submitted.body.task.approvalState, 'internal_review');
    assert.equal(submitted.body.task.masterStatusName, 'Review');
    assert.equal((await u.client.post(`/tasks/${task.id}/approve`)).status, 409);

    const sent = await u.admin.post(`/tasks/${task.id}/approve`, {});
    assert.equal(sent.body.task.approvalState, 'client_review');
    const clientNotes = (await u.client.get('/notifications')).body.notifications;
    assert.ok(clientNotes.some((n) => n.type === 'client_approval_requested'));
    assert.equal((await u.client.get('/dashboard/client')).body.actionRequired.length, 1);

    assert.equal((await u.client.post(`/tasks/${task.id}/request-revision`, { comment: '' })).status, 400);
    const rev = await u.client.post(`/tasks/${task.id}/request-revision`, { comment: 'Make logo bigger' });
    assert.equal(rev.body.task.approvalState, 'revision_requested');
    const editorNotes = (await u.editor.get('/notifications')).body.notifications;
    assert.ok(editorNotes.some((n) => n.type === 'revision_requested' && n.body.includes('Make logo bigger')));

    // Client thread shows only client-facing comments, with the agency anonymised.
    const clientComments = (await u.client.get(`/tasks/${task.id}/comments`)).body.comments;
    assert.deepEqual(clientComments.map((c) => c.kind), ['sent_to_client', 'revision_request']);
    assert.equal(clientComments[0].author.name, 'V Agency');
    assert.equal(clientComments[0].author.id, null);
    const internal = (await u.admin.get(`/tasks/${task.id}/comments`)).body.comments;
    assert.equal(internal.length, 3);

    await u.editor.post(`/tasks/${task.id}/submit`);
    await u.admin.post(`/tasks/${task.id}/approve`);
    const approved = await u.client.post(`/tasks/${task.id}/approve`, { comment: 'Love it' });
    assert.equal(approved.body.task.approvalState, 'approved');
    assert.equal(approved.body.task.masterStatusName, 'Done');
    assert.equal(approved.body.task.percentDone, 100);
    assert.ok(approved.body.task.completedAt);

    const eod = (await u.editor.get('/eod')).body;
    assert.ok(eod.completedToday.some((t) => t.id === task.id));
  });

  test('client comments are visible to the team; team comments are not visible to client', async () => {
    const task = byTitle((await u.editor.get('/tasks')).body.tasks, 'Brand Color Grading LUT');
    await u.editor.post(`/tasks/${task.id}/comments`, { body: 'internal note' });
    await u.client.post(`/tasks/${task.id}/comments`, { body: 'client question' });
    const clientView = (await u.client.get(`/tasks/${task.id}/comments`)).body.comments;
    assert.deepEqual(clientView.map((c) => c.body), ['client question']);
    const teamView = (await u.admin.get(`/tasks/${task.id}/comments`)).body.comments;
    assert.equal(teamView.length, 2);
  });
});

describe('time tracking', () => {
  test('start / pause / resume, one running timer, no manual entry', async () => {
    const tasks = (await u.editor.get('/tasks')).body.tasks;
    const a = byTitle(tasks, 'Shoot Day 1 — Raw Footage');
    const b = byTitle(tasks, 'Export reels');
    const started = await u.editor.post(`/tasks/${a.id}/timer/start`);
    assert.ok(started.body.task.activeTimer);
    assert.equal((await u.editor.post(`/tasks/${a.id}/timer/start`)).status, 409);
    const busy = await u.editor.post(`/tasks/${b.id}/timer/start`);
    assert.equal(busy.status, 409);
    assert.equal(busy.body.error.details.taskId, a.id);
    assert.equal((await u.editor.get('/timer/active')).body.timer.taskId, a.id);

    await u.editor.post(`/tasks/${a.id}/timer/pause`);
    assert.equal((await u.editor.post(`/tasks/${a.id}/timer/pause`)).status, 409);
    await u.editor.post(`/tasks/${a.id}/timer/start`); // resume
    await u.editor.post(`/tasks/${a.id}/timer/pause`);
    const entries = (await u.editor.get(`/tasks/${a.id}/time-entries`)).body;
    assert.equal(entries.entries.length, 2);

    assert.equal((await u.client.post(`/tasks/${a.id}/timer/start`)).status, 403);
    assert.equal((await u.client.get(`/tasks/${a.id}/time-entries`)).status, 403);
    assert.equal((await u.designer.post(`/tasks/${a.id}/timer/start`)).status, 404);
  });
});

describe('EOD', () => {
  test('employee saves daily update; admin sees team reports', async () => {
    const saved = await u.designer.put('/eod', { blockers: 'Waiting on brand fonts', tomorrowPriority: 'Carousel v2' });
    assert.equal(saved.status, 200);
    const again = await u.designer.put('/eod', { blockers: 'None', tomorrowPriority: 'Carousel v2' });
    assert.equal(again.body.report.blockers, 'None');
    const team = (await u.admin.get('/eod/team')).body.reports;
    assert.equal(team.find((r) => r.user.id === u.designer.user.id).report.blockers, 'None');
  });
});

describe('finance', () => {
  test('wallet credits, settlement and salary ledger', async () => {
    assert.equal((await u.admin.post(`/finance/wallet/${u.designer.user.id}/credit`, { amount: 10, description: 'x' })).status, 400);
    const credit = await u.admin.post(`/finance/wallet/${u.editor.user.id}/credit`, { amount: '99.50', description: 'Reel edit' });
    assert.equal(credit.status, 201);
    let wallet = (await u.editor.get(`/finance/wallet/${u.editor.user.id}`)).body;
    assert.equal(wallet.balance.pending, '349.50');
    assert.equal((await u.editor.get(`/finance/wallet/${u.designer.user.id}`)).status, 403);
    assert.equal((await u.editor.post(`/finance/wallet/${u.editor.user.id}/credit`, { amount: 1, description: 'x' })).status, 403);

    await u.admin.post(`/finance/wallet/transactions/${credit.body.transaction.id}/settle`);
    assert.equal((await u.admin.post(`/finance/wallet/transactions/${credit.body.transaction.id}/settle`)).status, 409);
    wallet = (await u.editor.get(`/finance/wallet/${u.editor.user.id}`)).body;
    assert.equal(wallet.balance.settled, '99.50');

    const sal = await u.admin.post(`/finance/salary/${u.designer.user.id}`, { periodMonth: '2026-01', amount: 1200 });
    assert.equal(sal.status, 201);
    assert.equal((await u.admin.post(`/finance/salary/${u.designer.user.id}`, { periodMonth: '2026-01', amount: 1 })).status, 409);
    const settled = await u.admin.post(`/finance/salary/records/${sal.body.record.id}/status`, { status: 'settled' });
    assert.equal(settled.body.record.status, 'settled');
    assert.ok(settled.body.record.sentAt);

    const summary = (await u.admin.get('/finance/summary')).body;
    assert.equal(summary.totalEarnings, '2749.50');
    assert.equal(summary.totalSettled, '1299.50');
    assert.equal(summary.pendingSettlement, '1450.00');
  });
});

describe('deadline alerts', () => {
  test('missed deadline notifies assignee and managers once', async () => {
    const sent = await runDeadlineAlerts();
    assert.ok(sent >= 1);
    assert.equal(await runDeadlineAlerts(), 0);
    const editor = (await u.editor.get('/notifications')).body.notifications;
    const admin = (await u.admin.get('/notifications')).body.notifications;
    for (const list of [editor, admin]) {
      assert.ok(list.some((n) => n.type === 'deadline_missed' && n.priority === 'high'));
    }
    await u.admin.post('/notifications/read-all');
    assert.equal((await u.admin.get('/notifications')).body.unreadCount, 0);
  });
});

describe('google integrations', () => {
  test('drive endpoints report NOT_CONFIGURED without credentials', async () => {
    const project = (await u.admin.get('/projects')).body.projects[0];
    const res = await u.admin.post(`/projects/${project.id}/folders`, { name: 'Raw Footage' });
    assert.equal(res.status, 503);
    assert.equal(res.body.error.code, 'NOT_CONFIGURED');
    assert.equal((await u.admin.get(`/projects/${project.id}/folders`)).status, 200);
  });
});
