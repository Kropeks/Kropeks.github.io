'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getRefundRequests, updateRefundRequest } from '@/lib/actions/admin-refunds.actions';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Button from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Loader2,
  Mail,
  RefreshCcw,
  Search,
  User,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'manual', label: 'Manual Follow-up' },
  { value: 'processed', label: 'Processed' },
  { value: 'failed', label: 'Failed / Denied' },
  { value: 'all', label: 'All statuses' },
];

const STATUS_BADGE_CLASSES = {
  pending: 'bg-amber-100 text-amber-800',
  processing: 'bg-blue-100 text-blue-800',
  manual: 'bg-indigo-100 text-indigo-800',
  processed: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-rose-100 text-rose-800',
  default: 'bg-gray-100 text-gray-700',
};

const GUARANTEE_LABELS = {
  money_back: '14-day guarantee',
  manual: 'Manual review',
  pro_rated: 'Pro-rated',
};

const PAGE_LIMIT = 10;

function formatCurrency(amount, currency = 'PHP') {
  if (amount == null || Number.isNaN(Number(amount))) {
    return '—';
  }
  try {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: currency || 'PHP',
      minimumFractionDigits: 2,
    }).format(Number(amount));
  } catch (error) {
    return `${currency || 'PHP'} ${Number(amount).toFixed(2)}`;
  }
}

function formatDateTime(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString();
}

export default function AdminRefundsPage() {
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [page, setPage] = useState(1);
  const [refundData, setRefundData] = useState({
    refunds: [],
    pagination: {
      total: 0,
      totalPages: 0,
    },
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedRefund, setSelectedRefund] = useState(null);
  const [updateForm, setUpdateForm] = useState({ status: 'pending', referenceId: '', notes: '' });
  const [feedback, setFeedback] = useState(null);

  const { refunds, pagination } = refundData;
  const totalPages = Math.max(1, pagination?.totalPages || 1);

  const loadRefunds = useCallback(async () => {
    try {
      setLoading(true);
      setFeedback(null);
      const data = await getRefundRequests({
        page,
        limit: PAGE_LIMIT,
        status: statusFilter,
        search,
      });
      setRefundData(data);
    } catch (error) {
      console.error('Failed to load refund requests:', error);
      setFeedback({ type: 'error', message: error.message || 'Failed to load refunds. Please try again.' });
      setRefundData({ refunds: [], pagination: { total: 0, totalPages: 0 } });
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => {
    loadRefunds();
  }, [loadRefunds]);

  const handleOpenDialog = useCallback((refund) => {
    if (!refund) return;
    setSelectedRefund(refund);
    setUpdateForm({
      status: refund.status || 'pending',
      referenceId: refund.referenceId || '',
      notes: refund.notes || '',
    });
    setDialogOpen(true);
  }, []);

  const handleUpdateRefund = useCallback(async () => {
    if (!selectedRefund) return;
    setActionLoading(true);
    setFeedback(null);
    try {
      const response = await updateRefundRequest(selectedRefund.id, {
        status: updateForm.status,
        referenceId: updateForm.referenceId,
        notes: updateForm.notes,
      });

      setFeedback({ type: 'success', message: response?.message || 'Refund updated successfully.' });
      setDialogOpen(false);

      if (response?.refund) {
        setRefundData((prev) => {
          const updatedRefunds = prev.refunds.map((item) =>
            item.id === response.refund.id ? response.refund : item
          );
          return {
            ...prev,
            refunds: updatedRefunds,
          };
        });
      } else {
        loadRefunds();
      }
    } catch (error) {
      console.error('Failed to update refund request:', error);
      setFeedback({ type: 'error', message: error.message || 'Unable to update refund. Please try again.' });
    } finally {
      setActionLoading(false);
    }
  }, [selectedRefund, updateForm, loadRefunds]);

  const statusOptions = useMemo(() => STATUS_OPTIONS, []);

  const pendingCount = useMemo(
    () => refunds.filter((refund) => refund.status === 'pending').length,
    [refunds]
  );

  const processedCount = useMemo(
    () => refunds.filter((refund) => refund.status === 'processed').length,
    [refunds]
  );

  const totalRequested = useMemo(
    () =>
      refunds.reduce((sum, refund) => {
        const amount = Number(refund.amount) || 0;
        return sum + amount;
      }, 0),
    [refunds]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-olive-900 dark:text-gray-100">Refund Management</h1>
          <p className="text-sm text-olive-600 dark:text-gray-400">
            Review, approve, or decline refund requests submitted by users.
          </p>
        </div>
        <Button
          variant="ghost"
          className="inline-flex items-center gap-2 text-sm font-semibold text-olive-700 hover:text-olive-900 dark:text-gray-200 dark:hover:text-white"
          onClick={loadRefunds}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          Refresh data
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500/90 via-emerald-600 to-emerald-700 text-white shadow-lg">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.35),transparent_55%)]" aria-hidden="true" />
          <div className="relative flex items-center justify-between gap-4 p-6">
            <div>
              <p className="text-sm font-medium text-white/70">Pending refunds</p>
              <p className="text-3xl font-semibold tracking-tight">{pendingCount}</p>
            </div>
            <div className="rounded-full bg-white/20 p-3 backdrop-blur-sm">
              <Clock className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-400/90 via-amber-500 to-amber-600 text-amber-950 shadow-lg">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.45),transparent_60%)]" aria-hidden="true" />
          <div className="relative flex items-center justify-between gap-4 p-6">
            <div>
              <p className="text-sm font-medium text-amber-950/70">Total requested</p>
              <p className="text-3xl font-semibold tracking-tight">
                {formatCurrency(totalRequested)}
              </p>
            </div>
            <div className="rounded-full bg-amber-200/60 p-3 backdrop-blur-sm">
              <DollarSign className="h-6 w-6 text-amber-700" />
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500/90 via-blue-600 to-blue-700 text-white shadow-lg">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.3),transparent_65%)]" aria-hidden="true" />
          <div className="relative flex items-center justify-between gap-4 p-6">
            <div>
              <p className="text-sm font-medium text-white/70">Processed this page</p>
              <p className="text-3xl font-semibold tracking-tight">{processedCount}</p>
            </div>
            <div className="rounded-full bg-white/25 p-3 backdrop-blur-sm">
              <CheckCircle2 className="h-6 w-6" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-olive-100 bg-white/90 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/80">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-olive-400" />
            <Input
              placeholder="Search by user email, name, or reference ID"
              className="pl-9"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-full md:w-60">
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {feedback ? (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              feedback.type === 'error'
                ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-200'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200'
            }`}
          >
            {feedback.message}
          </div>
        ) : null}

        <div className="rounded-xl border border-olive-100 overflow-hidden dark:border-gray-800">
          <Table>
            <TableHeader>
              <TableRow className="bg-olive-50/60 text-olive-700 dark:bg-gray-800/60 dark:text-gray-200">
                <TableHead>User</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Guarantee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-sm text-olive-500 dark:text-gray-400">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                    <span className="mt-2 block">Loading refund requests…</span>
                  </TableCell>
                </TableRow>
              ) : refunds.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-sm text-olive-500 dark:text-gray-400">
                    <AlertTriangle className="mx-auto h-6 w-6 text-amber-500" />
                    <span className="mt-2 block">No refunds found. Try adjusting your filters.</span>
                  </TableCell>
                </TableRow>
              ) : (
                refunds.map((refund) => {
                  const badgeClass = STATUS_BADGE_CLASSES[refund.status] || STATUS_BADGE_CLASSES.default;
                  const guaranteeLabel = GUARANTEE_LABELS[refund.guaranteeType] || 'Manual review';

                  return (
                    <TableRow key={refund.id} className="hover:bg-olive-50/40 dark:hover:bg-gray-800/40">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-olive-100/80 text-olive-700 dark:bg-gray-800 dark:text-gray-200">
                            <User className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="font-semibold text-olive-900 dark:text-gray-100">
                              {refund.user?.name || 'Unknown user'}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-olive-500 dark:text-gray-400">
                              <Mail className="h-3.5 w-3.5" />
                              <span>{refund.user?.email || 'No email on file'}</span>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-olive-900 dark:text-gray-100">
                          {formatCurrency(refund.amount, refund.currency)}
                        </div>
                        <div className="text-xs text-olive-500 dark:text-gray-400">
                          Payment ID: {refund.payment?.id ?? '—'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-olive-700 dark:text-gray-300">{guaranteeLabel}</div>
                        <div className="text-xs text-olive-500 dark:text-gray-400">
                          Subscription ID: {refund.subscription?.id ?? '—'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass}`}>
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
                          {refund.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-olive-700 dark:text-gray-300">
                          {formatDateTime(refund.requestedAt)}
                        </div>
                        <div className="text-xs text-olive-500 dark:text-gray-400">
                          Processed: {formatDateTime(refund.processedAt)}
                        </div>
                      </TableCell>
                      <TableCell>{refund.referenceId || '—'}</TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-olive-700 hover:bg-olive-100 dark:text-gray-200 dark:hover:bg-gray-800"
                          onClick={() => handleOpenDialog(refund)}
                        >
                          Review
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-olive-500 dark:text-gray-400">
            Showing {refunds.length} of {pagination.total} refund requests
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1 || loading}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Previous
            </Button>
            <div className="text-xs font-medium text-olive-600 dark:text-gray-300">
              Page {page} of {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || refunds.length < PAGE_LIMIT || loading}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-olive-900 dark:text-gray-100">
              Refund request #{selectedRefund?.id}
            </DialogTitle>
            <DialogDescription className="text-olive-600 dark:text-gray-400">
              Update the status or add notes for this refund.
            </DialogDescription>
          </DialogHeader>

          {selectedRefund ? (
            <div className="space-y-6">
              <section className="grid gap-4 rounded-2xl border border-olive-100 bg-olive-50/40 p-4 dark:border-gray-800 dark:bg-gray-900/60 md:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive-500 dark:text-gray-400">
                    User
                  </p>
                  <p className="mt-1 font-medium text-olive-900 dark:text-gray-100">
                    {selectedRefund.user?.name || 'Unknown user'}
                  </p>
                  <p className="text-sm text-olive-600 dark:text-gray-300">
                    {selectedRefund.user?.email || 'No email'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive-500 dark:text-gray-400">
                    Amount
                  </p>
                  <p className="mt-1 font-medium text-olive-900 dark:text-gray-100">
                    {formatCurrency(selectedRefund.amount, selectedRefund.currency)}
                  </p>
                  <p className="text-sm text-olive-600 dark:text-gray-300">
                    Guarantee: {GUARANTEE_LABELS[selectedRefund.guaranteeType] || 'Manual review'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive-500 dark:text-gray-400">
                    Requested
                  </p>
                  <p className="mt-1 font-medium text-olive-900 dark:text-gray-100">{formatDateTime(selectedRefund.requestedAt)}</p>
                  <p className="text-sm text-olive-600 dark:text-gray-300">
                    Processed: {formatDateTime(selectedRefund.processedAt)}
                  </p>
                </div>
              </section>

              <section className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm text-olive-600 dark:text-gray-300">
                  Refund status
                  <Select
                    value={updateForm.status}
                    onValueChange={(value) =>
                      setUpdateForm((prev) => ({
                        ...prev,
                        status: value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.filter((option) => option.value !== 'all').map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                <label className="flex flex-col gap-2 text-sm text-olive-600 dark:text-gray-300">
                  Reference ID
                  <Input
                    value={updateForm.referenceId}
                    onChange={(event) =>
                      setUpdateForm((prev) => ({
                        ...prev,
                        referenceId: event.target.value,
                      }))
                    }
                    placeholder="e.g. internal transaction or bank reference"
                  />
                </label>
              </section>

              <label className="flex flex-col gap-2 text-sm text-olive-600 dark:text-gray-300">
                Notes
                <Textarea
                  value={updateForm.notes}
                  onChange={(event) =>
                    setUpdateForm((prev) => ({
                      ...prev,
                      notes: event.target.value,
                    }))
                  }
                  rows={4}
                  placeholder="Add context for the resolution or internal follow-up steps"
                />
              </label>

              <section className="grid gap-4 rounded-2xl border border-olive-100 bg-white/80 p-4 text-sm text-olive-600 shadow-sm dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-300 md:grid-cols-2">
                <div>
                  <p className="font-semibold text-olive-900 dark:text-gray-100">Subscription</p>
                  <p>Plan: {selectedRefund.subscription?.planName || '—'}</p>
                  <p>Status: {selectedRefund.subscription?.status || '—'}</p>
                  <p>Refund flag: {selectedRefund.subscription?.refundStatus || '—'}</p>
                </div>
                <div>
                  <p className="font-semibold text-olive-900 dark:text-gray-100">Payment</p>
                  <p>
                    Amount:{' '}
                    {selectedRefund.payment?.amount != null
                      ? formatCurrency(selectedRefund.payment.amount, selectedRefund.payment.currency)
                      : '—'}
                  </p>
                  <p>Method: {selectedRefund.payment?.method || '—'}</p>
                  <p>Refund status: {selectedRefund.payment?.refundStatus || '—'}</p>
                </div>
              </section>
            </div>
          ) : null}

          <DialogFooter className="mt-6">
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              disabled={actionLoading}
              className="text-olive-600 hover:text-olive-900 dark:text-gray-300 dark:hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateRefund}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 bg-olive-600 text-white hover:bg-olive-700"
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
