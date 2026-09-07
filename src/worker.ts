import astroServer from '@astrojs/cloudflare/entrypoints/server';
import { runScheduledTasks } from './server/scheduled';

export default {
  fetch: astroServer.fetch,
  async scheduled(controller: ScheduledController) {
    try {
      await runScheduledTasks();
    } catch (error) {
      const details = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { message: String(error) };
      console.error('Cron scheduled task failed', JSON.stringify(details));
      controller.noRetry();
      throw error;
    }
  },
};
