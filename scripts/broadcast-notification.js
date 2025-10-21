#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const envLocalPath = path.join(projectRoot, '.env.local');
const envPath = fs.existsSync(envLocalPath) ? envLocalPath : path.join(projectRoot, '.env');
dotenv.config({ path: envPath });

import { query, queryOne } from '../src/lib/db.js';
import { NotificationService } from '../src/lib/notifications/service.js';

const ADMIN_EMAIL_FALLBACK = 'savoryadmin@example.com';
const TITLE_MAX_LENGTH = 120;
const BODY_MAX_LENGTH = 1000;

function printUsage() {
  console.log(`Usage: npm run notify:admin -- --title "Maintenance" --body "Details" [options]\n\nOptions:\n  --title <text>           Notification title (required, max ${TITLE_MAX_LENGTH})\n  --body <text>            Notification body (required, max ${BODY_MAX_LENGTH})\n  --type <admin_message|system>  Notification type (default: admin_message)\n  --metadata <json>        Optional metadata JSON\n  --userIds <id1,id2>      Target specific user IDs (default: all verified, active users)\n  --adminId <id>           ID of admin sending the broadcast\n  --adminEmail <email>     Email of admin (fallback: ${ADMIN_EMAIL_FALLBACK})\n  --notify <true|false>    Whether to push via websocket (default: true)\n  --help                   Show this message`);
}

function parseArgs(argv) {
  const options = {
    notify: true,
    type: 'admin_message',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help') {
      options.help = true;
      return options;
    }

    const next = argv[index + 1];

    switch (arg) {
      case '--title':
        if (!next) throw new Error('Missing value for --title');
        options.title = next;
        index += 1;
        break;
      case '--body':
        if (!next) throw new Error('Missing value for --body');
        options.body = next;
        index += 1;
        break;
      case '--type':
        if (!next) throw new Error('Missing value for --type');
        options.type = next;
        index += 1;
        break;
      case '--metadata':
        if (!next) throw new Error('Missing value for --metadata');
        options.metadata = next;
        index += 1;
        break;
      case '--userIds':
        if (!next) throw new Error('Missing value for --userIds');
        options.userIds = next;
        index += 1;
        break;
      case '--adminId':
        if (!next) throw new Error('Missing value for --adminId');
        options.adminId = next;
        index += 1;
        break;
      case '--adminEmail':
        if (!next) throw new Error('Missing value for --adminEmail');
        options.adminEmail = next;
        index += 1;
        break;
      case '--notify':
        if (!next) throw new Error('Missing value for --notify');
        options.notify = next.toLowerCase() !== 'false';
        index += 1;
        break;
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unknown option: ${arg}`);
        }
    }
  }

  return options;
}

function sanitizeUserIds(rawUserIds) {
  if (!rawUserIds) return [];

  return rawUserIds
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Number.parseInt(value, 10))
    .filter((value, index, array) => Number.isInteger(value) && value > 0 && array.indexOf(value) === index);
}

function parseMetadata(raw) {
  if (!raw) return { value: null };

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      return { value: parsed };
    }
    return { error: 'Metadata must be a JSON object' };
  } catch (error) {
    return { error: 'Metadata must be valid JSON' };
  }
}

async function resolveAdminId(options) {
  if (options.adminId) {
    const parsed = Number.parseInt(options.adminId, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
    throw new Error('Invalid adminId value');
  }

  const adminEmail = options.adminEmail || ADMIN_EMAIL_FALLBACK;
  if (!adminEmail) {
    return null;
  }

  const row = await queryOne('SELECT id FROM users WHERE email = ? LIMIT 1', [adminEmail.toLowerCase()]);
  return row?.id ?? null;
}

async function fetchTargetUserIds(userIds) {
  const sanitized = sanitizeUserIds(userIds);
  if (sanitized.length) {
    return sanitized;
  }

  const rows = await query(
    `SELECT id
       FROM users`
  );

  return rows
    .map((row) => Number.parseInt(row.id, 10))
    .filter((id) => Number.isInteger(id) && id > 0);
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printUsage();
      process.exit(0);
    }

    if (!options.title || !options.body) {
      throw new Error('Both --title and --body are required');
    }

    if (options.title.length > TITLE_MAX_LENGTH) {
      throw new Error(`Title exceeds ${TITLE_MAX_LENGTH} characters`);
    }

    if (options.body.length > BODY_MAX_LENGTH) {
      throw new Error(`Body exceeds ${BODY_MAX_LENGTH} characters`);
    }

    const metadataResult = parseMetadata(options.metadata);
    if (metadataResult.error) {
      throw new Error(metadataResult.error);
    }

    const type = options.type && ['admin_message', 'system'].includes(options.type)
      ? options.type
      : 'admin_message';

    const targetIds = await fetchTargetUserIds(options.userIds);
    if (!targetIds.length) {
      throw new Error('No target users found. Provide --userIds or ensure users exist.');
    }

    const adminId = await resolveAdminId(options);

    const entries = targetIds.map((id) => ({
      userId: String(id),
      actorId: adminId ? String(adminId) : null,
      type,
      title: options.title,
      body: options.body,
      metadata: metadataResult.value,
      notify: options.notify,
    }));

    let createdTotal = 0;
    const batchSize = 500;
    for (let index = 0; index < entries.length; index += batchSize) {
      const slice = entries.slice(index, index + batchSize);
      const created = await NotificationService.createNotificationsBulk(slice);
      createdTotal += created.length;
    }

    const metadataJson = metadataResult.value ? JSON.stringify(metadataResult.value) : null;

    await query(
      `INSERT INTO admin_notifications_log (admin_id, type, title, body, metadata, target_count, created_count, notify)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        adminId ?? null,
        type,
        options.title,
        options.body,
        metadataJson,
        targetIds.length,
        createdTotal,
        options.notify ? 1 : 0,
      ]
    );

    console.log('✅ Broadcast complete');
    console.log(`   Type: ${type}`);
    console.log(`   Title: ${options.title}`);
    console.log(`   Targets: ${targetIds.length}`);
    console.log(`   Inserted: ${createdTotal}`);
    console.log(`   Notify: ${options.notify ? 'yes' : 'no'}`);
    if (adminId) {
      console.log(`   Admin ID: ${adminId}`);
    }
  } catch (error) {
    console.error('❌ Broadcast failed:', error.message);
    if (process.env.DEBUG === 'true') {
      console.error(error);
    }
    printUsage();
    process.exit(1);
  }
}

await main();
