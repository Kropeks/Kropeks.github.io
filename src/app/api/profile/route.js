import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import bcrypt from 'bcryptjs';
import { query, queryOne } from '@/lib/db';

const PASSWORD_MIN_LENGTH = 8;

const PROFILE_SELECT = `
  SELECT
    u.name,
    u.email,
    u.image,
    CASE
      WHEN u.password IS NULL OR u.password = '' THEN 0
      ELSE 1
    END AS has_password,
    up.user_id AS profile_id,
    up.display_name,
    up.bio,
    up.location,
    up.preferred_cuisines,
    up.dietary_restrictions,
    up.dietary_preferences,
    up.notification_preferences,
    up.meal_planning_cadence
  FROM users u
  LEFT JOIN user_profiles up ON up.user_id = u.id
  WHERE u.id = ?
`;

const SECURITY_SELECT = `
  SELECT two_factor_enabled, backup_email
  FROM user_security_settings
  WHERE user_id = ?
`;

const ensureProfileRecords = async (userId) => {
  const profile = await queryOne('SELECT user_id FROM user_profiles WHERE user_id = ?', [userId]);
  if (!profile) {
    await query(
      'INSERT INTO user_profiles (user_id, created_at, updated_at) VALUES (?, NOW(3), NOW(3))',
      [userId],
    );
  }

  await query(
    'INSERT INTO user_security_settings (user_id, created_at, updated_at) VALUES (?, NOW(3), NOW(3)) ON DUPLICATE KEY UPDATE user_id = user_id',
    [userId],
  );
};

const parseJsonColumn = (value, defaultValue) => {
  if (!value) return defaultValue;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn('Failed to parse JSON column', value, error);
    return defaultValue;
  }
};

const getProfilePayload = async (userId) => {
  await ensureProfileRecords(userId);

  const profileRow = await queryOne(PROFILE_SELECT, [userId]);
  const securityRow = await queryOne(SECURITY_SELECT, [userId]);
  const [{ follower_count: followerCount = 0 } = {}] = await query(
    `SELECT COUNT(*) AS follower_count
     FROM user_follows
     WHERE following_id = ?`,
    [userId]
  );

  const [{ following_count: followingCount = 0 } = {}] = await query(
    `SELECT COUNT(*) AS following_count
     FROM user_follows
     WHERE follower_id = ?`,
    [userId]
  );

  return {
    user: {
      name: profileRow?.name ?? '',
      email: profileRow?.email ?? '',
      image: profileRow?.image ?? null,
    },
    profile: {
      displayName: profileRow?.display_name ?? '',
      bio: profileRow?.bio ?? '',
      location: profileRow?.location ?? '',
      followerCount: Number(followerCount ?? 0),
      followingCount: Number(followingCount ?? 0),
    },
    preferences: {
      dietaryRestrictions: parseJsonColumn(profileRow?.dietary_restrictions, []),
      dietaryPreferences: parseJsonColumn(profileRow?.dietary_preferences, {
        vegan: false,
        glutenFree: false,
        keto: false,
      }),
      notificationPreferences: parseJsonColumn(profileRow?.notification_preferences, {
        newsletters: true,
        productUpdates: false,
        communityHighlights: true,
      }),
      preferredCuisines: parseJsonColumn(profileRow?.preferred_cuisines, []),
      mealPlanningCadence: profileRow?.meal_planning_cadence ?? 'manual',
    },
    security: {
      twoFactorEnabled: Boolean(securityRow?.two_factor_enabled),
      backupEmail: securityRow?.backup_email ?? '',
      hasPassword: Boolean(profileRow?.has_password),
    },
  };
};

const updateUsersTable = async (userId, updates) => {
  const assignments = [];
  const params = [];

  if (updates.name !== undefined) {
    assignments.push('name = ?');
    params.push(updates.name);
  }

  if (updates.email !== undefined) {
    assignments.push('email = ?');
    params.push(updates.email);
  }

  if (updates.image !== undefined) {
    assignments.push('image = ?');
    params.push(updates.image || null);
  }

  if (updates.password !== undefined) {
    assignments.push('password = ?');
    params.push(updates.password || null);
  }

  if (!assignments.length) return;

  assignments.push('updated_at = NOW()');
  params.push(userId);

  await query(`UPDATE users SET ${assignments.join(', ')} WHERE id = ?`, params);
};

const updateUserProfile = async (userId, updates) => {
  const assignments = [];
  const params = [];

  if (updates.displayName !== undefined) {
    assignments.push('display_name = ?');
    params.push(updates.displayName || null);
  }

  if (updates.bio !== undefined) {
    assignments.push('bio = ?');
    params.push(updates.bio || null);
  }

  if (updates.location !== undefined) {
    assignments.push('location = ?');
    params.push(updates.location || null);
  }

  if (updates.notificationPreferences !== undefined) {
    assignments.push('notification_preferences = ?');
    params.push(JSON.stringify(updates.notificationPreferences));
  }

  if (updates.dietaryRestrictions !== undefined) {
    assignments.push('dietary_restrictions = ?');
    params.push(JSON.stringify(updates.dietaryRestrictions));
  }

  if (updates.dietaryPreferences !== undefined) {
    assignments.push('dietary_preferences = ?');
    params.push(JSON.stringify(updates.dietaryPreferences));
  }

  if (updates.preferredCuisines !== undefined) {
    assignments.push('preferred_cuisines = ?');
    params.push(JSON.stringify(updates.preferredCuisines));
  }

  if (updates.mealPlanningCadence !== undefined) {
    assignments.push('meal_planning_cadence = ?');
    params.push(updates.mealPlanningCadence || 'manual');
  }

  if (!assignments.length) return;

  assignments.push('updated_at = NOW()');
  params.push(userId);

  await query(`UPDATE user_profiles SET ${assignments.join(', ')} WHERE user_id = ?`, params);
};

const updateSecuritySettings = async (userId, updates) => {
  if (updates.twoFactorEnabled === undefined && updates.backupEmail === undefined) {
    return;
  }

  const assignments = [];
  const params = [];

  if (updates.twoFactorEnabled !== undefined) {
    assignments.push('two_factor_enabled = ?');
    params.push(updates.twoFactorEnabled ? 1 : 0);
  }

  if (updates.backupEmail !== undefined) {
    assignments.push('backup_email = ?');
    params.push(updates.backupEmail || null);
  }

  assignments.push('updated_at = NOW()');
  params.push(userId);

  await query(`UPDATE user_security_settings SET ${assignments.join(', ')} WHERE user_id = ?`, params);
};

export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const payload = await getProfilePayload(userId);
    return NextResponse.json(payload);
  } catch (error) {
    console.error('Failed to load profile settings:', error);
    return NextResponse.json({ error: 'Failed to load profile settings' }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();

    await ensureProfileRecords(userId);

    if (body.user) {
      await updateUsersTable(userId, {
        name: body.user.name,
        email: body.user.email,
        image: body.user.image,
      });
    }

    if (body.profile || body.preferences) {
      await updateUserProfile(userId, {
        displayName: body.profile?.displayName,
        bio: body.profile?.bio,
        location: body.profile?.location,
        notificationPreferences: body.preferences?.notificationPreferences,
        dietaryRestrictions: body.preferences?.dietaryRestrictions,
        dietaryPreferences: body.preferences?.dietaryPreferences,
        preferredCuisines: body.preferences?.preferredCuisines,
        mealPlanningCadence: body.preferences?.mealPlanningCadence,
      });
    }

    if (body.security?.passwordChange) {
      const passwordChange = body.security.passwordChange || {};
      const currentPassword = passwordChange.currentPassword?.toString() ?? '';
      const newPassword = passwordChange.newPassword?.toString().trim() ?? '';
      const confirmPassword = passwordChange.confirmPassword?.toString().trim() ?? '';

      if (!newPassword) {
        return NextResponse.json({ error: 'New password is required.' }, { status: 400 });
      }

      if (newPassword.length < PASSWORD_MIN_LENGTH) {
        return NextResponse.json(
          { error: `New password must be at least ${PASSWORD_MIN_LENGTH} characters.` },
          { status: 400 },
        );
      }

      if (newPassword !== confirmPassword) {
        return NextResponse.json({ error: 'Password confirmation does not match.' }, { status: 400 });
      }

      const userRow = await queryOne('SELECT password FROM users WHERE id = ? LIMIT 1', [userId]);
      const existingHash = userRow?.password?.toString() ?? '';

      if (existingHash) {
        if (!currentPassword) {
          return NextResponse.json({ error: 'Current password is required.' }, { status: 400 });
        }

        const matches = await bcrypt.compare(currentPassword, existingHash);
        if (!matches) {
          return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });
        }
      }

      const hashedPassword = await bcrypt.hash(newPassword, 12);
      await updateUsersTable(userId, { password: hashedPassword });
    }

    if (body.security) {
      await updateSecuritySettings(userId, {
        twoFactorEnabled: body.security?.twoFactorEnabled,
        backupEmail: body.security?.backupEmail,
      });
    }

    const payload = await getProfilePayload(userId);
    return NextResponse.json(payload);
  } catch (error) {
    console.error('Failed to update profile settings:', error);
    return NextResponse.json({ error: 'Failed to update profile settings' }, { status: 500 });
  }
}
