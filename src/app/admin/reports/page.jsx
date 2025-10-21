'use client';

import { useState, useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import Button from '@/components/ui/button';
import Link from 'next/link';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, AlertCircle, User, MessageSquare, Flag, Check, X, Clock, MoreVertical, PieChart } from 'lucide-react';

const metricsFallback = {
  openCount: 0,
  typeCount: 0,
  avgResponseMinutes: null,
  newToday: 0,
};

const formatDuration = (minutes) => {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return '—';
  }

  if (minutes >= 60) {
    const hours = minutes / 60;
    return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
  }

  return `${Math.round(minutes)}m`;
};

export default function ReportsPage() {
  const [reportsData, setReportsData] = useState({
    reports: [],
    pagination: {
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0
    },
    metrics: metricsFallback,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('open');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const limit = 10;
  const [error, setError] = useState(null);
  const [actionInFlight, setActionInFlight] = useState(false);
  
  const { reports, pagination } = reportsData;

  useEffect(() => {
    const fetchReports = async () => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
          page: String(page),
          limit: String(limit),
          status: statusFilter,
          type: typeFilter,
        });

        if (search) {
          params.set('search', search);
        }

        const response = await fetch(`/api/admin/reports?${params.toString()}`, {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error('Failed to load reports');
        }

        const data = await response.json();
        setReportsData((prev) => ({
          reports: data.reports ?? [],
          pagination: data.pagination ?? prev.pagination,
          metrics: {
            ...metricsFallback,
            ...(data.metrics ?? {}),
          },
        }));
      } catch (error) {
        console.error('Error fetching reports:', error);
        setError(error.message || 'Unable to load reports. Showing the most recent known data.');
        setReportsData(prev => ({
          reports: prev.reports,
          pagination: prev.pagination,
          metrics: metricsFallback,
        }));
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [page, search, statusFilter, typeFilter]);

  const handleStatusChange = async (reportId, status) => {
    try {
      setActionInFlight(true);
      setError(null);

      const response = await fetch('/api/admin/reports', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reportId, status }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || 'Failed to update report status');
      }

      const nextStatusForUi = status === 'dismissed' ? 'rejected' : status;

      setReportsData(prev => ({
        ...prev,
        reports: prev.reports.map(report => 
          report.id === reportId ? { ...report, status: nextStatusForUi } : report
        )
      }));
    } catch (error) {
      console.error('Error updating report status:', error);
      setError(error.message || 'Unable to update report status.');
    }
    setActionInFlight(false);
  };

  const getReportIcon = (type) => {
    switch (type) {
      case 'user':
        return <User className="h-4 w-4 text-blue-500" />;
      case 'recipe':
        return <MessageSquare className="h-4 w-4 text-green-500" />;
      case 'comment':
        return <MessageSquare className="h-4 w-4 text-purple-500" />;
      default:
        return <Flag className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status) => {
    const statusClasses = {
      open: 'bg-yellow-100 text-yellow-800',
      reviewed: 'bg-blue-100 text-blue-800',
      resolved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClasses[status] || 'bg-gray-100 text-gray-800'}`}>
        {status}
      </span>
    );
  };

  const getTypeBadge = (type) => {
    const typeClasses = {
      user: 'bg-blue-100 text-blue-800',
      recipe: 'bg-green-100 text-green-800',
      comment: 'bg-purple-100 text-purple-800',
      other: 'bg-gray-100 text-gray-800',
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${typeClasses[type] || 'bg-gray-100 text-gray-800'}`}>
        {type}
      </span>
    );
  };

  const mapStatusToUi = (value) => (value === 'dismissed' ? 'rejected' : value);
  const isStatusActionDisabled = (report, targetStatus) => {
    const uiStatus = mapStatusToUi(targetStatus);
    return actionInFlight || report.status === uiStatus;
  };

  const { metrics } = reportsData;
  const reportTypeItems = useMemo(() => {
    if (!Array.isArray(metrics.reportTypes)) {
      return [];
    }

    return metrics.reportTypes.map((entry) => {
      const typeLabel = entry?.type ? entry.type.replace(/_/g, ' ') : 'Unknown';
      return {
        key: entry?.type ?? 'unknown',
        label: typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1),
        count: Number(entry?.count ?? 0) || 0,
      };
    });
  }, [metrics.reportTypes]);

  const getSubjectLinkInfo = (report) => {
    if (!report?.subject) {
      return null;
    }

    const { type, id } = report.subject;
    if (!type || !id) {
      return null;
    }

    switch (type) {
      case 'recipe':
        return { href: `/recipes/${id}`, label: 'View recipe' };
      case 'community_post':
        return { href: `/community/posts/${id}`, label: 'View post' };
      case 'comment':
        return { href: `/community/comments/${id}`, label: 'View comment' };
      case 'user':
        return { href: `/users/${id}`, label: 'View external profile' };
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Report Management</h1>
        <p className="text-gray-500">Review and manage user reports</p>
      </div>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <p className="font-semibold">{error}</p>
          <p>Try refreshing or adjusting filters if the problem persists.</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="relative overflow-hidden rounded-2xl border border-white/30 bg-gradient-to-br from-rose-500 via-rose-400 to-rose-300 text-white shadow-lg shadow-rose-900/20">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.25),transparent_60%)]" aria-hidden="true" />
          <div className="relative p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white/80">Open Reports</p>
                <p className="text-3xl font-semibold tracking-tight">{metrics.openCount}</p>
              </div>
              <div className="p-3 bg-white/20 rounded-full backdrop-blur-sm">
                <AlertCircle className="h-6 w-6 text-white" />
              </div>
            </div>
            <p className="mt-3 text-sm text-white/85">{metrics.newToday} new today</p>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-white/30 bg-gradient-to-br from-matte-400 via-soft-400 to-light-400 text-olive-950 shadow-lg shadow-olive-900/15">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.35),transparent_65%)]" aria-hidden="true" />
          <div className="relative p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-olive-900/70">Report Types</p>
                <p className="text-3xl font-semibold tracking-tight">{metrics.typeCount}</p>
              </div>
              <div className="p-3 bg-white/45 rounded-full backdrop-blur-sm">
                <PieChart className="h-6 w-6 text-olive-800" />
              </div>
            </div>
            <p className="mt-3 text-sm text-olive-900/70">
              Unique categories of reports received
            </p>
            <div className="mt-4 space-y-3">
              {reportTypeItems.length ? (
                reportTypeItems.map((item) => (
                  <div key={item.key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full bg-olive-600" />
                      <span className="text-sm font-medium text-olive-900">{item.label}</span>
                    </div>
                    <span className="text-sm font-semibold text-olive-800">{item.count}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-olive-900/60">No report types yet.</p>
              )}
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-white/30 bg-gradient-to-br from-emerald-500 via-emerald-400 to-emerald-300 text-white shadow-lg shadow-emerald-900/20">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.2),transparent_65%)]" aria-hidden="true" />
          <div className="relative p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white/80">Avg. Response Time</p>
                <p className="text-3xl font-semibold tracking-tight">{formatDuration(metrics.avgResponseMinutes)}</p>
              </div>
              <div className="p-3 bg-white/25 rounded-full backdrop-blur-sm">
                <Clock className="h-6 w-6 text-white" />
              </div>
            </div>
            <p className="mt-3 text-sm text-white/85">Faster than last week</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Input
            placeholder="Search reports..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full md:w-48">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="all">All Statuses</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:w-48">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="recipe">Recipe</SelectItem>
              <SelectItem value="comment">Comment</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Report</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Reported By</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  Loading reports...
                </TableCell>
              </TableRow>
            ) : reports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                  No reports found
                </TableCell>
              </TableRow>
            ) : (
              reports.map((report) => (
                <TableRow key={report.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
                        {getReportIcon(report.type)}
                      </div>
                      <div className="space-y-1">
                        <div className="font-medium line-clamp-1">{report.title}</div>
                        <div className="text-sm text-gray-500 line-clamp-1">{report.description}</div>
                        {(() => {
                          const subjectLink = getSubjectLinkInfo(report);
                          if (!subjectLink) {
                            return null;
                          }

                          return (
                            <Link
                              href={subjectLink.href}
                              className="text-xs text-olive-700 hover:text-olive-900 hover:underline"
                              target="_blank"
                              rel="noreferrer"
                            >
                              {subjectLink.label}
                            </Link>
                          );
                        })()}
                      </div>
                    </div>
                  </TableCell>
                  <td>{getTypeBadge(report.type)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-gray-400" />
                      <span>{report.reportedBy.name}</span>
                    </div>
                  </td>
                  <td>{getStatusBadge(report.status)}</td>
                  <td>
                    <div className="text-sm text-gray-500">
                      {new Date(report.createdAt).toLocaleDateString()}
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStatusChange(report.id, 'reviewed')}
                        className={`flex items-center text-blue-600 hover:bg-blue-50 ${isStatusActionDisabled(report, 'reviewed') ? 'opacity-60 cursor-not-allowed' : ''}`}
                        disabled={isStatusActionDisabled(report, 'reviewed')}
                      >
                        <MoreVertical className="h-4 w-4 mr-1" /> Mark reviewed
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStatusChange(report.id, 'resolved')}
                        className={`flex items-center text-green-600 hover:bg-green-50 ${isStatusActionDisabled(report, 'resolved') ? 'opacity-60 cursor-not-allowed' : ''}`}
                        disabled={isStatusActionDisabled(report, 'resolved')}
                      >
                        <Check className="h-4 w-4 mr-1" /> Resolve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStatusChange(report.id, 'dismissed')}
                        className={`flex items-center text-red-600 hover:bg-red-50 ${isStatusActionDisabled(report, 'dismissed') ? 'opacity-60 cursor-not-allowed' : ''}`}
                        disabled={isStatusActionDisabled(report, 'dismissed')}
                      >
                        <X className="h-4 w-4 mr-1" /> Dismiss
                      </Button>
                    </div>
                  </td>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          Showing {reports.length} of {pagination.total} reports
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page === 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
