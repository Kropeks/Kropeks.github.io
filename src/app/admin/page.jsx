'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Users, Utensils, Clock, BarChart2, Loader2 } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

const AXIS_TICK_COLOR = 'rgba(71, 85, 105, 0.85)';
const GRID_COLOR = 'rgba(148, 163, 184, 0.2)';
const TOOLTIP_BG_COLOR = 'rgba(30, 41, 59, 0.92)';
const TOOLTIP_TEXT_COLOR = 'rgba(226, 232, 240, 0.96)';

const dashboardCardThemes = [
  {
    card: 'relative overflow-hidden border border-white/30 bg-gradient-to-br from-olive-600 via-olive-500 to-matte-500 text-white shadow-xl shadow-olive-900/20',
    overlay: 'absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.25),transparent_60%)]',
    title: 'text-white/80',
    icon: 'bg-white/20 text-white',
    value: 'text-3xl font-semibold tracking-tight text-white',
    trendUp: 'text-emerald-200',
    trendDown: 'text-rose-200',
  },
  {
    card: 'relative overflow-hidden border border-white/30 bg-gradient-to-br from-matte-400 via-soft-400 to-light-400 text-olive-950 shadow-xl shadow-olive-900/15',
    overlay: 'absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.35),transparent_65%)]',
    title: 'text-olive-900/70',
    icon: 'bg-white/40 text-olive-700',
    value: 'text-3xl font-semibold tracking-tight text-olive-900',
    trendUp: 'text-emerald-600',
    trendDown: 'text-rose-500',
  },
  {
    card: 'relative overflow-hidden border border-white/30 bg-gradient-to-br from-yellow-200 via-amber-200 to-light-100 text-amber-950 shadow-lg shadow-amber-900/15',
    overlay: 'absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(251,191,36,0.45),transparent_60%)]',
    title: 'text-amber-900/80',
    icon: 'bg-amber-200/70 text-amber-700',
    value: 'text-3xl font-semibold tracking-tight text-amber-950',
    trendUp: 'text-amber-800',
    trendDown: 'text-rose-500',
  },
  {
    card: 'relative overflow-hidden border border-white/30 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 text-white shadow-xl shadow-slate-900/25',
    overlay: 'absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(148,163,184,0.4),transparent_60%)]',
    title: 'text-slate-200/90',
    icon: 'bg-white/15 text-white',
    value: 'text-3xl font-semibold tracking-tight text-white',
    trendUp: 'text-emerald-200',
    trendDown: 'text-rose-200',
  },
];

// Fallback stats in case data fetching fails
const defaultStats = [
  { title: 'Total Users', value: '1,234', icon: Users, trend: '+12%', trendType: 'up' },
  { title: 'Total Recipes', value: '5,678', icon: Utensils, trend: '+5%', trendType: 'up' },
  { title: 'Pending Reviews', value: '42', icon: Clock, trend: '-3%', trendType: 'down' },
  { title: 'Monthly Active', value: '8,901', icon: BarChart2, trend: '+8%', trendType: 'up' },
];

const parseNumericValue = (value, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const numericValue = Number(value.replace(/[\d.-]+/g, (match) => match)) || Number(value.replace(/[^\d.-]/g, ''));
    return Number.isFinite(numericValue) ? numericValue : fallback;
  }

  return fallback;
};

const getStatValueByTitle = (stats, title, fallback = 0) => {
  const match = stats.find((item) => item.title === title);
  return parseNumericValue(match?.value, fallback);
};

const getRecentMonthLabels = (count = 6) => {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    return date.toLocaleDateString(undefined, { month: 'short' });
  });
};

export default function AdminDashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardStats, setDashboardStats] = useState(defaultStats);
  const [stats, setStats] = useState(null);
  const [meta, setMeta] = useState({ warnings: [], fallbackUsed: false });
  const [error, setError] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);

  const fetchAdminStats = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/admin/stats', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Failed to load admin statistics');
      }

      const data = await response.json();

      setStats(data);
      setMeta(data.meta ?? { warnings: [], fallbackUsed: false });
      setRecentActivity(Array.isArray(data.recentActivity) ? data.recentActivity : []);

      setDashboardStats([
        {
          title: 'Total Users',
          value: (data.totalUsers ?? 0).toLocaleString(),
          icon: Users,
          trend: data.newUsers > 0 ? `+${data.newUsers} new` : 'No change',
          trendType: data.newUsers > 0 ? 'up' : 'neutral',
        },
        {
          title: 'Total Recipes',
          value: (data.totalRecipes ?? 0).toLocaleString(),
          icon: Utensils,
          trend: data.newRecipes > 0 ? `+${data.newRecipes} new` : 'No change',
          trendType: data.newRecipes > 0 ? 'up' : 'neutral',
        },
        {
          title: 'Pending Reviews',
          value: data.pendingReviews ?? 0,
          icon: Clock,
          trend: data.pendingReviews > 0 ? 'Needs attention' : 'All clear',
          trendType: data.pendingReviews > 0 ? 'down' : 'neutral',
        },
        {
          title: 'Monthly Active',
          value: (data.monthlyActiveUsers ?? 0).toLocaleString(),
          icon: BarChart2,
          trend: data.monthlyActiveUsers > 0 ? 'Active' : 'No activity',
          trendType: data.monthlyActiveUsers > 0 ? 'up' : 'neutral',
        },
      ]);
    } catch (err) {
      console.error('Error fetching admin stats:', err);
      setStats(null);
      setMeta({
        warnings: ['Unable to load live admin statistics. Showing fallback data.'],
        fallbackUsed: true,
      });
      setDashboardStats(defaultStats);
      setRecentActivity([]);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const derivedStats = useMemo(() => {
    const fallbackTotals = {
      totalUsers: getStatValueByTitle(dashboardStats, 'Total Users', 1200),
      totalRecipes: getStatValueByTitle(dashboardStats, 'Total Recipes', 4200),
      pendingReviews: getStatValueByTitle(dashboardStats, 'Pending Reviews', 32),
      monthlyActiveUsers: getStatValueByTitle(dashboardStats, 'Monthly Active', 7800),
    };

    return {
      totalUsers: stats?.totalUsers ?? fallbackTotals.totalUsers,
      newUsers: stats?.newUsers ?? 60,
      totalRecipes: stats?.totalRecipes ?? fallbackTotals.totalRecipes,
      newRecipes: stats?.newRecipes ?? 120,
      pendingReviews: stats?.pendingReviews ?? fallbackTotals.pendingReviews,
      monthlyActiveUsers: stats?.monthlyActiveUsers ?? fallbackTotals.monthlyActiveUsers,
      monthlySeries: stats?.monthlySeries,
    };
  }, [stats, dashboardStats]);

  const { totalUsers, monthlyActiveUsers, newUsers, totalRecipes, newRecipes, pendingReviews, monthlySeries } = derivedStats;

  const monthLabels = useMemo(() => {
    if (monthlySeries?.formattedLabels?.length) {
      return monthlySeries.formattedLabels;
    }
    return getRecentMonthLabels();
  }, [monthlySeries]);

  const buildFallbackSeries = useMemo(() => {
    const increments = Math.max(monthLabels.length - 1, 1);

    const finalNewUsersValue = Math.max(newUsers, Math.round(totalUsers * 0.04), 15);
    const startNewUsersValue = Math.max(Math.round(finalNewUsersValue * 0.55), 8);
    const fallbackNewUsers = monthLabels.map((_, index) => {
      const progress = index / increments;
      const value = startNewUsersValue + (finalNewUsersValue - startNewUsersValue) * progress;
      return Math.round(value);
    });

    const finalMonthlyActiveValue = Math.max(monthlyActiveUsers, Math.round(totalUsers * 0.08), 200);
    const startMonthlyActiveValue = Math.max(Math.round(finalMonthlyActiveValue * 0.5), 120);
    const fallbackMonthlyActive = monthLabels.map((_, index) => {
      const progress = index / increments;
      const value = startMonthlyActiveValue + (finalMonthlyActiveValue - startMonthlyActiveValue) * progress;
      return Math.round(value);
    });

    const finalNewRecipes = Math.max(newRecipes, Math.round(totalRecipes * 0.04), 20);
    const finalPending = Math.max(pendingReviews, 5);
    const startNewRecipes = Math.max(Math.round(finalNewRecipes * 0.55), 10);
    const startPending = Math.max(Math.round(finalPending * 1.4), finalPending + 8);

    const fallbackNewRecipes = monthLabels.map((_, index) => {
      const progress = index / increments;
      const value = startNewRecipes + (finalNewRecipes - startNewRecipes) * progress;
      return Math.round(value);
    });

    const fallbackPending = monthLabels.map((_, index) => {
      const progress = index / increments;
      const value = startPending - (startPending - finalPending) * progress;
      return Math.max(Math.round(value), 0);
    });

    return {
      newUsers: fallbackNewUsers,
      monthlyActive: fallbackMonthlyActive,
      newRecipes: fallbackNewRecipes,
      pendingReviews: fallbackPending,
    };
  }, [
    monthLabels,
    monthlyActiveUsers,
    newUsers,
    totalUsers,
    newRecipes,
    pendingReviews,
    totalRecipes,
  ]);

  const userGrowthData = useMemo(() => {
    const newUserSeries = monthlySeries?.newUsers?.length
      ? monthlySeries.newUsers
      : buildFallbackSeries.newUsers;

    return {
      labels: monthLabels,
      datasets: [
        {
          label: 'New Users',
          data: newUserSeries,
          fill: true,
          borderColor: 'rgba(107, 142, 35, 1)',
          backgroundColor: 'rgba(107, 142, 35, 0.18)',
          tension: 0.35,
          pointBackgroundColor: 'rgba(107, 142, 35, 0.95)',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1.5,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    };
  }, [monthLabels, monthlySeries, buildFallbackSeries]);

  const recipeAnalyticsData = useMemo(() => {
    const newRecipesSeries = monthlySeries?.newRecipes?.length
      ? monthlySeries.newRecipes
      : buildFallbackSeries.newRecipes;
    const pendingSeries = monthlySeries?.pendingReviews?.length
      ? monthlySeries.pendingReviews
      : buildFallbackSeries.pendingReviews;

    return {
      labels: monthLabels,
      datasets: [
        {
          label: 'New Recipes',
          data: newRecipesSeries,
          backgroundColor: 'rgba(146, 185, 85, 0.85)',
          borderRadius: 12,
          borderSkipped: false,
        },
        {
          label: 'Pending Reviews',
          data: pendingSeries,
          backgroundColor: 'rgba(234, 179, 8, 0.75)',
          borderRadius: 12,
          borderSkipped: false,
        },
      ],
    };
  }, [monthLabels, buildFallbackSeries, monthlySeries]);

  const userGrowthOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: TOOLTIP_BG_COLOR,
          borderColor: 'rgba(107, 142, 35, 0.35)',
          borderWidth: 1,
          titleColor: TOOLTIP_TEXT_COLOR,
          bodyColor: TOOLTIP_TEXT_COLOR,
          padding: 12,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: AXIS_TICK_COLOR,
            font: { weight: 500 },
          },
        },
        y: {
          beginAtZero: true,
          grid: {
            color: GRID_COLOR,
            drawBorder: false,
          },
          ticks: {
            color: AXIS_TICK_COLOR,
            callback: (value) => `${value}`,
          },
        },
      },
    }),
    [],
  );

  const recipeAnalyticsOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            pointStyle: 'rectRounded',
            color: AXIS_TICK_COLOR,
            padding: 20,
          },
        },
        tooltip: {
          backgroundColor: TOOLTIP_BG_COLOR,
          borderColor: 'rgba(255, 255, 255, 0.14)',
          borderWidth: 1,
          titleColor: TOOLTIP_TEXT_COLOR,
          bodyColor: TOOLTIP_TEXT_COLOR,
          padding: 12,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: AXIS_TICK_COLOR,
            font: { weight: 500 },
          },
        },
        y: {
          beginAtZero: true,
          grid: {
            color: GRID_COLOR,
            drawBorder: false,
          },
          ticks: {
            color: AXIS_TICK_COLOR,
          },
        },
      },
    }),
    [],
  );

  useEffect(() => {
    fetchAdminStats();
  }, [fetchAdminStats]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard Overview</h1>
          <p className="text-muted-foreground">Welcome back! Here's what's happening with your platform.</p>
        </div>

        {error ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            <p className="font-semibold">{error}</p>
            <p>We restored fallback metrics so you can keep working while the issue is resolved.</p>
          </div>
        ) : null}

        {meta?.fallbackUsed ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">Some dashboard metrics are using fallback data.</p>
            <p>Audit your database tables and data pipelines to restore live analytics.</p>
          </div>
        ) : null}

        {meta?.warnings?.length ? (
          <div className="space-y-2">
            {meta.warnings.map((warning, index) => (
              <div
                key={index}
                className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900"
              >
                {warning}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {dashboardStats.map((stat, index) => (
          <Card
            key={index}
            className={`${dashboardCardThemes[index % dashboardCardThemes.length].card} transition-transform duration-200 hover:-translate-y-0.5`}
          >
            <div
              className={`${dashboardCardThemes[index % dashboardCardThemes.length].overlay}`}
              aria-hidden="true"
            />
            <CardHeader className="relative z-10 flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle className={`text-sm font-medium ${dashboardCardThemes[index % dashboardCardThemes.length].title}`}>
                {stat.title}
              </CardTitle>
              <div
                className={`p-2 rounded-lg backdrop-blur-sm ${dashboardCardThemes[index % dashboardCardThemes.length].icon}`}
              >
                <stat.icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className={`${dashboardCardThemes[index % dashboardCardThemes.length].value}`}>
                {stat.value}
              </div>
              <p
                className={`mt-2 flex items-center text-xs ${
                  stat.trendType === 'up'
                    ? dashboardCardThemes[index % dashboardCardThemes.length].trendUp
                    : dashboardCardThemes[index % dashboardCardThemes.length].trendDown
                }`}
              >
                {stat.trendType === 'up' ? (
                  <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
                {stat.trend} from last month
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg">User Growth</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <Line data={userGrowthData} options={userGrowthOptions} />
          </CardContent>
        </Card>
        <Card className="border border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg">Recipe Analytics</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <Bar data={recipeAnalyticsData} options={recipeAnalyticsOptions} />
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="border border-border bg-card">
        <CardHeader>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentActivity.length === 0 ? (
              <div className="rounded-md border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                No recent activity recorded yet. Platform updates will appear here once actions are logged.
              </div>
            ) : (
              recentActivity.map((item) => {
                const actor = item.user?.name || item.user?.email || 'System';
                const entitySummary = item.entitySummary || item.entityId || 'Item';
                const actionLabel = `${item.action ?? 'action'} ${item.entityType ? `on ${item.entityType}` : ''}`.trim();
                const timestamp = item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Recently';

                return (
                  <div
                    key={item.id}
                    className="flex items-start pb-4 border-b border-border last:border-0 last:pb-0"
                  >
                    <div className="h-10 w-10 rounded-full bg-muted/50 flex items-center justify-center mr-3">
                      <Users className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{actor}</p>
                      <p className="text-xs text-muted-foreground">
                        {actionLabel}
                        {entitySummary ? ` · ${entitySummary}` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">{timestamp}</p>
                    </div>
                    {item.notes ? (
                      <div className="ml-3 rounded-md bg-muted px-3 py-1 text-xs text-muted-foreground">
                        {item.notes}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
