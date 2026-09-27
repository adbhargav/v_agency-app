import { badRequest } from './errors.js';

export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw badRequest(details.map((d) => (d.path ? `${d.path}: ${d.message}` : d.message)).join('; '), details);
  }
  return result.data;
}

export const csv = (value) =>
  value === undefined || value === '' ? undefined : String(value).split(',').map((s) => s.trim()).filter(Boolean);
