import { NextResponse } from 'next/server';
import path from 'path';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';

import { auth } from '@/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);

const normalizeUserId = (userId) => {
  if (userId === null || userId === undefined) {
    return null;
  }

  const numeric = Number.parseInt(userId, 10);
  return Number.isNaN(numeric) ? userId : numeric;
};

export async function POST(request) {
  try {
    const session = await auth();
    const userId = normalizeUserId(session?.user?.id);

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const formData = await request.formData();
    const avatarFile = formData.get('avatar');

    if (!avatarFile || typeof avatarFile === 'string') {
      return NextResponse.json({ error: 'No avatar file provided' }, { status: 400 });
    }

    if (avatarFile.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Avatar must be 5MB or smaller' }, { status: 400 });
    }

    const extension = ALLOWED_TYPES.get(avatarFile.type);
    if (!extension) {
      return NextResponse.json({ error: 'Unsupported image format' }, { status: 415 });
    }

    const arrayBuffer = await avatarFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'avatars');
    await mkdir(uploadDir, { recursive: true });

    const fileName = `${normalizeUserId(userId)}-${Date.now()}-${randomUUID()}.${extension}`;
    const filePath = path.join(uploadDir, fileName);

    await writeFile(filePath, buffer);

    const publicUrl = `/uploads/avatars/${fileName}`;

    await query('UPDATE users SET image = ?, updated_at = NOW() WHERE id = ?', [publicUrl, userId]);

    return NextResponse.json({ url: publicUrl });
  } catch (error) {
    console.error('Avatar upload failed:', error);
    return NextResponse.json({ error: 'Failed to upload avatar' }, { status: 500 });
  }
}
