import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query, queryOne } from '@/lib/db';
import { randomUUID } from 'crypto';

export async function POST(request) {
  try {
    const { name, email, password } = await request.json();

    const trimmedName = name?.trim();
    const normalizedEmail = email?.trim().toLowerCase();

    // Validate input
    if (!trimmedName || !normalizedEmail || !password) {
      return NextResponse.json(
        { message: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { message: 'Password must be at least 6 characters long' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await queryOne(
      'SELECT id, email FROM users WHERE email = ?',
      [normalizedEmail]
    );

    if (existingUser) {
      console.warn('Register attempt blocked: email already registered', {
        attemptedEmail: normalizedEmail,
        existingUserId: existingUser.id,
      });
      return NextResponse.json(
        { message: 'An account with this email already exists. Please use a different email or sign in instead.' },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const userId = randomUUID();
    await query(
      'INSERT INTO users (id, name, email, password, email_verified) VALUES (?, ?, ?, ?, ?)',
      [userId, trimmedName, normalizedEmail, hashedPassword, new Date()]
    );

    // Get the created user
    const user = await queryOne(
      'SELECT id, name, email FROM users WHERE id = ?',
      [userId]
    );

    // Return success (don't include password in response)
    const { password: _pw, ...userWithoutPassword } = user;

    return NextResponse.json(
      {
        message: 'Account created successfully',
        user: userWithoutPassword
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Registration error:', error);

    // Handle specific database errors
    if (error.code === 'ER_DUP_ENTRY') {
      return NextResponse.json(
        { message: 'An account with this email already exists. Please use a different email or sign in instead.' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: 'Internal server error. Please try again later.' },
      { status: 500 }
    );
  }
}
