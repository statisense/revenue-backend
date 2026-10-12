import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().default('Government Revenue Collection Platform'),
  APP_URL: z.string().url(),
  PAY_URL: z.string().url(),
  API_URL: z.string().url(),
  API_PREFIX: z.string().default('api/v1'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  RABBITMQ_URL: z.string().default('amqp://guest:guest@127.0.0.1:5672'),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  HMAC_PAYMENT_SECRET: z.string().min(32),
  FIELD_ENCRYPTION_KEY: z.string().min(64),

  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  COOKIE_SECURE: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  RATE_LIMIT_TTL: z.coerce.number().default(60),
  RATE_LIMIT_LIMIT: z.coerce.number().default(100),

  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_PUBLIC_KEY: z.string().optional(),
  PAYSTACK_WEBHOOK_SECRET: z.string().optional(),

  FLUTTERWAVE_SECRET_KEY: z.string().optional(),
  FLUTTERWAVE_PUBLIC_KEY: z.string().optional(),
  FLUTTERWAVE_SECRET_HASH: z.string().optional(),

  REMITA_MERCHANT_ID: z.string().optional(),
  REMITA_API_KEY: z.string().optional(),
  REMITA_SERVICE_TYPE_ID: z.string().optional(),
  REMITA_BASE_URL: z.string().optional(),

  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('noreply@revenue.gov.ng'),

  SMS_PROVIDER: z.enum(['console', 'twilio']).default('console'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM: z.string().optional(),

  WHATSAPP_PROVIDER: z.enum(['console', 'meta']).default('console'),
  TELEGRAM_BOT_TOKEN: z.string().optional(),

  VA_BANK_CODE: z.string().default('058'),
  VA_BANK_NAME: z.string().default('GTBank'),
  DEFAULT_CURRENCY: z.string().default('NGN'),
  PAYMENT_LINK_TTL_HOURS: z.coerce.number().default(72),
  TENANT_AGENCY_CODE: z.string().default('NCS'),
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return parsed.data;
}
