import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      message: 'Barcode integration has been removed from this application.'
    },
    { status: 410 }
  );
}
