import dotenv from 'dotenv';

dotenv.config({ path: ['.env.local', '.env'] });

/** @type { import("drizzle-kit").Config } */
const drizzleConfig = {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL!,
  },
};

export default drizzleConfig;
