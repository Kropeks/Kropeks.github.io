import { NextResponse } from 'next/server';

import { queryOne } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const INVALID_IMAGE_RESPONSE = NextResponse.json(
  { error: 'Image not found' },
  { status: 404 }
);

export async function GET(_request, { params }) {
  try {
    const postIdParam = params?.postId;
    if (!postIdParam) {
      return INVALID_IMAGE_RESPONSE;
    }

    const postIdNumeric = Number.parseInt(postIdParam, 10);
    if (!Number.isFinite(postIdNumeric) || postIdNumeric <= 0) {
      return INVALID_IMAGE_RESPONSE;
    }

    const imageRow = await queryOne(
      'SELECT mime_type, image_data FROM community_post_images WHERE post_id = ? LIMIT 1',
      [postIdNumeric]
    );

    if (!imageRow?.image_data || !imageRow?.mime_type) {
      return INVALID_IMAGE_RESPONSE;
    }

    const buffer = Buffer.isBuffer(imageRow.image_data)
      ? imageRow.image_data
      : Buffer.from(imageRow.image_data);

    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': imageRow.mime_type,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Disposition': `inline; filename="community-post-${postIdNumeric}"`,
      },
    });
  } catch (error) {
    console.error('Failed to fetch community post image:', error);
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 500 });
  }
}
