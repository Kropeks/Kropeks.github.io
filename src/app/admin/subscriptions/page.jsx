'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import Button from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, CreditCard, Check, X, Clock, AlertCircle, User, Calendar } from 'lucide-react';

export default function SubscriptionsPage() {
  const [subscriptionData, setSubscriptionData] = useState({
    subscriptions: [],
    pagination: {
      total: 0,
      totalPages: 0,
    },
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [page, setPage] = useState(1);
  const limit = 10;
  const [error, setError] = useState(null);
  const [actionInFlight, setActionInFlight] = useState(false);

  const { subscriptions, pagination } = subscriptionData;
  const totalPages = Math.max(1, pagination?.totalPages || 1);

  const activeCount = pagination.total || 0;
  const monthlyRevenue = subscriptions.reduce((acc, sub) => acc + (Number(sub.plan.price) || 0), 0);
  const pendingRenewals = subscriptions.filter((sub) => sub.status === 'past_due').length;

  useEffect(() => {
    const fetchSubscriptions = async () => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
          page: String(page),
          limit: String(limit),
        });

        if (statusFilter) {
          params.set('status', statusFilter);
        }

        if (search) {
          params.set('search', search);
        }

        const response = await fetch(`/api/admin/subscriptions?${params.toString()}`, {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error('Failed to load subscriptions');
        }

        const data = await response.json();
        setSubscriptionData(data);
      } catch (error) {
        console.error('Error fetching subscriptions:', error);
        setError(error.message || 'Unable to load subscriptions. Showing the most recent known data.');
        setSubscriptionData({
          subscriptions: [],
          pagination: {
            total: 0,
            totalPages: 0,
          },
        });
      } finally {
        setLoading(false);
      }
    };

    fetchSubscriptions();
  }, [page, search, statusFilter]);

  const handleStatusChange = async (subscriptionId, status) => {
    try {
      setActionInFlight(true);
      setError(null);

      const response = await fetch('/api/admin/subscriptions', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ subscriptionId, data: { status } }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || 'Failed to update subscription');
      }

      setSubscriptionData((prev) => ({
        ...prev,
        subscriptions: prev.subscriptions.map((sub) =>
          sub.id === subscriptionId ? { ...sub, status } : sub
        ),
      }));
    } catch (error) {
      console.error('Error updating subscription status:', error);
      setError(error.message || 'Unable to update subscription status.');
    }
    setActionInFlight(false);
  };

  const formatDate = (dateString) => {
    if (!dateString) {
      return '—';
    }
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  const formatCurrency = (amount) => {
    const numericAmount = Number(amount);

    if (Number.isNaN(numericAmount)) {
      return 'P0.00 pesos';
    }

    const formattedAmount = numericAmount.toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    return `P${formattedAmount} pesos`;
  };

  const formatPaymentMethod = (method) => {
    if (!method) return '—';
    return method.replace(/_/g, ' ');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Subscription Management</h1>
        <p className="text-gray-500">Manage user subscriptions and billing</p>
      </div>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <p className="font-semibold">{error}</p>
          <p>Try refreshing or adjusting filters if the problem continues.</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="relative overflow-hidden rounded-2xl border border-white/40 bg-gradient-to-br from-olive-600 via-olive-500 to-matte-500 text-white shadow-xl shadow-olive-900/20">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.25),transparent_55%)]" aria-hidden="true" />
          <div className="relative p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white/80">Active Premium Subscriptions</p>
                <p className="text-3xl font-semibold tracking-tight">{activeCount}</p>
              </div>
              <div className="p-3 bg-white/20 rounded-full backdrop-blur-sm">
                <Check className="h-6 w-6 text-white" />
              </div>
            </div>
            <p className="mt-3 text-sm text-white/80">All premium subscribers currently filtered</p>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-white/40 bg-gradient-to-br from-matte-400 via-soft-400 to-light-400 text-olive-950 shadow-xl shadow-olive-900/15">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.4),transparent_60%)]" aria-hidden="true" />
          <div className="relative p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-olive-900/70">Monthly Revenue</p>
                <p className="text-3xl font-semibold tracking-tight">{formatCurrency(monthlyRevenue)}</p>
              </div>
              <div className="p-3 bg-white/40 rounded-full backdrop-blur-sm">
                <CreditCard className="h-6 w-6 text-olive-700" />
              </div>
            </div>
            <p className="mt-3 text-sm text-olive-900/70">Based on plans shown on this page</p>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-white/40 bg-gradient-to-br from-yellow-100 via-amber-100 to-light-200 text-amber-950 shadow-xl shadow-amber-900/10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(251,191,36,0.35),transparent_65%)]" aria-hidden="true" />
          <div className="relative p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-amber-900/70">Pending Renewals</p>
                <p className="text-3xl font-semibold tracking-tight">{pendingRenewals}</p>
              </div>
              <div className="p-3 bg-amber-200/60 rounded-full backdrop-blur-sm">
                <Clock className="h-6 w-6 text-amber-700" />
              </div>
            </div>
            <p className="mt-3 text-sm text-amber-900/70">Total with status past due</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mt-6">
        <div className="relative flex-1">
          <Input
            placeholder="Search subscriptions..."
            className="pl-10"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="w-full md:w-48">
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
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="canceled">Canceled</SelectItem>
              <SelectItem value="past_due">Past Due</SelectItem>
              <SelectItem value="all">All Subscriptions</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Payment Method</TableHead>
              <TableHead>Last Payment</TableHead>
              <TableHead>Next Billing</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  Loading subscriptions...
                </TableCell>
              </TableRow>
            ) : subscriptions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                  No subscriptions found
                </TableCell>
              </TableRow>
            ) : (
              subscriptions.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
                        <User className="h-5 w-5 text-gray-500" />
                      </div>
                      <div>
                        <div className="font-medium">{sub.customer.name}</div>
                        <div className="text-sm text-gray-500">{sub.customer.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <td className="font-medium">{sub.plan.name}</td>
                  <td>
                    <div className="font-medium">{formatCurrency(sub.plan.price)}</div>
                    <div className="text-sm text-gray-500">per {sub.plan.billingCycle}</div>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-700">{formatPaymentMethod(sub.paymentMethod)}</span>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <span>{formatDate(sub.lastPaymentDate)}</span>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <span>{formatDate(sub.nextBillingDate)}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      sub.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : sub.status === 'canceled'
                        ? 'bg-gray-100 text-gray-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {sub.status}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-2">
                      {sub.status === 'active' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStatusChange(sub.id, 'canceled')}
                          className={`text-red-600 hover:bg-red-50 ${actionInFlight ? 'opacity-60 cursor-not-allowed' : ''}`}
                          disabled={actionInFlight}
                        >
                          <X className="h-4 w-4 mr-1" /> Cancel
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStatusChange(sub.id, 'active')}
                          className={`text-green-600 hover:bg-green-50 ${actionInFlight ? 'opacity-60 cursor-not-allowed' : ''}`}
                          disabled={actionInFlight}
                        >
                          <Check className="h-4 w-4 mr-1" /> Activate
                        </Button>
                      )}
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
          Showing {subscriptions.length} of {pagination.total} subscriptions
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || subscriptions.length < limit}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
