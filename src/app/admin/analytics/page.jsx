'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Button from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Users, Utensils, Clock, BarChart2, LineChart, PieChart, Download, Filter } from 'lucide-react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState('30days');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  // Fetch analytics data
  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/admin/analytics', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ timeRange }),
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch analytics data');
        }
        
        const data = await response.json();
        setStats(data);
      } catch (err) {
        console.error('Error fetching analytics:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAnalytics();
  }, [timeRange]);

  const displayStats = stats || {
    totalUsers: 0,
    newUsers: 0,
    activeUsers: 0,
    totalRecipes: 0,
    newRecipes: 0,
    avgSessionDuration: '0m',
    bounceRate: '0%',
  };

  const buildFallbackLabels = useMemo(() => {
    const now = new Date();
    if (timeRange === '12months') {
      return Array.from({ length: 12 }, (_, index) => {
        const date = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1);
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      });
    }

    const days = timeRange === '7days' ? 7 : timeRange === '90days' ? 90 : 30;
    return Array.from({ length: days }, (_, index) => {
      const date = new Date(now);
      date.setDate(date.getDate() - (days - 1 - index));
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
  }, [timeRange]);

  const seriesLabels = stats?.series?.labels?.length ? stats.series.labels : buildFallbackLabels;

  const userGrowthDataset = useMemo(() => {
    const dataPoints = stats?.series?.userGrowth?.length
      ? stats.series.userGrowth
      : Array(seriesLabels.length).fill(0);

    return {
      labels: seriesLabels,
      datasets: [
        {
          label: 'New Users',
          data: dataPoints,
          borderColor: 'rgba(107, 142, 35, 1)',
          backgroundColor: 'rgba(107, 142, 35, 0.2)',
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointBackgroundColor: 'rgba(107, 142, 35, 0.9)',
        },
      ],
    };
  }, [seriesLabels, stats]);

  const recipeGrowthDataset = useMemo(() => {
    const dataPoints = stats?.series?.recipeGrowth?.length
      ? stats.series.recipeGrowth
      : Array(seriesLabels.length).fill(0);

    return {
      labels: seriesLabels,
      datasets: [
        {
          label: 'New Recipes',
          data: dataPoints,
          borderColor: 'rgba(146, 185, 85, 1)',
          backgroundColor: 'rgba(146, 185, 85, 0.25)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: 'rgba(130, 160, 70, 0.95)',
        },
      ],
    };
  }, [seriesLabels, stats]);

  const trafficSourcesDataset = useMemo(() => {
    const sources = stats?.trafficSources?.length ? stats.trafficSources : [];

    if (!sources.length) {
      return {
        labels: ['No Data'],
        datasets: [
          {
            data: [1],
            backgroundColor: ['rgba(148, 163, 184, 0.35)'],
            borderWidth: 0,
          },
        ],
      };
    }

    const palette = [
      'rgba(107, 142, 35, 0.9)',
      'rgba(146, 185, 85, 0.9)',
      'rgba(234, 179, 8, 0.9)',
      'rgba(37, 99, 235, 0.9)',
      'rgba(16, 185, 129, 0.9)',
      'rgba(217, 70, 239, 0.9)',
    ];

    return {
      labels: sources.map((item) => item.source ?? 'Unknown'),
      datasets: [
        {
          data: sources.map((item) => item.visits ?? 0),
          backgroundColor: sources.map((_, index) => palette[index % palette.length]),
          borderWidth: 1,
        },
      ],
    };
  }, [stats]);

  const chartCommonOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
          },
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.92)',
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.12)',
          titleColor: '#f8fafc',
          bodyColor: '#e2e8f0',
          padding: 12,
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            color: 'rgba(71, 85, 105, 0.85)',
            maxRotation: 45,
            minRotation: 0,
            autoSkip: true,
            maxTicksLimit: 10,
          },
        },
        y: {
          grid: {
            color: 'rgba(148, 163, 184, 0.2)',
            drawBorder: false,
          },
          ticks: {
            color: 'rgba(71, 85, 105, 0.85)',
            beginAtZero: true,
          },
        },
      },
    }),
    [],
  );

  const doughnutOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 18,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.92)',
          borderColor: 'rgba(255, 255, 255, 0.12)',
          borderWidth: 1,
          titleColor: '#f8fafc',
          bodyColor: '#e2e8f0',
        },
      },
    }),
    [],
  );

  const statThemes = [
    {
      card: 'relative overflow-hidden border border-white/30 bg-gradient-to-br from-olive-600 via-olive-500 to-matte-500 text-white shadow-lg shadow-olive-900/25',
      overlay: 'absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.25),transparent_60%)]',
      title: 'text-white/80',
      icon: 'bg-white/20 text-white',
      value: 'text-3xl font-semibold tracking-tight text-white',
      trendUp: 'text-emerald-200',
      trendDown: 'text-rose-200',
    },
    {
      card: 'relative overflow-hidden border border-white/30 bg-gradient-to-br from-matte-400 via-soft-400 to-light-400 text-olive-900 shadow-lg shadow-olive-900/15',
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

  const StatCard = ({ title, value, icon: Icon, change, changeType, index = 0 }) => {
    const theme = statThemes[index % statThemes.length];

    return (
      <Card className={`${theme.card} transition-transform duration-200 hover:-translate-y-0.5`}>
        <div className={theme.overlay} aria-hidden="true" />
        <CardHeader className="relative z-10 flex flex-row items-center justify-between pb-2">
          <CardTitle className={`text-sm font-medium ${theme.title}`}>{title}</CardTitle>
          <div className={`p-2 rounded-lg backdrop-blur-sm ${theme.icon}`}>
            <Icon className="h-4 w-4" />
          </div>
        </CardHeader>
        <CardContent className="relative z-10">
          <div className={theme.value}>{value}</div>
          {change && (
            <p className={`text-xs mt-2 ${changeType === 'increase' ? theme.trendUp : theme.trendDown}`}>
              {changeType === 'increase' ? '↑' : '↓'} {change} from last period
            </p>
          )}
        </CardContent>
      </Card>
    );
  };

  const ChartCard = ({ title, icon: Icon, children, className = '' }) => (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">{title}</CardTitle>
          {Icon && <Icon className="h-5 w-5 text-gray-400" />}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          {children}
        </div>
      </CardContent>
    </Card>
  );

  const TopListCard = ({ title, items, renderItem }) => (
    <Card className="relative overflow-hidden border border-white/30 bg-gradient-to-br from-white via-light-100 to-soft-200 text-olive-900 shadow-lg shadow-olive-900/10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.45),transparent_70%)]" aria-hidden="true" />
      <CardHeader className="relative z-10">
        <CardTitle className="text-lg font-semibold text-olive-900/80">{title}</CardTitle>
      </CardHeader>
      <CardContent className="relative z-10">
        <div className="space-y-3">
          {items?.length ? (
            items.map(renderItem)
          ) : (
            <p className="text-sm text-olive-900/60">No data available for this period.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
          <p className="text-gray-500">Track and analyze your platform's performance</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Select time range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7days">Last 7 days</SelectItem>
                <SelectItem value="30days">Last 30 days</SelectItem>
                <SelectItem value="90days">Last 90 days</SelectItem>
                <SelectItem value="12months">Last 12 months</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="recipes">Recipes</TabsTrigger>
          <TabsTrigger value="traffic">Traffic</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard 
              title="Total Users" 
              value={displayStats.totalUsers.toLocaleString()} 
              icon={Users} 
              change="12%" 
              changeType="increase" 
              index={0}
            />
            <StatCard 
              title="New Users (30d)" 
              value={displayStats.newUsers.toLocaleString()} 
              icon={Users} 
              change="5%" 
              changeType="increase" 
              index={1}
            />
            <StatCard 
              title="Active Users (30d)" 
              value={displayStats.activeUsers.toLocaleString()} 
              icon={Users} 
              change="8%" 
              changeType="increase" 
              index={2}
            />
            <StatCard 
              title="Total Recipes" 
              value={displayStats.totalRecipes.toLocaleString()} 
              icon={Utensils} 
              change="15%" 
              changeType="increase" 
              index={3}
            />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <ChartCard title="User Growth" icon={LineChart}>
              <Line data={userGrowthDataset} options={chartCommonOptions} />
            </ChartCard>
            <ChartCard title="Top Traffic Sources" icon={PieChart}>
              <Doughnut data={trafficSourcesDataset} options={doughnutOptions} />
            </ChartCard>
          </div>

          <div className="grid gap-6">
            <ChartCard title="Recipe Engagement" icon={BarChart2}>
              <Line data={recipeGrowthDataset} options={chartCommonOptions} />
            </ChartCard>
          </div>
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <StatCard 
              title="Total Users" 
              value={displayStats.totalUsers.toLocaleString()} 
              icon={Users} 
              change="12%" 
              changeType="increase" 
              index={0}
            />
            <StatCard 
              title="New Users" 
              value={displayStats.newUsers.toLocaleString()} 
              icon={Users} 
              change="5%" 
              changeType="increase" 
              index={1}
            />
            <StatCard 
              title="Active Users" 
              value={displayStats.activeUsers.toLocaleString()} 
              icon={Users} 
              change="8%" 
              changeType="increase" 
              index={2}
            />
          </div>
          <ChartCard title="User Growth Over Time" icon={LineChart}>
            <Line data={userGrowthDataset} options={chartCommonOptions} />
          </ChartCard>
          <TopListCard
            title="Top Active Users"
            items={stats?.topUsers}
            renderItem={(user) => (
              <div key={user.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                  <p className="text-xs text-gray-500">{user.email}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-olive-700">{user.totalRecipes} recipes</p>
                  <p className="text-xs text-gray-400">Last active: {user.lastActivity ? new Date(user.lastActivity).toLocaleDateString() : '—'}</p>
                </div>
              </div>
            )}
          />
        </TabsContent>

        <TabsContent value="recipes" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <StatCard 
              title="Total Recipes" 
              value={displayStats.totalRecipes.toLocaleString()} 
              icon={Utensils} 
              change="15%" 
              changeType="increase" 
              index={0}
            />
            <StatCard 
              title="New Recipes (30d)" 
              value={displayStats.newRecipes.toLocaleString()} 
              icon={Utensils} 
              change="10%" 
              changeType="increase" 
              index={1}
            />
            <StatCard 
              title="Avg. Engagement" 
              value={displayStats.avgSessionDuration} 
              icon={Clock} 
              change="2%" 
              changeType="increase" 
              index={2}
            />
          </div>
          <ChartCard title="Recipe Growth Over Time" icon={LineChart}>
            <Line data={recipeGrowthDataset} options={chartCommonOptions} />
          </ChartCard>
          <TopListCard
            title="Top Performing Recipes"
            items={stats?.topRecipes}
            renderItem={(recipe) => (
              <div key={recipe.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{recipe.title}</p>
                  <p className="text-xs text-gray-500">{recipe.author}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-olive-700">{recipe.rating ? `${recipe.rating.toFixed(1)}★` : 'N/A'}</p>
                  <p className="text-xs text-gray-400">{recipe.totalReviews} reviews</p>
                </div>
              </div>
            )}
          />
        </TabsContent>

        <TabsContent value="traffic" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard 
              title="Total Visits" 
              value="45,678" 
              icon={Users} 
              change="12%" 
              changeType="increase" 
              index={0}
            />
            <StatCard 
              title="Unique Visitors" 
              value="32,456" 
              icon={Users} 
              change="8%" 
              changeType="increase" 
              index={1}
            />
            <StatCard 
              title="Page Views" 
              value="124,890" 
              icon={BarChart2} 
              change="15%" 
              changeType="increase" 
              index={2}
            />
            <StatCard 
              title="Bounce Rate" 
              value={displayStats.bounceRate} 
              icon={BarChart2} 
              change="3%" 
              changeType="decrease" 
              index={3}
            />
          </div>
          <ChartCard 
            title="Traffic Sources" 
            icon={PieChart}
          >
            <Doughnut data={trafficSourcesDataset} options={doughnutOptions} />
          </ChartCard>
          <ChartCard 
            title="User & Recipe Growth" 
            icon={LineChart}
          >
            <Bar
              data={{
                labels: seriesLabels,
                datasets: [
                  {
                    label: 'New Users',
                    data: stats?.series?.userGrowth?.length ? stats.series.userGrowth : Array(seriesLabels.length).fill(0),
                    backgroundColor: 'rgba(107, 142, 35, 0.75)',
                    borderRadius: 6,
                    borderSkipped: false,
                  },
                  {
                    label: 'New Recipes',
                    data: stats?.series?.recipeGrowth?.length ? stats.series.recipeGrowth : Array(seriesLabels.length).fill(0),
                    backgroundColor: 'rgba(234, 179, 8, 0.75)',
                    borderRadius: 6,
                    borderSkipped: false,
                  },
                ],
              }}
              options={{
                ...chartCommonOptions,
                plugins: {
                  ...chartCommonOptions.plugins,
                  legend: {
                    position: 'bottom',
                    labels: {
                      usePointStyle: true,
                      padding: 18,
                    },
                  },
                },
              }}
            />
          </ChartCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
