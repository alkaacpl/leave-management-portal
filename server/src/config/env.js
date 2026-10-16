import dotenv from 'dotenv';

dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}. Copy server/.env.example to server/.env and set it.`);
  }
  return value;
}

const jwtSecret = required('JWT_SECRET');
if (nodeEnv === 'production' && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production.');
}

export const config = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  port: Number(process.env.PORT) || 5000,
  mongoUri: nodeEnv === 'test' ? process.env.MONGODB_URI_TEST || process.env.MONGODB_URI : required('MONGODB_URI'),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  cookieName: 'lmp_token',
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : nodeEnv === 'production',
  loginRateLimit: Number(process.env.LOGIN_RATE_LIMIT) || 20,
  // Public URL of the web app, used for links in notification emails.
  appUrl: (process.env.APP_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5173').replace(/\/+$/, ''),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : Number(process.env.SMTP_PORT || 465) === 465,
    user: process.env.SMTP_USER || '',
    // Gmail shows App Passwords in groups of four; the spaces are not part of the password.
    pass: (process.env.SMTP_PASS || '').replace(/\s+/g, ''),
    from: process.env.MAIL_FROM || process.env.SMTP_USER || '',
  },
  // Email is on when SMTP is configured, unless EMAIL_ENABLED=false. Always off in tests
  // (tests inject a mock transport instead).
  emailEnabled: nodeEnv !== 'test' && process.env.EMAIL_ENABLED !== 'false' && Boolean(process.env.SMTP_HOST),
};
