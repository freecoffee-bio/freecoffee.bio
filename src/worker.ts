import { handle } from '@astrojs/cloudflare/handler';
import { runScheduledTasks } from './server/scheduled';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return handle(request, env, ctx);
  },
  async scheduled(controller: ScheduledController, _env: Env, _ctx: ExecutionContext) {
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
