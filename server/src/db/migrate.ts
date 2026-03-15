import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { db } from './index';

async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  await db.query(schema);
  console.log('Migration complete');
  await db.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
