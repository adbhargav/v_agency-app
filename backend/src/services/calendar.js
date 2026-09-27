import { google } from 'googleapis';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { calendarConfigured, oauthClient } from './google.js';

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];
const MARKER = 'vAgency';

export function connectUrl(userId) {
  const state = jwt.sign({ sub: userId, purpose: 'calendar' }, config.jwtSecret, { expiresIn: '15m' });
  return oauthClient().generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES, state });
}

export async function handleCallback(code, state) {
  const payload = jwt.verify(state, config.jwtSecret);
  if (payload.purpose !== 'calendar') throw new Error('Invalid state');
  const { tokens } = await oauthClient().getToken(code);
  if (!tokens.refresh_token) throw new Error('Google did not return a refresh token');
  await query(
    `UPDATE users SET google_refresh_token = $2, google_calendar_id = 'primary', google_sync_token = $3 WHERE id = $1`,
    [payload.sub, tokens.refresh_token, new Date().toISOString()],
  );
  // Back-fill events for tasks already assigned to this employee.
  const { rows } = await query(
    `SELECT t.id FROM tasks t JOIN master_statuses ms ON ms.id = t.master_status_id
      WHERE t.assignee_id = $1 AND t.due_date IS NOT NULL AND NOT ms.is_done`,
    [payload.sub],
  );
  for (const r of rows) await syncTaskEvent(r.id);
  return payload.sub;
}

function calendarFor(user) {
  const auth = oauthClient();
  auth.setCredentials({ refresh_token: user.google_refresh_token });
  return google.calendar({ version: 'v3', auth });
}

async function removeEvent(task) {
  if (!task.calendar_event_id || !task.calendar_owner_id) return;
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [task.calendar_owner_id]);
  const owner = rows[0];
  if (owner?.google_refresh_token) {
    await calendarFor(owner)
      .events.delete({ calendarId: owner.google_calendar_id || 'primary', eventId: task.calendar_event_id })
      .catch((err) => {
        if (err.code !== 404 && err.code !== 410) throw err;
      });
  }
  await query('UPDATE tasks SET calendar_event_id = NULL, calendar_owner_id = NULL WHERE id = $1', [task.id]);
}

/**
 * Makes the assignee's calendar match the task: creates, moves or removes the deadline event.
 * Safe to call after any task change; never throws (calendar issues must not block task updates).
 */
export async function syncTaskEvent(taskId) {
  if (!calendarConfigured()) return;
  try {
    const { rows } = await query(
      `SELECT t.*, p.name AS project_name, ms.is_done, u.google_refresh_token, u.google_calendar_id
         FROM tasks t JOIN projects p ON p.id = t.project_id
         JOIN master_statuses ms ON ms.id = t.master_status_id
         LEFT JOIN users u ON u.id = t.assignee_id
        WHERE t.id = $1`,
      [taskId],
    );
    const task = rows[0];
    if (!task) return;
    const wantsEvent = task.assignee_id && task.google_refresh_token && task.due_date && !task.is_done;
    if (!wantsEvent || task.calendar_owner_id !== task.assignee_id) await removeEvent(task);
    if (!wantsEvent) return;

    const end = new Date(task.due_date);
    const start = new Date(end.getTime() - 60 * 60 * 1000);
    const requestBody = {
      summary: `[V Agency] ${task.title}`,
      description: `Project: ${task.project_name}\nDeadline for this task.\n${config.appUrl}/tasks/${task.id}`,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      extendedProperties: { private: { [MARKER]: '1', taskId: task.id } },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }] },
    };
    const cal = calendarFor(task);
    const calendarId = task.google_calendar_id || 'primary';
    if (task.calendar_event_id && task.calendar_owner_id === task.assignee_id) {
      await cal.events.patch({ calendarId, eventId: task.calendar_event_id, requestBody });
    } else {
      const { data } = await cal.events.insert({ calendarId, requestBody });
      await query('UPDATE tasks SET calendar_event_id = $2, calendar_owner_id = $3 WHERE id = $1', [task.id, data.id, task.assignee_id]);
    }
  } catch (err) {
    console.error('[calendar] sync task event failed', taskId, err.message);
  }
}

export async function disconnect(userId) {
  const { rows } = await query('SELECT id, calendar_event_id, calendar_owner_id FROM tasks WHERE calendar_owner_id = $1', [userId]);
  for (const t of rows) await removeEvent(t).catch(() => {});
  await query('UPDATE users SET google_refresh_token = NULL, google_calendar_id = NULL, google_sync_token = NULL WHERE id = $1', [userId]);
}

/**
 * Pulls changes made in Google Calendar back into V Agency (the second direction of the two-way sync):
 * moving a deadline event updates the task's due date; deleting it unlinks the event.
 */
export async function pullCalendarChanges() {
  if (!calendarConfigured()) return;
  const { rows: users } = await query(`SELECT * FROM users WHERE google_refresh_token IS NOT NULL AND is_active`);
  for (const user of users) {
    const since = user.google_sync_token || new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const startedAt = new Date().toISOString();
    try {
      const cal = calendarFor(user);
      let pageToken;
      do {
        const { data } = await cal.events.list({
          calendarId: user.google_calendar_id || 'primary',
          privateExtendedProperty: [`${MARKER}=1`],
          updatedMin: since,
          showDeleted: true,
          singleEvents: true,
          maxResults: 250,
          pageToken,
        });
        for (const ev of data.items || []) {
          const taskId = ev.extendedProperties?.private?.taskId;
          if (!taskId) continue;
          if (ev.status === 'cancelled') {
            await query(
              'UPDATE tasks SET calendar_event_id = NULL, calendar_owner_id = NULL WHERE id = $1 AND calendar_event_id = $2',
              [taskId, ev.id],
            );
            continue;
          }
          const due = ev.end?.dateTime || (ev.end?.date && `${ev.end.date}T00:00:00Z`);
          if (!due) continue;
          await query(
            `UPDATE tasks SET due_date = $3, updated_at = now(),
                    deadline_alert_sent_at = CASE WHEN $3::timestamptz > now() THEN NULL ELSE deadline_alert_sent_at END
              WHERE id = $1 AND calendar_event_id = $2 AND due_date IS DISTINCT FROM $3::timestamptz`,
            [taskId, ev.id, due],
          );
        }
        pageToken = data.nextPageToken;
      } while (pageToken);
      await query('UPDATE users SET google_sync_token = $2 WHERE id = $1', [user.id, startedAt]);
    } catch (err) {
      console.error('[calendar] pull failed for user', user.id, err.message);
    }
  }
}
