import { app } from './app';
import { env } from './config/env';
import { migrate, pool } from './config/db';
import './config/firebase';

async function main(): Promise<void> {
  await migrate();
  const server = app.listen(env.PORT, () => console.log(`Chat backend listening on :${env.PORT}`));

  const shutdown = async () => {
    server.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start', err);
  process.exit(1);
});
