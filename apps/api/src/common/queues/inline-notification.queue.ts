import { Logger } from '@nestjs/common';
import { NotificationService } from '../../notification/notification.service';

/**
 * Drop-in when Redis/BullMQ is unavailable: process "send" jobs inline.
 */
export class InlineNotificationQueue {
  private readonly logger = new Logger(InlineNotificationQueue.name);

  constructor(private readonly notifications: NotificationService) {}

  async add(name: string, data: Record<string, unknown>) {
    if (name !== 'send') {
      this.logger.warn(`Ignoring unsupported job "${name}" (queues disabled)`);
      return { id: 'skipped' };
    }
    try {
      const notification = await this.notifications.enqueue(data as never);
      const result = await this.notifications.deliver(notification.id);
      this.logger.log(`Inline notification ${notification.id} => ${result.status}`);
      return { id: notification.id, result };
    } catch (err) {
      this.logger.error(`Inline notification failed: ${(err as Error).message}`);
      return { id: 'failed', error: (err as Error).message };
    }
  }
}
