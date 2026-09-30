import 'dotenv/config';

const env = process.env;

export const config = {
  env: env.NODE_ENV || 'development',
  port: Number(env.PORT || 4000),
  databaseUrl: env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/v_agency',
  jwtSecret: env.JWT_SECRET || 'dev-only-change-me',
  jwtExpiresIn: env.JWT_EXPIRES_IN || '7d',
  corsOrigin: env.CORS_ORIGIN ? env.CORS_ORIGIN.split(',') : true,
  appUrl: env.APP_URL || 'http://localhost:5173',
  apiUrl: env.API_URL || `http://localhost:${env.PORT || 4000}`,
  enableJobs: env.ENABLE_JOBS !== 'false',
  dbPoolMax: Number(env.DB_POOL_MAX || 10),
  // Folder with the built frontend (defaults to ../frontend/dist when present).
  webDist: env.WEB_DIST || null,
  smtp: {
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 587),
    secure: env.SMTP_SECURE === 'true',
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.MAIL_FROM || 'V Agency <no-reply@vagency.local>',
  },
  google: {
    // Service account (with domain-wide delegation) that owns the hidden Shared Drive.
    serviceAccountJson: env.GOOGLE_SERVICE_ACCOUNT_JSON,
    impersonateUser: env.GOOGLE_IMPERSONATE_USER,
    sharedDriveId: env.GOOGLE_SHARED_DRIVE_ID,
    // OAuth client used by employees to connect their personal Google Calendar.
    oauthClientId: env.GOOGLE_OAUTH_CLIENT_ID,
    oauthClientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    oauthRedirectUri: env.GOOGLE_OAUTH_REDIRECT_URI,
  },
};

if (config.env === 'production' && config.jwtSecret === 'dev-only-change-me') {
  throw new Error('JWT_SECRET must be set in production');
}
