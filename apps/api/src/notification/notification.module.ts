import { DynamicModule, Module } from '@nestjs/common';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { NotificationService } from './notification.service';
import { NotificationProcessor } from './notification.processor';
import { NotificationController } from './notification.controller';
import { areQueuesEnabled } from '../common/queues/queues.util';
import { InlineNotificationQueue } from '../common/queues/inline-notification.queue';

export const NOTIFICATIONS_QUEUE = 'notifications';

@Module({})
export class NotificationModule {
  static register(): DynamicModule {
    if (!areQueuesEnabled()) {
      return {
        module: NotificationModule,
        global: true,
        controllers: [NotificationController],
        providers: [
          NotificationService,
          {
            provide: getQueueToken(NOTIFICATIONS_QUEUE),
            useFactory: (notifications: NotificationService) => new InlineNotificationQueue(notifications),
            inject: [NotificationService],
          },
        ],
        exports: [NotificationService, getQueueToken(NOTIFICATIONS_QUEUE)],
      };
    }

    return {
      module: NotificationModule,
      global: true,
      imports: [BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE })],
      controllers: [NotificationController],
      providers: [NotificationService, NotificationProcessor],
      exports: [NotificationService, BullModule],
    };
  }
}
