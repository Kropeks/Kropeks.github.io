'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Flag } from 'lucide-react';

import { useAuthModal } from '@/components/AuthProvider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@/components/ui/select';

const REPORT_OPTIONS = [
  'Spam or misleading',
  'Harassment or bullying',
  'Hate speech or symbols',
  'Inappropriate or explicit content',
  'Scam, fraud, or phishing',
  'Self-harm or suicide',
  'Dangerous or illegal activities',
  'Misinformation or false claims',
  'Intellectual property violation',
  'Privacy violation',
  'Other'
];

const MAX_REASON_LENGTH = 1000;

const parseErrorMessage = async (response) => {
  try {
    const payload = await response.json();
    if (payload?.error) {
      return String(payload.error);
    }
    if (payload?.message) {
      return String(payload.message);
    }
  } catch (error) {
    // ignore JSON parsing errors, fall back to status text
  }
  return response.statusText || 'Failed to submit report.';
};

export default function ReportUserButton({ userId, displayName }) {
  const { requireAuth } = useAuthModal();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [category, setCategory] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const userLabel = useMemo(() => displayName?.trim() || 'this profile', [displayName]);

  useEffect(() => {
    if (!isDialogOpen) {
      setCategory('');
      setReason('');
      setIsSubmitting(false);
      setErrorMessage('');
      setSuccessMessage('');
    }
  }, [isDialogOpen]);

  const handleSubmit = useCallback(async (event) => {
    event.preventDefault();

    if (!requireAuth('report user profiles for review')) {
      return;
    }

    if (!userId) {
      setErrorMessage('Unable to determine which profile to report.');
      return;
    }

    const trimmedCategory = category.trim();
    const trimmedReason = reason.trim();

    if (!trimmedCategory) {
      setErrorMessage('Select the category that best describes this issue.');
      return;
    }

    if (!trimmedReason) {
      setErrorMessage('Please describe what is wrong with this profile.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await fetch(`/api/users/${encodeURIComponent(userId)}/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: trimmedReason, category: trimmedCategory })
      });

      if (!response.ok) {
        const message = await parseErrorMessage(response);
        throw new Error(message || 'Failed to submit report.');
      }

      const payload = await response.json();
      setSuccessMessage(payload?.message || 'Thanks! Our moderators will review this profile.');
      setCategory('');
      setReason('');
    } catch (error) {
      setErrorMessage(error.message || 'Failed to submit report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [category, reason, requireAuth, userId]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!requireAuth('report user profiles for review')) {
            return;
          }
          setIsDialogOpen(true);
        }}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-red-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-red-600 transition hover:border-red-300 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/40 dark:text-red-300 dark:hover:border-red-400 dark:hover:bg-red-500/10 sm:w-auto"
        aria-label={`Report ${userLabel}`}
      >
        <Flag className="h-3.5 w-3.5" />
        Report
      </button>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Report profile</DialogTitle>
            <DialogDescription>
              Tell us what violates our guidelines. Reports are reviewed by moderators to keep the community safe.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label htmlFor="user-report-category" className="text-sm font-medium text-gray-700 dark:text-gray-200">
                Category
              </label>
              <Select
                value={category}
                onValueChange={(value) => {
                  setCategory(value);
                  if (errorMessage) {
                    setErrorMessage('');
                  }
                }}
                disabled={isSubmitting}
                required
              >
                <SelectTrigger id="user-report-category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label htmlFor="user-report-reason" className="text-sm font-medium text-gray-700 dark:text-gray-200">
                Reason
              </label>
              <textarea
                id="user-report-reason"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value.slice(0, MAX_REASON_LENGTH));
                  if (errorMessage) {
                    setErrorMessage('');
                  }
                }}
                rows={4}
                maxLength={MAX_REASON_LENGTH}
                className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-800 shadow-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                placeholder={`Describe what concerns you about ${userLabel}.`}
                disabled={isSubmitting}
                required
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">Up to {MAX_REASON_LENGTH} characters.</p>
              {errorMessage ? <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p> : null}
              {successMessage ? <p className="text-sm text-green-600 dark:text-green-400">{successMessage}</p> : null}
            </div>
            <DialogFooter className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
              <DialogClose asChild>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
              </DialogClose>
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Submitting…' : 'Submit report'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
