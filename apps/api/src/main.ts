import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';

loadDotenv({ path: resolve(process.cwd(), '../../.env') });
loadDotenv({ path: resolve(process.cwd(), '.env') });
loadDotenv();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { loadEnv } from '@revenue/config';
import { probeRedisOrDisable, areQueuesEnabled } from './common/queues/queues.util';

async function bootstrap() {
  // Redis/RabbitMQ must never block API boot — probe then optionally disable queues
  await probeRedisOrDisable();

  const { AppModule } = await import('./app.module');
  const env = loadEnv(process.env);
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(helmet());
  app.enableCors({
    origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
  });
  app.setGlobalPrefix(env.API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swagger = new DocumentBuilder()
    .setTitle('Government Revenue Collection Platform API')
    .setDescription('Enterprise multi-agency revenue assessment, billing, payments, and treasury APIs')
    .setVersion('1.0.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(
    `API listening on ${env.API_URL} (port ${port}) queues=${areQueuesEnabled() ? 'on' : 'off (inline notifications)'}`,
  );
}

bootstrap();
