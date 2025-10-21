'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import toast, { Toaster } from 'react-hot-toast';
import { BellPlus, Loader2, ShieldAlert } from 'lucide-react';
import { useSession } from 'next-auth/react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';

const ADMIN_EMAIL_FALLBACK = 'savoryadmin@example.com';

const messageSchema = z.object({
  title: z.string().min(4, 'Title is required').max(120, 'Title too long (120 char max)'),
  body: z
    .string()
    .trim()
    .min(10, 'Message must be at least 10 characters')
    .max(1000, 'Message too long (1000 char max)'),
  metadata: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) {
        return null;
      }
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed === 'object' && parsed !== null) {
          return parsed;
        }
        throw new Error('Metadata must be a JSON object');
      } catch (error) {
        throw new Error('Metadata must be valid JSON');
      }
    }),
  userIds: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) {
        return [];
      }
      return value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => Number.parseInt(part, 10))
        .filter((id) => Number.isInteger(id) && id > 0);
    }),
  notify: z.boolean().default(true),
});

export default function AdminBroadcastPage() {
  const { data: session, status } = useSession();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [metadata, setMetadata] = useState('');
  const [userIds, setUserIds] = useState('');
  const [notify, setNotify] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [adminUser, setAdminUser] = useState(null);
  const [hasAccess, setHasAccess] = useState(true);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    if (status === 'loading') {
      return;
    }

    const user = session?.user;
    if (!user) {
      setHasAccess(false);
      setAdminUser(null);
      setInitializing(false);
      return;
    }

    const email = user.email?.toLowerCase();
    const role = user.role?.toUpperCase();
    const isAdmin = role === 'ADMIN' || email === ADMIN_EMAIL_FALLBACK;

    setHasAccess(Boolean(isAdmin));
    setAdminUser({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
    setInitializing(false);
  }, [session, status]);

  const previewTargets = useMemo(() => {
    if (!userIds.trim()) {
      return 'All verified, active users';
    }
    const cleaned = userIds
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    return `${cleaned.length} user${cleaned.length === 1 ? '' : 's'} specified`;
  }, [userIds]);

  const resetForm = useCallback(() => {
    setTitle('');
    setBody('');
    setMetadata('');
    setUserIds('');
    setNotify(true);
  }, []);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      try {
        setIsSubmitting(true);
        toast.dismiss();

        const parsed = messageSchema.safeParse({
          title,
          body,
          metadata: metadata || undefined,
          userIds: userIds || undefined,
          notify,
        });

        if (!parsed.success) {
          const issues = parsed.error.issues?.map((issue) => issue.message) || ['Validation failed'];
          issues.forEach((message) => toast.error(message));
          return;
        }

        const response = await fetch('/api/admin/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed.data),
        });

        if (response.status === 403) {
          toast.error('You are not authorized to send broadcasts.');
          setHasAccess(false);
          return;
        }

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result?.error || 'Broadcast failed');
        }

        toast.success(`Broadcast sent to ${result.recipients} recipients.`);
        setDialogOpen(false);
        resetForm();
      } catch (error) {
        console.error('[admin notifications] broadcast error', error);
        toast.error(error.message || 'Failed to send broadcast');
      } finally {
        setIsSubmitting(false);
      }
    },
    [body, metadata, notify, resetForm, title, userIds]
  );

  if (initializing || status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground">Checking admin permissions…</p>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <ShieldAlert className="h-12 w-12 text-rose-500" />
        <div>
          <h1 className="text-2xl font-semibold">Access restricted</h1>
          <p className="text-muted-foreground">
            You do not have permission to broadcast notifications. Please contact an administrator.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Toaster position="top-right" />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Broadcast Notifications</h1>
            <p className="text-muted-foreground">
              Send important updates to all users or a targeted list. Messages are logged for moderation.
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <BellPlus className="h-4 w-4" />
            New Broadcast
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-white/30 bg-white/80 dark:bg-olive-900/40 p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Current Admin</h2>
            <p className="text-sm text-muted-foreground">Messages include admin identity for audit trail.</p>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Name</span>
                <span>{adminUser?.name || 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Email</span>
                <span>{adminUser?.email || 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Role</span>
                <span>{adminUser?.role || 'N/A'}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/30 bg-white/80 dark:bg-olive-900/40 p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Delivery</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>Immediate insert into `notifications` table.</li>
              <li>Realtime push via websocket when enabled.</li>
              <li>Respects `notify` toggle for silent vs. broadcast delivery.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-white/30 bg-white/80 dark:bg-olive-900/40 p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Moderation Guardrails</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>Title limited to 120 characters.</li>
              <li>Body limited to 1000 characters.</li>
              <li>Optional metadata validated as JSON.</li>
            </ul>
          </div>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Compose broadcast message</DialogTitle>
              <DialogDescription>
                Communicate critical updates. Use the recipients field to target specific users.
              </DialogDescription>
            </DialogHeader>

            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="broadcast-title">Title</Label>
                  <Input
                    id="broadcast-title"
                    placeholder="Maintenance announcement"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={120}
                    required
                  />
                  <p className="text-xs text-muted-foreground">Displayed in notification list.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="broadcast-body">Message</Label>
                  <Textarea
                    id="broadcast-body"
                    placeholder="Share the details here..."
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    minLength={10}
                    maxLength={1000}
                    rows={6}
                    required
                  />
                  <p className="text-xs text-muted-foreground">Supports plain text only. Max 1000 characters.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="broadcast-metadata">Metadata (optional JSON)</Label>
                  <Textarea
                    id="broadcast-metadata"
                    placeholder='{"link": "/status"}'
                    value={metadata}
                    onChange={(event) => setMetadata(event.target.value)}
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    Provide structured data consumed by clients (e.g., links). Must be valid JSON object.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="broadcast-userIds">Target user IDs (comma separated)</Label>
                  <Input
                    id="broadcast-userIds"
                    placeholder="Leave empty for all qualified users"
                    value={userIds}
                    onChange={(event) => setUserIds(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">{previewTargets}</p>
                </div>

                <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <div>
                    <Label htmlFor="broadcast-notify">Send realtime websocket push</Label>
                    <p className="text-xs text-muted-foreground">
                      Disable to insert into the database without notifying active sessions.
                    </p>
                  </div>
                  <Switch
                    id="broadcast-notify"
                    checked={notify}
                    onCheckedChange={setNotify}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDialogOpen(false);
                    resetForm();
                  }}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Send broadcast'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
