import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { query } from '@/lib/db';

export async function POST(request) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userEmail = session.user.email?.toLowerCase();
    const userRole = session.user.role?.toUpperCase();
    const isAdminUser = userRole === 'ADMIN' || userEmail === 'savoryadmin@example.com';
    
    if (!isAdminUser) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const { timeRange = '30days' } = await request.json();

    const rangeConfigs = {
      '7days': {
        unit: 'day',
        subtractValue: 6,
        subtractClause: '7 DAY',
        sqlFormat: '%Y-%m-%d',
        labelOptions: { month: 'short', day: 'numeric' },
      },
      '30days': {
        unit: 'day',
        subtractValue: 29,
        subtractClause: '30 DAY',
        sqlFormat: '%Y-%m-%d',
        labelOptions: { month: 'short', day: 'numeric' },
      },
      '90days': {
        unit: 'day',
        subtractValue: 89,
        subtractClause: '90 DAY',
        sqlFormat: '%Y-%m-%d',
        labelOptions: { month: 'short', day: 'numeric' },
      },
      '12months': {
        unit: 'month',
        subtractValue: 11,
        subtractClause: '12 MONTH',
        sqlFormat: '%Y-%m',
        labelOptions: { month: 'short', year: 'numeric' },
      },
    };

    const config = rangeConfigs[timeRange] || rangeConfigs['30days'];

    const endDate = new Date();
    const startDate = new Date(endDate);

    if (config.unit === 'month') {
      startDate.setMonth(startDate.getMonth() - config.subtractValue);
      startDate.setDate(1);
    } else {
      startDate.setDate(startDate.getDate() - config.subtractValue);
    }

    const startDateString = startDate.toISOString().split('T')[0];
    const dateSubtractClause = config.subtractClause;

    const buildPeriodSequence = () => {
      const periods = [];

      if (config.unit === 'month') {
        const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        const limit = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

        while (cursor <= limit) {
          const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
          periods.push({
            key,
            label: cursor.toLocaleDateString('en-US', config.labelOptions),
          });
          cursor.setMonth(cursor.getMonth() + 1);
        }
      } else {
        const cursor = new Date(startDate);
        while (cursor <= endDate) {
          const key = cursor.toISOString().split('T')[0];
          periods.push({
            key,
            label: cursor.toLocaleDateString('en-US', config.labelOptions),
          });
          cursor.setDate(cursor.getDate() + 1);
        }
      }

      return periods;
    };

    const periodSequence = buildPeriodSequence();

    const safeQuery = async (sql, params = []) => {
      try {
        return await query(sql, params);
      } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
          console.warn(`Skipping query, missing table: ${error.message}`);
          return [];
        }
        if (error.message?.includes('Unknown column')) {
          console.warn(`Skipping query, missing column: ${error.message}`);
          return [];
        }
        if (error.message?.includes('database tables do not exist')) {
          console.warn(`Skipping query, optional table not present: ${error.message}`);
          return [];
        }
        throw error;
      }
    };

    const getCount = async (sql, params = []) => {
      const rows = await safeQuery(sql, params);
      if (!Array.isArray(rows) || rows.length === 0) {
        return 0;
      }
      const first = rows[0];
      return first?.count ?? 0;
    };

    const totalUsers = await getCount('SELECT COUNT(*) as count FROM users');
    const newUsers = await getCount(
      `SELECT COUNT(*) as count FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${dateSubtractClause})`
    );

    let activeUsers = await getCount(
      `SELECT COUNT(DISTINCT user_id) as count FROM user_sessions WHERE last_activity >= DATE_SUB(NOW(), INTERVAL ${dateSubtractClause})`
    );

    if (activeUsers === 0) {
      activeUsers = await getCount(
        `SELECT COUNT(*) as count FROM users WHERE last_login >= DATE_SUB(NOW(), INTERVAL ${dateSubtractClause})`
      );
    }

    const totalRecipes = await getCount('SELECT COUNT(*) as count FROM recipes');
    const newRecipes = await getCount(
      `SELECT COUNT(*) as count FROM recipes WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${dateSubtractClause})`
    );

    let trafficStats = {
      avgSessionDuration: '0m',
      bounceRate: '0%'
    };

    const [trafficResult] = await safeQuery(
      `SELECT 
        AVG(session_duration) as avgSessionDuration,
        AVG(bounce_rate) as bounceRate
      FROM analytics_sessions`
    );

    if (trafficResult) {
      const durationValue = Number(trafficResult.avgSessionDuration);
      if (Number.isFinite(durationValue) && durationValue > 0) {
        trafficStats.avgSessionDuration = `${Math.round(durationValue)}m`;
      }

      const bounceValue = Number(trafficResult.bounceRate);
      if (Number.isFinite(bounceValue) && bounceValue >= 0) {
        trafficStats.bounceRate = `${Math.round(bounceValue)}%`;
      }
    }

    const aggregateSeries = async (tableName, dateColumn, whereClause = '') => {
      const sql = `SELECT DATE_FORMAT(${dateColumn}, '${config.sqlFormat}') AS period_key, COUNT(*) AS total
        FROM ${tableName}
        WHERE ${dateColumn} >= ? ${whereClause}
        GROUP BY period_key
        ORDER BY period_key`;

      const rows = await safeQuery(sql, [startDateString]);
      const seriesMap = rows.reduce((acc, row) => {
        if (row?.period_key) {
          acc[row.period_key] = Number(row.total) || 0;
        }
        return acc;
      }, {});

      return periodSequence.map((period) => seriesMap[period.key] ?? 0);
    };

    const userGrowthSeries = await aggregateSeries('users', 'created_at');
    const recipeGrowthSeries = await aggregateSeries('recipes', 'created_at');

    const topRecipes = await safeQuery(
      `SELECT 
        r.id,
        r.title,
        u.name as author,
        r.rating,
        r.total_reviews,
        r.created_at
      FROM recipes r
      LEFT JOIN users u ON r.user_id = u.id
      ORDER BY r.rating DESC, r.total_reviews DESC
      LIMIT 5`
    );

    const formattedTopRecipes = topRecipes.map((recipe) => ({
      id: recipe.id,
      title: recipe.title,
      author: recipe.author || 'Unknown author',
      rating: recipe.rating ?? null,
      totalReviews: recipe.total_reviews ?? 0,
      createdAt: recipe.created_at,
    }));

    const topUsers = await safeQuery(
      `SELECT 
        u.id,
        u.name,
        u.email,
        COUNT(r.id) as totalRecipes,
        MAX(r.created_at) as lastActivity
      FROM users u
      LEFT JOIN recipes r ON r.user_id = u.id
      GROUP BY u.id, u.name, u.email
      ORDER BY totalRecipes DESC, lastActivity DESC
      LIMIT 5`
    );

    const formattedTopUsers = topUsers.map((user) => ({
      id: user.id,
      name: user.name || user.email || 'SavoryFlavors Member',
      email: user.email,
      totalRecipes: Number(user.totalRecipes) || 0,
      lastActivity: user.lastActivity,
    }));

    const trafficSourcesRows = await safeQuery(
      `SELECT 
        source,
        COUNT(*) as visits
      FROM analytics_traffic
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${dateSubtractClause})
      GROUP BY source
      ORDER BY visits DESC`
    );

    const formattedTrafficSources = trafficSourcesRows.map((row) => ({
      source: row.source || 'Unknown',
      visits: Number(row.visits) || 0,
    }));

    return NextResponse.json({
      totalUsers,
      newUsers,
      activeUsers,
      totalRecipes,
      newRecipes,
      avgSessionDuration: trafficStats.avgSessionDuration,
      bounceRate: trafficStats.bounceRate,
      series: {
        labels: periodSequence.map((period) => period.label),
        userGrowth: userGrowthSeries,
        recipeGrowth: recipeGrowthSeries,
      },
      topRecipes: formattedTopRecipes,
      topUsers: formattedTopUsers,
      trafficSources: formattedTrafficSources,
    });
  } catch (error) {
    console.error('Error in analytics API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
