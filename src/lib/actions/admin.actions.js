'use server';

import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { pool, query, queryOne } from '@/lib/db';
import { NotificationService } from '@/lib/notifications/service';

const SUBSCRIPTION_STATUS_VALUES = ['active', 'canceled', 'expired', 'past_due'];
const SUBSCRIPTION_CANCEL_SOURCES = ['user', 'system', 'admin'];
const SUBSCRIPTION_REFUND_STATUSES = ['not_requested', 'pending', 'processed', 'denied'];

const computeNextBillingDate = (startDate, billingCycle) => {
  if (!startDate) {
    return null;
  }

  const baseDate = new Date(startDate);
  if (Number.isNaN(baseDate.getTime())) {
    return null;
  }

  const normalizedCycle = (billingCycle || '').toString().toLowerCase();
  if (normalizedCycle === 'yearly') {
    baseDate.setFullYear(baseDate.getFullYear() + 1);
  } else {
    baseDate.setMonth(baseDate.getMonth() + 1);
  }

  return baseDate;
};

const parsePlanFeatures = (rawFeatures) => {
  if (!rawFeatures) {
    return [];
  }

  if (Array.isArray(rawFeatures)) {
    return rawFeatures;
  }

  try {
    const parsed = JSON.parse(rawFeatures);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Failed to parse subscription plan features:', error);
    return [];
  }
};

const normalizeSubscriptionRow = (row) => {
  if (!row) {
    return null;
  }

  const nextBillingDate = row.nextBillingDate || computeNextBillingDate(row.startDate, row.billingCycle);

  return {
    id: row.id,
    status: row.status,
    startDate: row.startDate,
    endDate: row.endDate,
    nextBillingDate,
    paymentMethod: row.paymentMethod,
    lastPaymentDate: row.lastPaymentDate,
    createdAt: row.createdAt,
    plan: {
      id: row.planId,
      name: row.planName || 'Custom Plan',
      price: row.price,
      billingCycle: row.billingCycle,
      features: parsePlanFeatures(row.features),
    },
    customer: {
      id: row.userId,
      email: row.email,
      name: row.name || row.email?.split('@')[0] || 'Unknown User',
      subscriptionStatus: row.userSubscriptionStatus,
    },
  };
};

// Get admin dashboard statistics
export async function getAdminStats() {
  const session = await auth();
  
  const userEmail = session?.user?.email?.toLowerCase();
  const userRole = session?.user?.role?.toUpperCase(); // Match DB case
  const isAdminUser = userRole === 'ADMIN' || userEmail === 'savoryadmin@example.com';
  
  if (!isAdminUser) {
    console.log('Admin action unauthorized:', { userEmail, userRole });
    throw new Error('Unauthorized');
  }

  const warnings = [];
  let fallbackUsed = false;

  const markWarning = (message, options = {}) => {
    if (message) {
      warnings.push(message);
    }

    if (options.fallback) {
      fallbackUsed = true;
    }
  };

  try {
    const safeQuery = async (sql, params = []) => {
      try {
        return await query(sql, params);
      } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
          console.warn(`Skipping query, missing table: ${error.message}`);
          markWarning(`Missing table detected while fetching admin stats: ${error.message}`, { fallback: true });
          return [];
        }

        if (error.message?.includes('Unknown column')) {
          console.warn(`Skipping query, missing column: ${error.message}`);
          markWarning(`Missing column detected while fetching admin stats: ${error.message}`, { fallback: true });
          return [];
        }

        throw error;
      }
    };

    const getCount = async (sql, params = []) => {
      const rows = await safeQuery(sql, params);
      if (!rows?.length) {
        return 0;
      }

      const first = rows[0];
      return first?.count ?? 0;
    };

    const totalUsers = await getCount('SELECT COUNT(*) as count FROM users');
    const newUsers = await getCount(
      'SELECT COUNT(*) as count FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)'
    );

    const totalRecipes = await getCount('SELECT COUNT(*) as count FROM recipes');
    const newRecipes = await getCount(
      'SELECT COUNT(*) as count FROM recipes WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)'
    );

    const pendingReviews = await getCount(
      'SELECT COUNT(*) as count FROM reviews WHERE status = ?',
      ['pending']
    );

    let monthlyActiveUsers = await getCount(
      'SELECT COUNT(DISTINCT user_id) as count FROM user_sessions WHERE last_activity >= DATE_SUB(NOW(), INTERVAL 30 DAY)'
    );

    if (monthlyActiveUsers === 0) {
      monthlyActiveUsers = await getCount(
        'SELECT COUNT(*) as count FROM users WHERE last_login >= DATE_SUB(NOW(), INTERVAL 30 DAY)'
      );
    }

    const now = new Date();
    const monthsBack = 5; // inclusive of current month = 6 months total
    const startDate = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
    const startDateString = startDate.toISOString().split('T')[0];

    const monthSequence = Array.from({ length: monthsBack + 1 }, (_, index) => {
      const date = new Date(startDate.getFullYear(), startDate.getMonth() + index, 1);
      return {
        monthKey: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        isoDate: date.toISOString().split('T')[0],
        label: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      };
    });

    const mapRowsToSeries = (rows) =>
      rows.reduce((acc, row) => {
        if (row?.month_key) {
          acc[row.month_key] = Number(row.count) || 0;
        }
        return acc;
      }, {});

    const monthlyNewUsersRows = await safeQuery(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month_key, COUNT(*) AS count
       FROM users
       WHERE created_at >= ?
       GROUP BY month_key
       ORDER BY month_key`,
      [startDateString]
    );

    const monthlyNewRecipesRows = await safeQuery(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month_key, COUNT(*) AS count
       FROM recipes
       WHERE created_at >= ?
       GROUP BY month_key
       ORDER BY month_key`,
      [startDateString]
    );

    let monthlyActiveRows = await safeQuery(
      `SELECT DATE_FORMAT(last_activity, '%Y-%m') AS month_key, COUNT(DISTINCT user_id) AS count
       FROM user_sessions
       WHERE last_activity >= ?
       GROUP BY month_key
       ORDER BY month_key`,
      [startDateString]
    );

    if (!monthlyActiveRows.length) {
      monthlyActiveRows = await safeQuery(
        `SELECT DATE_FORMAT(last_login, '%Y-%m') AS month_key, COUNT(*) AS count
         FROM users
         WHERE last_login IS NOT NULL AND last_login >= ?
         GROUP BY month_key
         ORDER BY month_key`,
        [startDateString]
      );
    }

    const monthlyPendingReviewsRows = await safeQuery(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month_key, COUNT(*) AS count
       FROM reviews
       WHERE created_at >= ? AND status = 'pending'
       GROUP BY month_key
       ORDER BY month_key`,
      [startDateString]
    );

    const monthKeys = monthSequence.map((item) => item.monthKey);
    const labels = monthSequence.map((item) => item.isoDate);
    const formattedLabels = monthSequence.map((item) => item.label);

    const monthlySeriesHasData = [
      monthlyNewUsersRows,
      monthlyNewRecipesRows,
      monthlyActiveRows,
      monthlyPendingReviewsRows,
    ].some((rows) => rows?.length);

    if (!monthlySeriesHasData) {
      markWarning('No recent activity data found; displaying fallback analytics.', { fallback: true });
    }

    const newUsersSeriesMap = mapRowsToSeries(monthlyNewUsersRows);
    const newRecipesSeriesMap = mapRowsToSeries(monthlyNewRecipesRows);
    const activeSeriesMap = mapRowsToSeries(monthlyActiveRows);
    const pendingSeriesMap = mapRowsToSeries(monthlyPendingReviewsRows);

    const monthlySeries = {
      labels,
      formattedLabels,
      newUsers: monthKeys.map((key) => newUsersSeriesMap[key] ?? 0),
      newRecipes: monthKeys.map((key) => newRecipesSeriesMap[key] ?? 0),
      monthlyActiveUsers: monthKeys.map((key) => activeSeriesMap[key] ?? 0),
      pendingReviews: monthKeys.map((key) => pendingSeriesMap[key] ?? 0),
      meta: {
        hasData: monthlySeriesHasData,
        rangeStart: startDateString,
      },
    };

    const parseJsonField = (value) => {
      if (!value) {
        return null;
      }

      if (typeof value !== 'string') {
        return value;
      }

      try {
        return JSON.parse(value);
      } catch (error) {
        console.warn('Unable to parse JSON field in recent activity:', error);
        markWarning('Failed to parse activity details for one or more audit log entries.', {});
        return null;
      }
    };

    const recentActivityRows = await safeQuery(
      `SELECT 
         a.id,
         a.action,
         a.entity_type,
         a.entity_id,
         a.created_at,
         a.notes,
         a.old_values,
         a.new_values,
         u.id AS user_id,
         u.name AS user_name,
         u.email AS user_email
       FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       ORDER BY a.created_at DESC
       LIMIT 12`
    );

    const recentActivity = recentActivityRows.map((row) => {
      const newValues = parseJsonField(row.new_values);
      const oldValues = parseJsonField(row.old_values);

      const resolveSummary = () => {
        const candidates = [
          newValues?.title,
          newValues?.name,
          newValues?.email,
          newValues?.slug,
          oldValues?.title,
          oldValues?.name,
          oldValues?.email,
          oldValues?.slug,
        ].filter((value) => typeof value === 'string' && value.trim().length > 0);

        if (candidates.length) {
          return candidates[0];
        }

        if (row.entity_id !== null && row.entity_id !== undefined) {
          return String(row.entity_id);
        }

        return null;
      };

      return {
        id: row.id,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        createdAt: row.created_at,
        notes: row.notes ?? null,
        entitySummary: resolveSummary(),
        user: {
          id: row.user_id ?? null,
          name: row.user_name ?? null,
          email: row.user_email ?? null,
        },
      };
    });

    return {
      totalUsers,
      newUsers,
      totalRecipes,
      newRecipes,
      pendingReviews,
      monthlyActiveUsers,
      monthlySeries,
      recentActivity,
      meta: {
        warnings,
        fallbackUsed,
        monthlySeriesHasData,
        recentActivityCount: recentActivity.length,
      },
    };
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    markWarning(`Failed to fetch admin stats: ${error.message || 'Unknown error'}`, { fallback: true });

    // Return fallback values in case of error
    return {
      totalUsers: 0,
      totalRecipes: 0,
      pendingReviews: 0,
      monthlyActiveUsers: 0,
      monthlySeries: {
        labels: [],
        formattedLabels: [],
        newUsers: [],
        newRecipes: [],
        monthlyActiveUsers: [],
        pendingReviews: [],
        meta: {
          hasData: false,
          rangeStart: null,
        },
      },
      recentActivity: [],
      meta: {
        warnings,
        fallbackUsed: true,
        monthlySeriesHasData: false,
        recentActivityCount: 0,
      },
    };
  }
}

// Get all users with pagination and filtering
// Update user status (active/suspended)
export async function updateUserStatus(userId, status) {
  const session = await auth();
  
  const userEmail = session?.user?.email?.toLowerCase();
  const userRole = session?.user?.role?.toUpperCase(); // Match DB case
  const isAdminUser = userRole === 'ADMIN' || userEmail === 'savoryadmin@example.com';
  
  if (!isAdminUser) {
    console.log('Admin action unauthorized:', { userEmail, userRole });
    throw new Error('Unauthorized');
  }

  try {
    // Prevent deactivating yourself
    if (session.user.id === userId) {
      throw new Error('You cannot modify your own status');
    }

    // Prevent modifying other admins unless you're the main admin
    if (userEmail !== 'savoryadmin@example.com') {
      const [targetUser] = await query('SELECT role FROM users WHERE id = ?', [userId]);
      if (targetUser?.role === 'ADMIN') {
        throw new Error('Only the main admin can modify other admins');
      }
    }

    const normalizedStatus = status === 'suspended' ? 'suspended' : status === 'active' ? 'active' : 'pending';
    const isVerified = normalizedStatus === 'active' ? 1 : 0;

    await query(
      'UPDATE users SET account_status = ?, is_verified = ?, updated_at = NOW(3) WHERE id = ?',
      [normalizedStatus, isVerified, userId]
    );

    // Try to log the action (admin_audit_log table might not exist)
    try {
      await query(
        'INSERT INTO admin_audit_log (admin_id, action, target_id, details) VALUES (?, ?, ?, ?)',
        [
          session.user.id,
          'UPDATE_USER_STATUS',
          userId,
          JSON.stringify({ status: normalizedStatus, is_verified: isVerified })
        ]
      );
    } catch (logError) {
      console.warn('Failed to log admin action (table might not exist):', logError);
    }

    revalidatePath('/admin/users');
    return { 
      success: true, 
      message: `User marked as ${normalizedStatus} successfully`,
      data: { account_status: normalizedStatus, is_verified: isVerified }
    };
  } catch (error) {
    console.error('Error updating user status:', error);
    throw new Error(error.message || 'Failed to update user status');
  }
}

export async function getUsers({ page = 1, limit = 10, search = '', status = 'all' }) {
  console.log('=== Starting getUsers function ===');
  console.log('Parameters:', { page, limit, search, status });
  
  try {
    const session = await auth();
    console.log('Session data:', {
      hasSession: !!session,
      user: session?.user ? {
        email: session.user.email,
        role: session.user.role,
        id: session.user.id
      } : 'No user in session'
    });
    
    if (!session?.user) {
      console.error('No user session found');
      throw new Error('Authentication required');
    }
    
    const userEmail = session.user.email?.toLowerCase();
    const userRole = session.user.role?.toUpperCase();
    const isAdminUser = userRole === 'ADMIN' || userEmail === 'savoryadmin@example.com';
    
    console.log('Admin check:', { userEmail, userRole, isAdminUser });
    
    if (!isAdminUser) {
      console.error('Admin action unauthorized:', { userEmail, userRole });
      throw new Error('Unauthorized: Admin privileges required');
    }

    const offset = (page - 1) * limit;
    const params = [];
    
    console.log('Building query with pagination:', { page, limit, offset, status });
    
    const statusExpression = "COALESCE(u.account_status, CASE WHEN u.is_verified = 1 THEN 'active' ELSE 'pending' END)";

    // Base query - updated to match database schema
    let queryStr = `
      SELECT 
        u.id, 
        u.email, 
        u.name,
        u.name as displayName,
        u.role,
        ${statusExpression} as status,
        u.created_at as createdAt,
        u.updated_at as updatedAt,
        u.is_verified,
        u.account_status,
        (SELECT COUNT(*) FROM recipes r WHERE r.user_id = u.id) as recipeCount
      FROM users u
      WHERE 1=1
    `;

    // Add search filter
    if (search) {
      queryStr += ' AND (u.email LIKE ? OR u.name LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
      console.log('Added search filter:', { search, searchTerm });
    }
    
    // Add status filter
    let statusFilterClause = '';
    if (status === 'active') {
      statusFilterClause = `${statusExpression} = 'active'`;
      queryStr += ` AND ${statusFilterClause}`;
      console.log('Filtering for active users');
    } else if (status === 'pending') {
      statusFilterClause = `${statusExpression} = 'pending'`;
      queryStr += ` AND ${statusFilterClause}`;
      console.log('Filtering for pending users');
    } else if (status === 'suspended') {
      statusFilterClause = `${statusExpression} = 'suspended'`;
      queryStr += ` AND ${statusFilterClause}`;
      console.log('Filtering for suspended users');
    } else {
      statusFilterClause = `${statusExpression} <> 'suspended'`;
      queryStr += ` AND ${statusFilterClause}`;
      console.log('Excluding suspended users from default results');
    }

    // Add order and limit
    queryStr += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    console.log('Final query with pagination:', { limit, offset });

    // Get users
    console.log('Executing users query:', queryStr, params);
    const users = await query(queryStr, params);
    console.log('Retrieved users:', users.length);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM users u WHERE 1=1';
    const countParams = [];

    if (search) {
      countQuery += ' AND (u.email LIKE ? OR u.name LIKE ? OR u.username LIKE ?)';
      const searchTerm = `%${search}%`;
      countParams.push(searchTerm, searchTerm, searchTerm);
    }

    if (statusFilterClause) {
      countQuery += ` AND ${statusFilterClause}`;
    }

    console.log('Executing count query:', countQuery, countParams);
    const [countResult] = await query(countQuery, countParams);
    const total = countResult?.total || 0;

    return {
      users,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    console.error('Error in getUsers:', error);
    return {
      users: [],
      pagination: {
        total: 0,
        page,
        limit,
        totalPages: 0
      }
    };
  }
}

// Get all recipes with filtering
export async function fetchAdminRecipesFromDb({ page = 1, limit = 10, status = 'all', search = '' }) {
  const parsedPage = Number.parseInt(page, 10);
  const safePage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const parsedLimit = Number.parseInt(limit, 10);
  const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10;
  const offset = (safePage - 1) * safeLimit;
  const params = [];

  const normalizedStatus = typeof status === 'string' ? status.toLowerCase() : 'all';

  let queryStr = `
      SELECT
        r.id,
        r.slug,
        r.title,
        r.description,
        r.image AS image,
        r.prep_time AS prepTime,
        r.cook_time AS cookTime,
        r.servings,
        r.difficulty,
        r.cuisine,
        r.status AS publicationStatus,
        r.approval_status AS moderationStatus,
        r.is_public AS isPublic,
        r.submitted_at AS submittedAt,
        r.created_at AS createdAt,
        r.updated_at AS updatedAt,
        u.id AS userId,
        u.name AS authorName,
        u.email AS authorEmail,
        NULL AS authorUsername,
        0 AS reviewCount,
        NULL AS averageRating
      FROM recipes r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE 1 = 1
    `;

  if (normalizedStatus && normalizedStatus !== 'all') {
    if (['pending', 'approved', 'rejected'].includes(normalizedStatus)) {
      queryStr += ' AND r.approval_status = ?';
      params.push(normalizedStatus);
    } else if (['draft', 'published', 'archived'].includes(normalizedStatus)) {
      queryStr += ' AND r.status = ?';
      params.push(normalizedStatus.toUpperCase());
    }
  }

  if (search) {
    const searchTerm = `%${search}%`;
    queryStr += ' AND (r.title LIKE ? OR r.description LIKE ?)';
    params.push(searchTerm, searchTerm);
  }

  queryStr += ' ORDER BY COALESCE(r.submitted_at, r.created_at) DESC, r.created_at DESC LIMIT ? OFFSET ?';
  params.push(safeLimit, offset);

  const recipes = await query(queryStr, params);

  let countQuery = 'SELECT COUNT(*) AS total FROM recipes r WHERE 1 = 1';
  const countParams = [];

  if (normalizedStatus && normalizedStatus !== 'all') {
    if (['pending', 'approved', 'rejected'].includes(normalizedStatus)) {
      countQuery += ' AND r.approval_status = ?';
      countParams.push(normalizedStatus);
    } else if (['draft', 'published', 'archived'].includes(normalizedStatus)) {
      countQuery += ' AND r.status = ?';
      countParams.push(normalizedStatus.toUpperCase());
    }
  }

  if (search) {
    const searchTerm = `%${search}%`;
    countQuery += ' AND (r.title LIKE ? OR r.description LIKE ?)';
    countParams.push(searchTerm, searchTerm);
  }

  const [countResult] = await query(countQuery, countParams);
  const total = countResult?.total || 0;

  const normalizedRecipes = recipes.map((recipe) => {
    const authorUsername = recipe.authorUsername || (recipe.authorEmail ? recipe.authorEmail.split('@')[0] : null);

    return {
      id: recipe.slug || recipe.id,
      databaseId: recipe.id,
      slug: recipe.slug,
      title: recipe.title,
      description: recipe.description,
      image: recipe.image,
      prepTime: recipe.prepTime,
      cookTime: recipe.cookTime,
      servings: recipe.servings,
      difficulty: recipe.difficulty,
      cuisine: recipe.cuisine,
      status: recipe.moderationStatus ?? 'pending',
      moderationStatus: recipe.moderationStatus ?? 'pending',
      publicationStatus: recipe.publicationStatus,
      isPublic: recipe.isPublic === 1,
      submittedAt: recipe.submittedAt,
      createdAt: recipe.createdAt,
      updatedAt: recipe.updatedAt,
      reviewCount: recipe.reviewCount ?? 0,
      averageRating: recipe.averageRating ?? null,
      dietaryInfo: [],
      allergens: [],
      author: {
        id: recipe.userId,
        name: recipe.authorName || 'Unknown author',
        email: recipe.authorEmail || null,
        username: authorUsername,
      },
    };
  });

  return {
    recipes: normalizedRecipes,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
}

export async function getRecipes({ page = 1, limit = 10, status = 'all', search = '' }) {
  const session = await auth();

  const userEmail = session?.user?.email?.toLowerCase();
  const userRole = session?.user?.role?.toLowerCase();
  const isAdminUser = userRole === 'admin' || userEmail === 'savoryadmin@example.com';

  if (!isAdminUser) {
    console.log('Admin action unauthorized:', { userEmail, userRole });
    throw new Error('Unauthorized');
  }

  try {
    return await fetchAdminRecipesFromDb({ page, limit, status, search });
  } catch (error) {
    console.error('Error fetching recipes:', error);

    const parsedPage = Number.parseInt(page, 10);
    const safePage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const parsedLimit = Number.parseInt(limit, 10);
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10;

    return { recipes: [], pagination: { total: 0, page: safePage, limit: safeLimit, totalPages: 0 } };
  }
}

// Update recipe status (approved/rejected)
export async function updateRecipeStatus(recipeId, status, feedback = '') {
  const session = await auth();
  
  const userEmail = session?.user?.email?.toLowerCase();
  const userRole = session?.user?.role?.toLowerCase();
  const isAdminUser = userRole === 'admin' || userEmail === 'savoryadmin@example.com';
  
  if (!isAdminUser) {
    console.log('Admin action unauthorized:', { userEmail, userRole });
    throw new Error('Unauthorized');
  }

  let connection;
  try {
    // Get database connection
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Get recipe details
    const [recipeRows] = await connection.query(
      `SELECT id, slug, user_id as userId, approval_status as currentStatus
       FROM recipes
       WHERE id = ? OR slug = ?
       LIMIT 1 FOR UPDATE`,
      [recipeId, recipeId]
    );

    const recipe = recipeRows?.[0];

    if (!recipe) {
      throw new Error('Recipe not found');
    }

    // Prevent duplicate status updates
    if (recipe.currentStatus?.toLowerCase() === status.toLowerCase()) {
      throw new Error(`Recipe is already ${status}`);
    }

    // Update recipe status
    await connection.query(
      'UPDATE recipes SET approval_status = ?, updated_at = NOW(3) WHERE id = ?',
      [status.toLowerCase(), recipe.id]
    );

    // Add status history
    await connection.query(
      'INSERT INTO recipe_status_history (recipe_id, status, changed_by, notes) VALUES (?, ?, ?, ?)',
      [recipe.id, status.toLowerCase(), session.user.id, feedback || `Status changed to ${status}`]
    );

    // Log the action to audit_logs table
    try {
      await query(
        `INSERT INTO audit_logs 
        (user_id, action, entity_type, entity_id, new_values, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          session.user.id,
          'UPDATE_RECIPE_STATUS',
          'recipe',
          recipeId,
          JSON.stringify({ status, feedback: feedback || `Recipe ${status}` }),
          null, // ip_address
          null  // user_agent
        ]
      );
    } catch (logError) {
      console.warn('Failed to log recipe status update:', logError);
      // Continue execution even if logging fails
    }

    await connection.commit();
    revalidatePath('/admin/recipes');
    return { success: true, message: `Recipe ${status} successfully` };
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Error updating recipe status:', error);
    throw new Error(error.message || 'Failed to update recipe status');
  } finally {
    if (connection) connection.release();
  }
}

// Get subscription data
export async function getSubscriptions({ page = 1, limit = 10, status = 'active', search = '' }) {
  const session = await auth();
  
  const userEmail = session?.user?.email?.toLowerCase();
  const userRole = session?.user?.role?.toLowerCase();
  const isAdminUser = userRole === 'admin' || userEmail === 'savoryadmin@example.com';
  
  if (!isAdminUser) {
    console.log('Admin action unauthorized:', { userEmail, userRole });
    throw new Error('Unauthorized');
  }

  try {
    const offset = (page - 1) * limit;
    const params = [];

    let queryStr = `
      SELECT
        s.id,
        s.status,
        s.start_date AS startDate,
        s.end_date AS endDate,
        s.next_billing_date AS nextBillingDate,
        s.payment_method AS paymentMethod,
        s.last_payment_date AS lastPaymentDate,
        s.created_at AS createdAt,
        u.id AS userId,
        u.email,
        u.name,
        u.subscription_status AS userSubscriptionStatus,
        sp.id AS planId,
        sp.name AS planName,
        sp.price,
        sp.billing_cycle AS billingCycle,
        sp.features
      FROM subscriptions s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
      WHERE 1 = 1
    `;

    if (status && status !== 'all') {
      queryStr += ' AND s.status = ?';
      params.push(status);
    }

    if (search) {
      queryStr += ' AND (u.email LIKE ? OR u.name LIKE ? OR sp.name LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    queryStr += ' ORDER BY s.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = await query(queryStr, params);

    const countParams = [];
    let countQuery = `
      SELECT COUNT(*) AS total
      FROM subscriptions s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
      WHERE 1 = 1
    `;

    if (status && status !== 'all') {
      countQuery += ' AND s.status = ?';
      countParams.push(status);
    }

    if (search) {
      countQuery += ' AND (u.email LIKE ? OR u.name LIKE ? OR sp.name LIKE ?)';
      const searchTerm = `%${search}%`;
      countParams.push(searchTerm, searchTerm, searchTerm);
    }

    const [countResult] = await query(countQuery, countParams);
    const total = countResult?.total || 0;

    const subscriptions = rows.map((row) => normalizeSubscriptionRow(row));

    return {
      subscriptions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    console.error('Error fetching premium subscriptions:', error);
    throw new Error('Failed to fetch premium subscriptions');
  }
}

// Update subscription status
export async function updateSubscription(subscriptionId, data) {
  const session = await auth();
  
  const userEmail = session?.user?.email?.toLowerCase();
  const userRole = session?.user?.role?.toLowerCase();
  const isAdminUser = userRole === 'admin' || userEmail === 'savoryadmin@example.com';
  
  if (!isAdminUser) {
    console.log('Admin action unauthorized:', { userEmail, userRole });
    throw new Error('Unauthorized');
  }

  const normalizedId = Number.parseInt(subscriptionId, 10);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
    throw new Error('Invalid subscription ID');
  }

  const updatePayload = typeof data === 'object' && data !== null ? data : {};

  const coerceDate = (value, fieldName) => {
    if (value === undefined) {
      return undefined;
    }

    if (value === null || value === '') {
      return null;
    }

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        throw new Error(`Invalid ${fieldName} provided`);
      }
      return value;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Invalid ${fieldName} provided`);
    }

    return parsed;
  };

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existingRows] = await connection.query(
      `SELECT
        s.id,
        s.user_id AS userId,
        s.plan_id AS planId,
        s.status,
        s.cancel_reason AS cancelReason,
        s.cancel_source AS cancelSource,
        s.canceled_at AS canceledAt,
        s.refund_status AS refundStatus,
        s.refund_amount AS refundAmount,
        s.refund_currency AS refundCurrency,
        s.payment_method AS paymentMethod,
        s.last_payment_date AS lastPaymentDate,
        s.next_billing_date AS nextBillingDate,
        s.start_date AS startDate,
        s.end_date AS endDate,
        s.created_at AS createdAt,
        u.email,
        u.name,
        u.subscription_status AS userSubscriptionStatus,
        sp.id AS planIdResolved,
        sp.name AS planName,
        sp.price,
        sp.billing_cycle AS billingCycle,
        sp.features
      FROM subscriptions s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
      WHERE s.id = ?
      LIMIT 1`,
      [normalizedId]
    );

    const existing = existingRows?.[0];
    if (!existing) {
      throw new Error('Subscription not found');
    }

    const updateClauses = [];
    const updateValues = [];

    let statusToApply;
    if (Object.prototype.hasOwnProperty.call(updatePayload, 'status')) {
      if (typeof updatePayload.status !== 'string') {
        throw new Error('Invalid subscription status provided');
      }

      const normalizedStatus = updatePayload.status.toLowerCase();
      if (!SUBSCRIPTION_STATUS_VALUES.includes(normalizedStatus)) {
        throw new Error(`Unsupported subscription status: ${updatePayload.status}`);
      }

      statusToApply = normalizedStatus;
      updateClauses.push('status = ?');
      updateValues.push(normalizedStatus);
    }

    let planIdToApply;
    const requestedPlanId = updatePayload.planId ?? updatePayload.plan?.id;
    if (requestedPlanId !== undefined) {
      const parsedPlanId = Number.parseInt(requestedPlanId, 10);
      if (!Number.isFinite(parsedPlanId) || parsedPlanId <= 0) {
        throw new Error('Invalid plan selected');
      }

      const [planRows] = await connection.query(
        'SELECT id, billing_cycle FROM subscription_plans WHERE id = ? LIMIT 1',
        [parsedPlanId]
      );

      if (!planRows?.length) {
        throw new Error('Selected subscription plan does not exist');
      }

      planIdToApply = parsedPlanId;
      updateClauses.push('plan_id = ?');
      updateValues.push(parsedPlanId);
    }

    if (Object.prototype.hasOwnProperty.call(updatePayload, 'paymentMethod')) {
      const paymentMethod = updatePayload.paymentMethod ? String(updatePayload.paymentMethod).trim() : null;
      updateClauses.push('payment_method = ?');
      updateValues.push(paymentMethod);
    }

    const lastPaymentDate = coerceDate(updatePayload.lastPaymentDate, 'lastPaymentDate');
    if (lastPaymentDate !== undefined) {
      updateClauses.push('last_payment_date = ?');
      updateValues.push(lastPaymentDate);
    }

    const nextBillingDate = coerceDate(updatePayload.nextBillingDate, 'nextBillingDate');
    if (nextBillingDate !== undefined) {
      updateClauses.push('next_billing_date = ?');
      updateValues.push(nextBillingDate);
    }

    const startDate = coerceDate(updatePayload.startDate, 'startDate');
    if (startDate !== undefined) {
      updateClauses.push('start_date = ?');
      updateValues.push(startDate);
    }

    const endDate = coerceDate(updatePayload.endDate, 'endDate');
    if (endDate !== undefined) {
      updateClauses.push('end_date = ?');
      updateValues.push(endDate);
    }

    const refundStatus = updatePayload.refundStatus;
    if (refundStatus !== undefined) {
      const normalizedRefundStatus = String(refundStatus).toLowerCase();
      if (!SUBSCRIPTION_REFUND_STATUSES.includes(normalizedRefundStatus)) {
        throw new Error(`Unsupported refund status: ${refundStatus}`);
      }
      updateClauses.push('refund_status = ?');
      updateValues.push(normalizedRefundStatus);
    }

    if (Object.prototype.hasOwnProperty.call(updatePayload, 'refundAmount')) {
      const parsedAmount = updatePayload.refundAmount === null || updatePayload.refundAmount === ''
        ? null
        : Number(updatePayload.refundAmount);

      if (parsedAmount !== null && !Number.isFinite(parsedAmount)) {
        throw new Error('Invalid refund amount provided');
      }

      updateClauses.push('refund_amount = ?');
      updateValues.push(parsedAmount);
    }

    if (Object.prototype.hasOwnProperty.call(updatePayload, 'refundCurrency')) {
      const currency = updatePayload.refundCurrency ? String(updatePayload.refundCurrency).trim().toUpperCase() : null;
      if (currency && currency.length !== 3) {
        throw new Error('Refund currency must be a 3-letter ISO code');
      }
      updateClauses.push('refund_currency = ?');
      updateValues.push(currency);
    }

    const cancelReasonProvided = Object.prototype.hasOwnProperty.call(updatePayload, 'cancelReason');
    const cancelSourceProvided = Object.prototype.hasOwnProperty.call(updatePayload, 'cancelSource');
    const canceledAtProvided = Object.prototype.hasOwnProperty.call(updatePayload, 'canceledAt');

    if (statusToApply === 'canceled') {
      const cancelReason = cancelReasonProvided
        ? (updatePayload.cancelReason ? String(updatePayload.cancelReason).trim() : null)
        : existing.cancelReason;

      const cancelSourceRaw = cancelSourceProvided
        ? String(updatePayload.cancelSource).toLowerCase()
        : existing.cancelSource || 'admin';

      const cancelSource = SUBSCRIPTION_CANCEL_SOURCES.includes(cancelSourceRaw)
        ? cancelSourceRaw
        : 'admin';

      const canceledAt = canceledAtProvided
        ? coerceDate(updatePayload.canceledAt, 'canceledAt')
        : existing.canceledAt || new Date();

      updateClauses.push('cancel_reason = ?');
      updateValues.push(cancelReason);

      updateClauses.push('cancel_source = ?');
      updateValues.push(cancelSource);

      updateClauses.push('canceled_at = ?');
      updateValues.push(canceledAt);
    } else {
      if (cancelReasonProvided) {
        const cancelReason = updatePayload.cancelReason ? String(updatePayload.cancelReason).trim() : null;
        updateClauses.push('cancel_reason = ?');
        updateValues.push(cancelReason);
      }

      if (cancelSourceProvided) {
        const rawSource = String(updatePayload.cancelSource).toLowerCase();
        if (!SUBSCRIPTION_CANCEL_SOURCES.includes(rawSource)) {
          throw new Error(`Unsupported cancellation source: ${updatePayload.cancelSource}`);
        }
        updateClauses.push('cancel_source = ?');
        updateValues.push(rawSource);
      }

      if (canceledAtProvided) {
        const canceledAt = coerceDate(updatePayload.canceledAt, 'canceledAt');
        updateClauses.push('canceled_at = ?');
        updateValues.push(canceledAt);
      }
    }

    if (!updateClauses.length) {
      throw new Error('No valid subscription fields provided for update');
    }

    updateClauses.push('updated_at = NOW(3)');

    await connection.query(
      `UPDATE subscriptions SET ${updateClauses.join(', ')} WHERE id = ?`,
      [...updateValues, normalizedId]
    );

    if (statusToApply) {
      try {
        await connection.query(
          'UPDATE users SET subscription_status = ? WHERE id = ?',
          [statusToApply, existing.userId]
        );
      } catch (userUpdateError) {
        console.warn('Failed to update user subscription_status:', userUpdateError);
      }
    }

    const [updatedRows] = await connection.query(
      `SELECT
        s.id,
        s.status,
        s.start_date AS startDate,
        s.end_date AS endDate,
        s.next_billing_date AS nextBillingDate,
        s.payment_method AS paymentMethod,
        s.last_payment_date AS lastPaymentDate,
        s.created_at AS createdAt,
        s.user_id AS userId,
        u.email,
        u.name,
        u.subscription_status AS userSubscriptionStatus,
        sp.id AS planId,
        sp.name AS planName,
        sp.price,
        sp.billing_cycle AS billingCycle,
        sp.features
      FROM subscriptions s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
      WHERE s.id = ?
      LIMIT 1`,
      [normalizedId]
    );

    const updatedSubscription = updatedRows?.[0];

    await connection.commit();

    try {
      await query(
        'INSERT INTO admin_audit_log (admin_id, action, target_id, details) VALUES (?, ?, ?, ?)',
        [
          session.user.id,
          'UPDATE_SUBSCRIPTION',
          normalizedId,
          JSON.stringify({
            status: statusToApply ?? existing.status,
            planId: planIdToApply ?? existing.planId,
            fieldsUpdated: updateClauses,
          }),
        ]
      );
    } catch (logError) {
      console.warn('Failed to log subscription update (admin_audit_log):', logError.message || logError);
    }

    const normalized = normalizeSubscriptionRow(updatedSubscription);

    revalidatePath('/admin/subscriptions');

    return {
      success: true,
      subscription: normalized,
    };
  } catch (error) {
    await connection.rollback();
    console.error('Error updating subscription:', error);
    throw new Error(error.message || 'Failed to update subscription');
  } finally {
    connection.release();
  }
}

const REPORT_STATUS_VALUES = ['pending', 'reviewed', 'resolved', 'dismissed'];
const REPORT_STATUS_UI_TO_DB = {
  open: 'pending',
  pending: 'pending',
  reviewed: 'reviewed',
  resolved: 'resolved',
  rejected: 'dismissed',
  dismissed: 'dismissed',
};

const REPORT_STATUS_DB_TO_UI = {
  pending: 'open',
  reviewed: 'reviewed',
  resolved: 'resolved',
  dismissed: 'rejected',
};

const normalizeReportStatusForDb = (rawStatus) => {
  if (!rawStatus) {
    return 'pending';
  }
  const normalized = rawStatus.toString().toLowerCase();
  return REPORT_STATUS_UI_TO_DB[normalized] || normalized;
};

const normalizeReportStatusForUi = (rawStatus) => {
  if (!rawStatus) {
    return 'open';
  }
  const normalized = rawStatus.toString().toLowerCase();
  return REPORT_STATUS_DB_TO_UI[normalized] || normalized;
};

const summarizeText = (text, maxLength = 180) => {
  if (!text) {
    return '';
  }
  const trimmed = text.toString().trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength).trimEnd()}…`;
};

const buildReportSubject = (row) => {
  const type = row.reported_item_type;
  if (type === 'community_post') {
    const authorName = row.post_author_name || 'Community member';
    return {
      title: `Community post by ${authorName}`,
      subjectSummary: summarizeText(row.post_content, 200),
      subject: {
        id: row.reported_item_id,
        type,
        author: row.post_author_id
          ? {
              id: row.post_author_id,
              name: authorName,
              image: row.post_author_image || null,
            }
          : null,
        createdAt: row.post_created_at || null,
        content: row.post_content || null,
      },
    };
  }

  if (type === 'recipe') {
    return {
      title: `Recipe #${row.reported_item_id}`,
      subjectSummary: summarizeText(row.recipe_title || ''),
      subject: {
        id: row.reported_item_id,
        type,
        title: row.recipe_title || null,
      },
    };
  }

  if (type === 'comment') {
    return {
      title: `Comment #${row.reported_item_id}`,
      subjectSummary: summarizeText(row.comment_text || ''),
      subject: {
        id: row.reported_item_id,
        type,
        content: row.comment_text || null,
      },
    };
  }

  if (type === 'user') {
    return {
      title: row.reported_user_name ? `User ${row.reported_user_name}` : `User #${row.reported_item_id}`,
      subjectSummary: row.reported_user_email || '',
      subject: {
        id: row.reported_item_id,
        type,
        name: row.reported_user_name || null,
        email: row.reported_user_email || null,
      },
    };
  }

  return {
    title: `Reported item #${row.reported_item_id}`,
    subjectSummary: '',
    subject: {
      id: row.reported_item_id,
      type,
    },
  };
};

// Get reports
export async function getReports({ page = 1, limit = 10, type = 'all', status = 'open', search = '' }) {
  const session = await auth();

  const userEmail = session?.user?.email?.toLowerCase();
  const userRole = session?.user?.role?.toLowerCase();
  const isAdminUser = userRole === 'admin' || userEmail === 'savoryadmin@example.com';

  if (!isAdminUser) {
    console.log('Admin action unauthorized:', { userEmail, userRole });
    throw new Error('Unauthorized');
  }

  const metricsFallback = {
    openCount: 0,
    typeCount: 0,
    avgResponseMinutes: null,
    newToday: 0,
    reportTypes: [],
  };

  try {
    const parsedPage = Number.parseInt(page, 10);
    const parsedLimit = Number.parseInt(limit, 10);
    const safePage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10;
    const offset = (safePage - 1) * safeLimit;

    const metrics = { ...metricsFallback };

    const safeAggregateQuery = async (sql, params = []) => {
      try {
        return await query(sql, params);
      } catch (aggregateError) {
        if (
          aggregateError.code === 'ER_NO_SUCH_TABLE' ||
          aggregateError.message?.includes('Unknown column')
        ) {
          console.warn('Skipping report metrics query:', aggregateError.message);
          return [];
        }

        throw aggregateError;
      }
    };

    const normalizedType = typeof type === 'string' ? type.toLowerCase() : 'all';
    const normalizedStatus = normalizeReportStatusForDb(status);
    const searchTerm = search?.toString().trim() || '';

    const filters = [];
    const filterParams = [];

    if (normalizedType !== 'all') {
      filters.push('r.reported_item_type = ?');
      filterParams.push(normalizedType);
    }

    if (normalizedStatus !== 'all') {
      filters.push('r.status = ?');
      filterParams.push(normalizedStatus);
    }

    if (searchTerm) {
      filters.push(`(
        r.reason LIKE ?
        OR reporter.name LIKE ?
        OR reporter.email LIKE ?
        OR cp.content LIKE ?
        OR post_author.name LIKE ?
      )`);
      const likeTerm = `%${searchTerm}%`;
      filterParams.push(likeTerm, likeTerm, likeTerm, likeTerm, likeTerm);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const baseJoins = `
      FROM reports r
      LEFT JOIN users reporter ON reporter.id = r.reporter_id
      LEFT JOIN community_posts cp
        ON r.reported_item_type = 'community_post' AND cp.id = r.reported_item_id
      LEFT JOIN users post_author ON post_author.id = cp.user_id
      LEFT JOIN recipes recipe
        ON r.reported_item_type = 'recipe' AND recipe.id = r.reported_item_id
      LEFT JOIN users reported_user
        ON r.reported_item_type = 'user' AND reported_user.id = r.reported_item_id
    `;

    const selectSql = `
      SELECT
        r.id,
        r.reporter_id,
        r.reported_item_id,
        r.reported_item_type,
        r.reason,
        r.status,
        r.reviewed_by,
        r.reviewed_at,
        r.created_at,
        r.updated_at,
        reporter.name AS reporter_name,
        reporter.email AS reporter_email,
        reporter.image AS reporter_image,
        cp.content AS post_content,
        cp.created_at AS post_created_at,
        post_author.id AS post_author_id,
        post_author.name AS post_author_name,
        post_author.image AS post_author_image,
        recipe.title AS recipe_title,
        NULL AS comment_text,
        reported_user.name AS reported_user_name,
        reported_user.email AS reported_user_email
      ${baseJoins}
      ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const countSql = `
      SELECT COUNT(*) AS total
      ${baseJoins}
      ${whereClause}
    `;

    const rows = await query(selectSql, [...filterParams, safeLimit, offset]);
    const countRows = await query(countSql, filterParams);
    const total = Number(countRows?.[0]?.total ?? 0);

    const reports = rows.map((row) => {
      const { title, subjectSummary, subject } = buildReportSubject(row);
      return {
        id: row.id,
        type: row.reported_item_type,
        status: normalizeReportStatusForUi(row.status),
        title,
        description: row.reason,
        subjectSummary,
        subject,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        reportedBy: {
          id: row.reporter_id,
          name: row.reporter_name || 'Unknown user',
          email: row.reporter_email || null,
          image: row.reporter_image || null,
        },
      };
    });

    const [openRow] = await safeAggregateQuery(
      'SELECT COUNT(*) AS total FROM reports WHERE status = ?',
      [normalizeReportStatusForDb('open')]
    );
    if (openRow?.total != null) {
      metrics.openCount = Number(openRow.total) || 0;
    }

    const typeRows = await safeAggregateQuery(
      `SELECT reported_item_type AS type, COUNT(*) AS total
       FROM reports
       GROUP BY reported_item_type`
    );
    if (Array.isArray(typeRows) && typeRows.length) {
      metrics.reportTypes = typeRows
        .filter((row) => row?.type)
        .map((row) => ({
          type: row.type,
          count: Number(row.total ?? 0) || 0,
        }));
      metrics.typeCount = metrics.reportTypes.length;
    }

    const [avgResponseRow] = await safeAggregateQuery(
      `SELECT AVG(TIMESTAMPDIFF(MINUTE, created_at, reviewed_at)) AS avg_minutes
       FROM reports
       WHERE reviewed_at IS NOT NULL`
    );
    const avgMinutesValue = Number(avgResponseRow?.avg_minutes);
    if (Number.isFinite(avgMinutesValue) && avgMinutesValue > 0) {
      metrics.avgResponseMinutes = avgMinutesValue;
    }

    const [newTodayRow] = await safeAggregateQuery(
      'SELECT COUNT(*) AS total FROM reports WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)'
    );
    if (newTodayRow?.total != null) {
      metrics.newToday = Number(newTodayRow.total) || 0;
    }

    return {
      reports,
      pagination: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit) || 0,
      },
      metrics,
    };
  } catch (error) {
    console.error('Error fetching reports:', error);
    return {
      reports: [],
      pagination: {
        total: 0,
        page: Number.isFinite(page) ? page : 1,
        limit: Number.isFinite(limit) ? limit : 10,
        totalPages: 0,
      },
      metrics: metricsFallback,
    };
  }
}

// Update report status
export async function updateReportStatus(reportId, status) {
  const session = await auth();
  
  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  const userEmail = session.user.email.toLowerCase();
  const userRole = session.user.role?.toUpperCase();
  const isAdminUser = userRole === 'ADMIN' || userEmail === 'savoryadmin@example.com';
  
  if (!isAdminUser) {
    throw new Error('Forbidden');
  }

  try {
    const dbStatus = normalizeReportStatusForDb(status);
    if (!REPORT_STATUS_VALUES.includes(dbStatus)) {
      throw new Error('Invalid status');
    }

    const reportDetails = await fetchReportDetailsForNotifications(reportId);

    await query(
      'UPDATE reports SET status = ?, updated_at = NOW(3) WHERE id = ?',
      [dbStatus, reportId]
    );

    if (dbStatus === 'resolved') {
      await notifyReportParticipants({
        reportDetails,
        adminUserId: session.user.id,
        newStatus: dbStatus,
      });
    }

    revalidatePath('/admin/reports');
    return { success: true };
  } catch (error) {
    console.error('Error updating report status:', error);
    throw new Error('Failed to update report status');
  }
}

async function fetchReportDetailsForNotifications(reportId) {
  try {
    return await queryOne(
      `SELECT
        r.id,
        r.reporter_id,
        r.reported_item_id,
        r.reported_item_type,
        r.reason,
        reporter.name AS reporter_name,
        reporter.email AS reporter_email,
        cp.user_id AS community_post_owner_id,
        cp.title AS community_post_title,
        cp.content AS community_post_content,
        rec.user_id AS recipe_owner_id,
        rec.title AS recipe_title,
        cpc.user_id AS comment_owner_id,
        cpc.post_id AS comment_post_id,
        cpc.content AS comment_content,
        reported_user.id AS reported_user_id,
        reported_user.name AS reported_user_name
      FROM reports r
      LEFT JOIN users reporter ON reporter.id = r.reporter_id
      LEFT JOIN community_posts cp ON r.reported_item_type = 'community_post' AND cp.id = r.reported_item_id
      LEFT JOIN recipes rec ON r.reported_item_type = 'recipe' AND rec.id = r.reported_item_id
      LEFT JOIN community_post_comments cpc ON r.reported_item_type = 'comment' AND cpc.id = r.reported_item_id
      LEFT JOIN users reported_user ON r.reported_item_type = 'user' AND reported_user.id = r.reported_item_id
      WHERE r.id = ?
      LIMIT 1`,
      [reportId]
    );
  } catch (error) {
    console.warn('Unable to load report details for notifications:', error.message || error);
    return null;
  }
}

function buildReportItemContext(details) {
  if (!details) {
    return { ownerId: null, itemLabel: 'content', itemLink: null };
  }

  const type = details.reported_item_type;
  const itemId = details.reported_item_id;

  switch (type) {
    case 'community_post': {
      const ownerId = details.community_post_owner_id;
      const title = details.community_post_title?.trim();
      const itemLabel = title ? `community post "${title}"` : 'community post';
      const itemLink = itemId ? `/community/posts/${itemId}` : null;
      return { ownerId, itemLabel, itemLink };
    }
    case 'recipe': {
      const ownerId = details.recipe_owner_id;
      const title = details.recipe_title?.trim();
      const itemLabel = title ? `recipe "${title}"` : 'recipe';
      const itemLink = itemId ? `/recipes/${itemId}` : null;
      return { ownerId, itemLabel, itemLink };
    }
    case 'comment': {
      const ownerId = details.comment_owner_id;
      const excerpt = details.comment_content ? details.comment_content.slice(0, 80) : null;
      const itemLabel = excerpt ? `comment "${excerpt}${details.comment_content?.length > 80 ? '…' : ''}"` : 'comment';
      const postId = details.comment_post_id;
      const itemLink = postId ? `/community/posts/${postId}#comment-${itemId}` : null;
      return { ownerId, itemLabel, itemLink };
    }
    case 'user': {
      const ownerId = details.reported_user_id;
      const name = details.reported_user_name?.trim();
      const itemLabel = name ? `profile for ${name}` : 'user profile';
      const itemLink = itemId ? `/profile/${itemId}` : null;
      return { ownerId, itemLabel, itemLink };
    }
    default:
      return { ownerId: null, itemLabel: 'content', itemLink: null };
  }
}

async function notifyReportParticipants({ reportDetails, adminUserId, newStatus }) {
  if (!reportDetails) {
    return;
  }

  const context = buildReportItemContext(reportDetails);
  const notifications = [];

  if (newStatus === 'resolved' && reportDetails.reporter_id) {
    notifications.push(
      NotificationService.createNotification({
        userId: reportDetails.reporter_id,
        actorId: adminUserId ?? null,
        type: 'report.resolved',
        title: 'Your report was accepted',
        body: `We reviewed your report about the ${context.itemLabel} and took action. Thank you for helping keep the community safe.`,
        metadata: {
          reportId: reportDetails.id,
          reportedItemId: reportDetails.reported_item_id,
          reportedItemType: reportDetails.reported_item_type,
          link: context.itemLink,
          status: newStatus,
        },
      })
    );
  }

  if (newStatus === 'resolved' && context.ownerId && context.ownerId !== reportDetails.reporter_id) {
    notifications.push(
      NotificationService.createNotification({
        userId: context.ownerId,
        actorId: adminUserId ?? null,
        type: 'report.notice',
        title: 'Your content received a report',
        body: `A report for your ${context.itemLabel} was accepted by our moderators. Please review the content and ensure it follows the community guidelines.`,
        metadata: {
          reportId: reportDetails.id,
          reportedItemId: reportDetails.reported_item_id,
          reportedItemType: reportDetails.reported_item_type,
          link: context.itemLink,
          status: newStatus,
        },
      })
    );
  }

  if (newStatus === 'reviewed' && reportDetails.reporter_id) {
    notifications.push(
      NotificationService.createNotification({
        userId: reportDetails.reporter_id,
        actorId: adminUserId ?? null,
        type: 'report.reviewed',
        title: 'Your report was reviewed',
        body: `Our moderators reviewed your report about the ${context.itemLabel}. We will notify you if further action is taken.`,
        metadata: {
          reportId: reportDetails.id,
          reportedItemId: reportDetails.reported_item_id,
          reportedItemType: reportDetails.reported_item_type,
          link: context.itemLink,
          status: newStatus,
        },
      })
    );
  }

  if (newStatus === 'dismissed') {
    if (reportDetails.reporter_id) {
      notifications.push(
        NotificationService.createNotification({
          userId: reportDetails.reporter_id,
          actorId: adminUserId ?? null,
          type: 'report.dismissed',
          title: 'Your report was dismissed',
          body: `We reviewed your report about the ${context.itemLabel} and determined no further action is needed.`,
          metadata: {
            reportId: reportDetails.id,
            reportedItemId: reportDetails.reported_item_id,
            reportedItemType: reportDetails.reported_item_type,
            link: context.itemLink,
            status: newStatus,
          },
        })
      );
    }

    if (context.ownerId && context.ownerId !== reportDetails.reporter_id) {
      notifications.push(
        NotificationService.createNotification({
          userId: context.ownerId,
          actorId: adminUserId ?? null,
          type: 'report.dismissedOwner',
          title: 'Report on your content was dismissed',
          body: `A report about your ${context.itemLabel} was reviewed and no violations were found.`,
          metadata: {
            reportId: reportDetails.id,
            reportedItemId: reportDetails.reported_item_id,
            reportedItemType: reportDetails.reported_item_type,
            link: context.itemLink,
            status: newStatus,
          },
        })
      );
    }
  }

  if (notifications.length) {
    await Promise.allSettled(notifications);
  }
}

export async function importRecipe(recipeData) {
  const session = await auth();
  
  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  const userEmail = session.user.email.toLowerCase();
  const userRole = session.user.role?.toUpperCase();
  const isAdminUser = userRole === 'ADMIN' || userEmail === 'savoryadmin@example.com';
  
  if (!isAdminUser) {
    throw new Error('Forbidden');
  }

  try {
    const response = await fetch('/api/admin/recipes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(recipeData),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to import recipe');
    }

    revalidatePath('/admin/recipes');
    return data;
  } catch (error) {
    console.error('Error importing recipe:', error);
    throw new Error(error.message || 'Failed to import recipe');
  }
}
