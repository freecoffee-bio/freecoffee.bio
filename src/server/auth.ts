import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { env } from 'cloudflare:workers';
import { createDb } from '../db';
import * as schema from '../db/schema';
import { getAuthSecret } from '../lib/config';
import { twoFactor } from 'better-auth/plugins/two-factor';

export function createAuth() {
  return betterAuth({
    baseURL: {
      allowedHosts: ['localhost', '127.0.0.1', '*.workers.dev', '*.pages.dev', 'freecoffee.bio', '*.freecoffee.bio'],
      fallback: 'http://localhost:4321',
    },
    secret: getAuthSecret((env as unknown as { BETTER_AUTH_SECRET?: string }).BETTER_AUTH_SECRET),
    database: drizzleAdapter(createDb(env.DB), {
      provider: 'sqlite',
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
        twoFactor: schema.twoFactors,
      },
    }),
    emailAndPassword: { enabled: true, autoSignIn: true },
    plugins: [twoFactor({ issuer: 'FreeCoffee.bio' })],
    trustedOrigins: ['http://localhost:4321', 'https://freecoffee.bio'],
  });
}
