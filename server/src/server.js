import { createApp } from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { config } from './config/env.js';
import { isEmailConfigured, waitForPendingEmails } from './services/email/email.service.js';

async function start() {
  try {
    await connectDB(config.mongoUri);
    console.log('[db] Connected to MongoDB');
  } catch (err) {
    console.error(`[db] Could not connect to MongoDB: ${err.message}`);
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`[server] API listening on http://localhost:${config.port}/api (${config.nodeEnv})`);
    const emailState = config.emailEnabled && isEmailConfigured() ? `enabled via ${config.smtp.host}:${config.smtp.port}` : 'disabled';
    console.log(`[email] Notifications ${emailState}`);
  });

  const shutdown = async (signal) => {
    console.log(`[server] ${signal} received, shutting down`);
    server.close(async () => {
      await waitForPendingEmails();
      await disconnectDB();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
