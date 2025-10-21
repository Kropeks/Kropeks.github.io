'use client';

import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import Button from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, User, Check, X } from 'lucide-react';

export default function UsersPage() {
  const [usersData, setUsersData] = useState({
    users: [],
    pagination: {
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0
    }
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const limit = 10;
  const [error, setError] = useState(null);
  const [actionInFlight, setActionInFlight] = useState(false);

  const fetchUsers = useCallback(async ({ showSpinner = true } = {}) => {
    try {
      if (showSpinner) {
        setLoading(true);
      }
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

      const response = await fetch(`/api/admin/users?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Failed to load users');
      }

      const data = await response.json();
      setUsersData(data);
    } catch (error) {
      console.error('Error fetching users:', error);
      setError(error.message || 'Unable to load users. Showing the most recent known data.');
    } finally {
      if (showSpinner) {
        setLoading(false);
      }
    }
  }, [page, limit, search, statusFilter]);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      fetchUsers();
    }, 300);
    return () => clearTimeout(debounceTimer);
  }, [fetchUsers]);

  const handleStatusChange = async (userId, newStatus) => {
    try {
      setActionInFlight(true);
      setError(null);

      const response = await fetch('/api/admin/users/status', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, status: newStatus }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || 'Unable to update status');
      }

      const normalizedStatus = result?.data?.account_status || newStatus;
      const updatedVerification = result?.data?.is_verified;

      setUsersData(prev => {
        const shouldRemove = normalizedStatus === 'suspended' && statusFilter === 'all';
        const users = shouldRemove
          ? prev.users.filter(user => user.id !== userId)
          : prev.users.map(user => 
              user.id === userId
                ? {
                    ...user,
                    status: normalizedStatus,
                    account_status: normalizedStatus,
                    is_verified: typeof updatedVerification === 'number' ? updatedVerification : user.is_verified
                  }
                : user
            );

        return {
          ...prev,
          users,
          pagination: {
            ...prev.pagination,
            total: shouldRemove ? Math.max(prev.pagination.total - 1, 0) : prev.pagination.total
          }
        };
      });

      await fetchUsers({ showSpinner: false });
    } catch (error) {
      console.error('Error updating user status:', error);
      setError(error.message || 'Failed to update user status.');
    }
    setActionInFlight(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">User Management</h1>
      </div>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <p className="font-semibold">{error}</p>
          <p>Refresh or adjust filters if the issue persists.</p>
        </div>
      ) : null}

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search users..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full md:w-48">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  Loading users...
                </TableCell>
              </TableRow>
            ) : usersData.users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              usersData.users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
                        <User className="h-5 w-5 text-gray-500" />
                      </div>
                      <div>
                        <div>{user.name}</div>
                        <div className="text-sm text-gray-500">@{user.username || 'user'}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      user.role === 'admin' 
                        ? 'bg-purple-100 text-purple-800' 
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {user.role}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      user.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : user.status === 'suspended'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {user.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStatusChange(user.id, 'active')}
                        className={`flex items-center text-green-600 hover:bg-green-50 ${user.status === 'active' || actionInFlight ? 'opacity-60 cursor-not-allowed' : ''}`}
                        disabled={user.status === 'active' || actionInFlight}
                      >
                        <Check className="h-4 w-4 mr-1" /> Activate
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStatusChange(user.id, 'suspended')}
                        className={`flex items-center text-red-600 hover:bg-red-50 ${user.status === 'suspended' || actionInFlight ? 'opacity-60 cursor-not-allowed' : ''}`}
                        disabled={user.status === 'suspended' || actionInFlight}
                      >
                        <X className="h-4 w-4 mr-1" /> Suspend
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {usersData.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <div className="text-sm text-gray-500">
            Showing <span className="font-medium">{(page - 1) * limit + 1}</span> to{' '}
            <span className="font-medium">
              {Math.min(page * limit, usersData.pagination.total)}
            </span>{' '}
            of <span className="font-medium">{usersData.pagination.total}</span> users
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
            >
              Previous
            </Button>
            <div className="flex items-center space-x-1">
              {Array.from({ length: Math.min(5, usersData.pagination.totalPages) }, (_, i) => {
                // Show first page, last page, and pages around current page
                let pageNum;
                if (usersData.pagination.totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= usersData.pagination.totalPages - 2) {
                  pageNum = usersData.pagination.totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                
                return (
                  <Button
                    key={pageNum}
                    variant={page === pageNum ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPage(pageNum)}
                    disabled={loading}
                  >
                    {pageNum}
                  </Button>
                );
              })}
              {usersData.pagination.totalPages > 5 && (
                <span className="px-2 py-1 text-sm text-gray-500">...</span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(usersData.pagination.totalPages, p + 1))}
              disabled={page === usersData.pagination.totalPages || loading}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
