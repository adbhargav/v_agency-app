import { google } from 'googleapis';
import { config } from '../config.js';
import { notConfigured } from '../lib/errors.js';

let serviceAuth;

export const driveConfigured = () => !!(config.google.serviceAccountJson && config.google.sharedDriveId);
export const calendarConfigured = () =>
  !!(config.google.oauthClientId && config.google.oauthClientSecret && config.google.oauthRedirectUri);

/** Service-account auth for the hidden V Agency Shared Drive. */
export function getServiceAuth() {
  if (!driveConfigured()) throw notConfigured('Google Drive is not configured on the server');
  if (!serviceAuth) {
    const raw = config.google.serviceAccountJson.trim();
    const creds = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
    serviceAuth = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ['https://www.googleapis.com/auth/drive'],
      subject: config.google.impersonateUser || undefined,
    });
  }
  return serviceAuth;
}

export function oauthClient() {
  if (!calendarConfigured()) throw notConfigured('Google Calendar is not configured on the server');
  return new google.auth.OAuth2(config.google.oauthClientId, config.google.oauthClientSecret, config.google.oauthRedirectUri);
}
