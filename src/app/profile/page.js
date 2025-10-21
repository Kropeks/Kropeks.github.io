'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  Activity,
  AlertTriangle,
  Bookmark,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Crown,
  Heart,
  Loader2,
  MapPin,
  Pencil,
  RefreshCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Utensils,
} from 'lucide-react';

import ProfileTabs from '../users/[id]/ProfileTabs';
import ExternalPostFeed from '../users/[id]/ExternalPostFeed';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { useFavorites } from '@/context/FavoritesContext';
import { isAuthDisabled, useMockableSession } from '@/lib/auth-utils';
import { useProfileSettings } from '@/context/ProfileSettingsContext';

const managementActions = [
  {
    key: 'edit-profile',
    title: 'Edit profile',
    description: 'Update your display name, avatar, and bio.',
    icon: Pencil,
  },
  {
    key: 'account-security',
    title: 'Account security',
    description: 'Manage password, two-factor authentication, and devices.',
    icon: ShieldCheck,
  },
  {
    key: 'preferences',
    title: 'Preferences',
    description: 'Control notifications, dietary preferences, and privacy.',
    icon: Settings,
  },
  {
    key: 'subscription',
    title: 'Subscription & billing',
    description: 'View your plan, manage renewal, or request a refund.',
    icon: Crown,
  },
];

function formatActivityDate(dateString) {
  if (!dateString) return 'Recently';
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return 'Recently';
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getCommunityPostPreview(content) {
  if (!content) {
    return 'Shared an update';
  }

  const firstMeaningfulLine = content
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstMeaningfulLine || content.slice(0, 120);
}

function EditProfileForm({ initialUser, initialProfile, onSubmit, onClose, saving }) {
  const [formState, setFormState] = useState({
    displayName: initialProfile?.displayName ?? initialUser?.name ?? '',
    email: initialUser?.email ?? '',
    bio: initialProfile?.bio ?? '',
    location: initialProfile?.location ?? '',
  });
  const [avatarUrl, setAvatarUrl] = useState(initialUser?.image ?? '');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState(null);
  const fileInputRef = useRef(null);

  const placeholderInitials = useMemo(() => {
    const source = (formState.displayName || initialUser?.name || 'SavoryFlavors Member').trim();
    if (!source) return 'SF';
    return (
      source
        .split(' ')
        .map((part) => part.charAt(0).toUpperCase())
        .slice(0, 2)
        .join('') || 'SF'
    );
  }, [formState.displayName, initialUser?.name]);

  useEffect(() => {
    setFormState({
      displayName: initialProfile?.displayName ?? initialUser?.name ?? '',
      email: initialUser?.email ?? '',
      bio: initialProfile?.bio ?? '',
      location: initialProfile?.location ?? '',
    });
    setAvatarUrl(initialUser?.image ?? '');
    setAvatarError(null);
  }, [initialUser, initialProfile]);

  const handleAvatarUpload = async (event) => {
    const inputElement = event.target;
    const file = inputElement.files?.[0];
    if (!file) return;

    setAvatarError(null);

    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Profile images must be 5MB or smaller.');
      inputElement.value = '';
      return;
    }

    setAvatarUploading(true);

    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const response = await fetch('/api/profile/avatar', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Failed to upload avatar');
      }

      const data = await response.json();
      if (!data?.url) {
        throw new Error('Invalid response from avatar upload');
      }

      setAvatarUrl(data.url);
    } catch (error) {
      console.error('Failed to upload avatar:', error);
      setAvatarError('Unable to upload avatar. Please try again with a different image.');
    } finally {
      setAvatarUploading(false);
      inputElement.value = '';
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarUrl('');
    setAvatarError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleChange = (field) => (event) => {
    const value = event.target.value;
    setFormState((previous) => ({ ...previous, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const result = await onSubmit?.({
      user: {
        name: formState.displayName,
        email: formState.email,
        image: avatarUrl || null,
      },
      profile: {
        displayName: formState.displayName,
        bio: formState.bio,
        location: formState.location,
      },
    });

    if (result?.success) {
      onClose?.();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-2xl border border-olive-100/80 bg-olive-50/40 p-4 dark:border-gray-800 dark:bg-gray-900/40">
        <p className="text-sm font-semibold text-olive-900 dark:text-gray-100">Profile photo</p>
        <p className="mt-1 text-sm text-olive-600 dark:text-gray-400">
          Upload an image to personalize your profile. Accepted formats: JPG, PNG, or WebP up to 5MB.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="relative h-20 w-20 overflow-hidden rounded-full border-4 border-white/60 bg-white/30 text-2xl font-semibold text-olive-700 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-200">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt="Profile avatar preview"
                className="h-full w-full rounded-full object-cover opacity-100 transition-opacity"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">{placeholderInitials}</div>
            )}
            {avatarUploading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-xs font-semibold uppercase tracking-wide text-olive-700 dark:bg-gray-900/70 dark:text-gray-200">
                Uploading…
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center justify-center rounded-lg border border-olive-300 px-3 py-1.5 font-medium text-olive-600 transition hover:bg-olive-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                disabled={saving || avatarUploading}
              >
                {avatarUrl ? 'Replace photo' : 'Upload photo'}
              </button>
              {avatarUrl ? (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  className="inline-flex items-center justify-center rounded-lg border border-rose-200 px-3 py-1.5 font-medium text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/60 dark:text-rose-200 dark:hover:bg-rose-900/30"
                  disabled={saving || avatarUploading}
                >
                  Remove
                </button>
              ) : null}
            </div>
            <p className="text-xs text-olive-500 dark:text-gray-400">Recommended size: 320×320px</p>
            {avatarError ? <p className="text-xs text-rose-600 dark:text-rose-300">{avatarError}</p> : null}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={handleAvatarUpload}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-olive-600 dark:text-gray-300">
          Display name
          <input
            value={formState.displayName}
            onChange={handleChange('displayName')}
            className="rounded-lg border border-olive-200 bg-white px-3 py-2 text-sm text-olive-900 shadow-sm focus:border-olive-400 focus:outline-none focus:ring-2 focus:ring-olive-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            placeholder="SavoryFlavors Member"
            disabled={saving}
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-olive-600 dark:text-gray-300">
          Email address
          <input
            value={formState.email}
            onChange={handleChange('email')}
            type="email"
            className="rounded-lg border border-olive-200 bg-white px-3 py-2 text-sm text-olive-900 shadow-sm focus:border-olive-400 focus:outline-none focus:ring-2 focus:ring-olive-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            placeholder="you@example.com"
            disabled={saving}
          />
        </label>
      </div>
      <label className="flex flex-col gap-2 text-sm text-olive-600 dark:text-gray-300">
        Bio
        <textarea
          value={formState.bio}
          onChange={handleChange('bio')}
          rows={4}
          className="rounded-lg border border-olive-200 bg-white px-3 py-2 text-sm text-olive-900 shadow-sm focus:border-olive-400 focus:outline-none focus:ring-2 focus:ring-olive-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          placeholder="Share a little about your culinary story."
          disabled={saving}
        />
      </label>
      <label className="flex flex-col gap-2 text-sm text-olive-600 dark:text-gray-300">
        Location
        <input
          value={formState.location}
          onChange={handleChange('location')}
          className="rounded-lg border border-olive-200 bg-white px-3 py-2 text-sm text-olive-900 shadow-sm focus:border-olive-400 focus:outline-none focus:ring-2 focus:ring-olive-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          placeholder="City, Country"
          disabled={saving}
        />
      </label>
      <DialogFooter className="gap-2 sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center rounded-lg border border-olive-300 px-4 py-2 text-sm font-medium text-olive-600 transition hover:bg-olive-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          disabled={saving || avatarUploading}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || avatarUploading}
          className="inline-flex items-center justify-center rounded-lg bg-olive-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-olive-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saving || avatarUploading ? 'Saving…' : 'Save changes'}
        </button>
      </DialogFooter>
    </form>
  );
}

function AccountSecurityPanel({ initialSecurity, onSubmit, onClose, saving }) {
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(Boolean(initialSecurity?.twoFactorEnabled));
  const [backupEmail, setBackupEmail] = useState(initialSecurity?.backupEmail ?? '');
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [formError, setFormError] = useState('');

  const hasExistingPassword = Boolean(initialSecurity?.hasPassword);

  const resetPasswordFields = useCallback(() => {
    setShowPasswordForm(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
  }, []);

  const handleClose = useCallback(() => {
    resetPasswordFields();
    setFormError('');
    onClose?.();
  }, [onClose, resetPasswordFields]);

  useEffect(() => {
    setTwoFactorEnabled(Boolean(initialSecurity?.twoFactorEnabled));
    setBackupEmail(initialSecurity?.backupEmail ?? '');
    resetPasswordFields();
    setFormError('');
  }, [initialSecurity, resetPasswordFields]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setPasswordError('');
    setFormError('');

    const securityPayload = {
      twoFactorEnabled,
      backupEmail,
    };

    const passwordFieldsTouched =
      showPasswordForm || currentPassword || newPassword || confirmPassword;

    if (passwordFieldsTouched) {
      const trimmedNewPassword = newPassword.trim();
      const trimmedConfirmPassword = confirmPassword.trim();

      if (!trimmedNewPassword) {
        setPasswordError('Please enter a new password.');
        return;
      }

      if (trimmedNewPassword.length < 8) {
        setPasswordError('New password must be at least 8 characters.');
        return;
      }

      if (trimmedNewPassword !== trimmedConfirmPassword) {
        setPasswordError('Password confirmation does not match.');
        return;
      }

      if (hasExistingPassword && !currentPassword) {
        setPasswordError('Enter your current password to confirm this change.');
        return;
      }

      securityPayload.passwordChange = {
        currentPassword,
        newPassword: trimmedNewPassword,
        confirmPassword: trimmedConfirmPassword,
      };
    }

    try {
      const result = await onSubmit?.({
        security: securityPayload,
      });

      if (result?.success) {
        resetPasswordFields();
        setFormError('');
        onClose?.();
        return;
      }

      const errorMessage =
        typeof result?.error === 'string'
          ? result.error
          : result?.error?.message || 'Unable to save security settings. Please try again.';
      setFormError(errorMessage);
    } catch (error) {
      const message = error?.message || 'Unable to save security settings. Please try again.';
      setFormError(message);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-2xl border border-olive-100 bg-olive-50/60 p-4 dark:border-gray-700 dark:bg-gray-800/70">
        <h4 className="text-sm font-semibold text-olive-900 dark:text-gray-100">Two-factor authentication</h4>
        <p className="mt-1 text-sm text-olive-600 dark:text-gray-400">
          Add an extra layer of protection with verification codes from your authenticator app.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-olive-600 shadow-sm dark:bg-gray-900 dark:text-gray-200">
            {twoFactorEnabled ? 'Enabled' : 'Disabled'}
          </span>
          <button
            type="button"
            onClick={() => setTwoFactorEnabled((previous) => !previous)}
            className="inline-flex items-center justify-center rounded-lg border border-olive-300 px-3 py-1.5 text-xs font-medium text-olive-700 transition hover:bg-olive-100 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-800"
            disabled={saving}
          >
            {twoFactorEnabled ? 'Disable' : 'Enable'} 2FA
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-olive-100 p-4 dark:border-gray-700">
        <h4 className="text-sm font-semibold text-olive-900 dark:text-gray-100">Backup email</h4>
        <p className="mt-1 text-sm text-olive-600 dark:text-gray-400">
          Receive emergency recovery codes if you lose access to your authenticator.
        </p>
        <input
          value={backupEmail}
          onChange={(event) => setBackupEmail(event.target.value)}
          type="email"
          placeholder="backup@example.com"
          className="mt-3 w-full rounded-lg border border-olive-200 bg-white px-3 py-2 text-sm text-olive-900 shadow-sm focus:border-olive-400 focus:outline-none focus:ring-2 focus:ring-olive-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          disabled={saving}
        />
      </div>

      <div className="space-y-3 rounded-2xl border border-olive-100 p-4 dark:border-gray-700">
        <div>
          <h4 className="text-sm font-semibold text-olive-900 dark:text-gray-100">Password</h4>
          <p className="mt-1 text-sm text-olive-600 dark:text-gray-400">
            {hasExistingPassword
              ? 'Update your password to keep your account secure.'
              : 'Set a password so you can sign in with email and password in addition to social logins.'}
          </p>
        </div>

        {passwordError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
            {passwordError}
          </div>
        ) : null}

        {showPasswordForm ? (
          <div className="space-y-3">
            {hasExistingPassword ? (
              <div className="space-y-1">
                <label className="block text-xs font-semibold uppercase tracking-wide text-olive-500 dark:text-gray-400" htmlFor="current-password">
                  Current password
                </label>
                <input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className="w-full rounded-lg border border-olive-200 bg-white px-3 py-2 text-sm text-olive-900 shadow-sm focus:border-olive-400 focus:outline-none focus:ring-2 focus:ring-olive-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                  disabled={saving}
                />
              </div>
            ) : null}

            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-olive-500 dark:text-gray-400" htmlFor="new-password">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="w-full rounded-lg border border-olive-200 bg-white px-3 py-2 text-sm text-olive-900 shadow-sm focus:border-olive-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                disabled={saving}
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-olive-500 dark:text-gray-400" htmlFor="confirm-password">
                Confirm new password
              </label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-lg border border-olive-200 bg-white px-3 py-2 text-sm text-olive-900 shadow-sm focus:border-olive-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                disabled={saving}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                  setPasswordError('');
                  setShowPasswordForm(false);
                }}
                className="inline-flex items-center justify-center rounded-lg border border-olive-300 px-3 py-1.5 text-xs font-semibold text-olive-600 transition hover:bg-olive-100 dark:border-gray-700 dark:text-olive-300 dark:hover:bg-gray-800"
              >
                Cancel update
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setShowPasswordForm(true);
              setPasswordError('');
            }}
            className="inline-flex items-center justify-center rounded-lg border border-olive-300 px-3 py-1.5 text-xs font-semibold text-olive-600 transition hover:bg-olive-100 dark:border-gray-700 dark:text-olive-300 dark:hover:bg-gray-800"
          >
            {hasExistingPassword ? 'Change password' : 'Set password'}
          </button>
        )}
      </div>

      {formError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          {formError}
        </div>
      ) : null}

      <DialogFooter className="gap-2 sm:justify-end">
        <button
          type="button"
          onClick={handleClose}
          className="inline-flex items-center justify-center rounded-lg border border-olive-300 px-4 py-2 text-sm font-medium text-olive-600 transition hover:bg-olive-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Done
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center rounded-lg bg-olive-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-olive-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saving ? 'Saving…' : 'Save security settings'}
        </button>
      </DialogFooter>
    </form>
  );
}

function PreferencesPanel({ initialPreferences, onSubmit, onClose, saving }) {
  const [notifications, setNotifications] = useState({
    newsletters: true,
    productUpdates: false,
    communityHighlights: true,
  });
  const [dietary, setDietary] = useState({
    vegan: false,
    glutenFree: false,
    keto: false,
  });
  const [mealPlanningCadence, setMealPlanningCadence] = useState('manual');

  useEffect(() => {
    setNotifications({
      newsletters: initialPreferences?.notificationPreferences?.newsletters ?? true,
      productUpdates: initialPreferences?.notificationPreferences?.productUpdates ?? false,
      communityHighlights: initialPreferences?.notificationPreferences?.communityHighlights ?? true,
    });
    setDietary({
      vegan: initialPreferences?.dietaryPreferences?.vegan ?? false,
      glutenFree: initialPreferences?.dietaryPreferences?.glutenFree ?? false,
      keto: initialPreferences?.dietaryPreferences?.keto ?? false,
    });
    setMealPlanningCadence(initialPreferences?.mealPlanningCadence ?? 'manual');
  }, [initialPreferences]);

  const toggleNotification = (key) => {
    setNotifications((previous) => ({ ...previous, [key]: !previous[key] }));
  };

  const toggleDietary = (key) => {
    setDietary((previous) => ({ ...previous, [key]: !previous[key] }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const result = await onSubmit?.({
      preferences: {
        notificationPreferences: notifications,
        dietaryPreferences: dietary,
        mealPlanningCadence,
      },
    });

    if (result?.success) {
      onClose?.();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h4 className="text-sm font-semibold text-olive-900 dark:text-gray-100">Notifications</h4>
        <p className="mt-1 text-sm text-olive-600 dark:text-gray-400">
          Choose the updates you want delivered to your inbox.
        </p>
        <div className="mt-4 space-y-3">
          {[
            ['newsletters', 'Weekly newsletters'],
            ['productUpdates', 'Product updates & tips'],
            ['communityHighlights', 'Community highlights'],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center justify-between rounded-xl border border-olive-100 bg-white px-4 py-3 text-sm text-olive-700 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={notifications[key]}
                onChange={() => toggleNotification(key)}
                className="h-4 w-4 rounded border-olive-300 text-olive-600 focus:ring-olive-500"
                disabled={saving}
              />
            </label>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-olive-900 dark:text-gray-100">Dietary preferences</h4>
        <p className="mt-1 text-sm text-olive-600 dark:text-gray-400">
          Tailor recipe suggestions to fit your lifestyle.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            ['vegan', 'Vegan'],
            ['glutenFree', 'Gluten-free'],
            ['keto', 'Ketogenic'],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center justify-between rounded-xl border border-olive-100 bg-white px-4 py-3 text-sm text-olive-700 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={dietary[key]}
                onChange={() => toggleDietary(key)}
                className="h-4 w-4 rounded border-olive-300 text-olive-600 focus:ring-olive-500"
                disabled={saving}
              />
            </label>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-olive-900 dark:text-gray-100">Meal planning cadence</h4>
        <p className="mt-1 text-sm text-olive-600 dark:text-gray-400">
          Choose how frequently FitSavory refreshes your plans.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            ['weekly', 'Weekly refresh'],
            ['bi-weekly', 'Bi-weekly refresh'],
            ['manual', 'Manual updates'],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              onClick={() => setMealPlanningCadence(value)}
              className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                mealPlanningCadence === value
                  ? 'border-olive-400 bg-olive-50 text-olive-700 dark:border-olive-400 dark:bg-gray-800'
                  : 'border-olive-200 text-olive-700 hover:border-olive-400 hover:bg-olive-50 dark:border-gray-700 dark:text-gray-200 dark:hover:border-olive-400 dark:hover:bg-gray-800'
              }`}
              disabled={saving}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <DialogFooter className="gap-2 sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center rounded-lg border border-olive-300 px-4 py-2 text-sm font-medium text-olive-600 transition hover:bg-olive-50 dark;border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Close
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center rounded-lg bg-olive-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-olive-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saving ? 'Saving…' : 'Save preferences'}
        </button>
      </DialogFooter>
    </form>
  );
}

function SidebarAboutCard({ displayName, email, location, bio, statsSummary, isAdminUser, adminTitle }) {
  return (
    <div className="space-y-4 rounded-3xl border border-olive-100 bg-white/80 p-6 shadow-sm ring-1 ring-olive-100/80 dark:border-gray-800 dark:bg-gray-900/70 dark:ring-gray-800">
      <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.35em] text-olive-500 dark:text-emerald-300/80">
        <Sparkles className="h-4 w-4" />
        <span>Your profile</span>
      </div>
      <div className="space-y-2 text-sm text-olive-600 dark:text-gray-300">
        <p className="text-base font-semibold text-olive-900 dark:text-gray-100">{displayName}</p>
        <p className="text-sm text-olive-500 dark:text-gray-400">{email}</p>
        {location ? (
          <p className="inline-flex items-center gap-2 text-sm text-olive-600 dark:text-gray-300">
            <MapPin className="h-4 w-4 text-emerald-500" />
            {location}
          </p>
        ) : null}
        {bio ? (
          <p className="rounded-2xl bg-olive-50/60 p-3 text-sm leading-relaxed text-olive-700 dark:bg-emerald-500/10 dark:text-emerald-100">
            {bio}
          </p>
        ) : (
          <p className="rounded-2xl border border-dashed border-olive-200 p-3 text-sm text-olive-500 dark:border-gray-800 dark:text-gray-400">
            Tell the community a bit more about yourself by adding a bio.
          </p>
        )}
      </div>
      <div className="grid gap-3 rounded-2xl bg-olive-50/60 p-4 text-xs uppercase tracking-[0.3em] text-olive-500 dark:bg-gray-800/80 dark:text-gray-300">
        <div className="flex items-center justify-between">
          <span>Favorites</span>
          <strong className="text-lg text-olive-900 dark:text-gray-100">{statsSummary?.favorites ?? 0}</strong>
        </div>
        <div className="flex items-center justify-between">
          <span>Personal</span>
          <strong className="text-lg text-olive-900 dark:text-gray-100">{statsSummary?.personal ?? 0}</strong>
        </div>
        <div className="flex items-center justify-between">
          <span>Purchased</span>
          <strong className="text-lg text-olive-900 dark:text-gray-100">{statsSummary?.purchased ?? 0}</strong>
        </div>
        <div className="flex items-center justify-between">
          <span>Community</span>
          <strong className="text-lg text-olive-900 dark:text-gray-100">{statsSummary?.community ?? 0}</strong>
        </div>
        <div className="flex items-center justify-between">
          <span>Followers</span>
          <strong className="text-lg text-olive-900 dark:text-gray-100">{statsSummary?.followers ?? 0}</strong>
        </div>
        <div className="flex items-center justify-between">
          <span>Following</span>
          <strong className="text-lg text-olive-900 dark:text-gray-100">{statsSummary?.following ?? 0}</strong>
        </div>
      </div>
      {(isAdminUser || adminTitle) ? (
        <div className="rounded-2xl border border-emerald-200/60 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/30 px-3 py-1 text-xs font-semibold uppercase tracking-[0.35em] text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100">
            <ShieldCheck className="h-3 w-3" />
            {isAdminUser ? 'Admin' : 'Team' }
          </div>
          {adminTitle ? <p className="mt-2 font-semibold">{adminTitle}</p> : null}
          <p className="mt-1 text-sm">
            Thanks for helping lead the SavoryFlavors community.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function SidebarManagementCard({ actions, onSelect }) {
  return (
    <div className="space-y-4 rounded-3xl border border-olive-100 bg-white/80 p-6 shadow-sm ring-1 ring-olive-100/80 dark:border-gray-800 dark:bg-gray-900/70 dark:ring-gray-800">
      <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.35em] text-olive-500 dark:text-emerald-300/80">
        <Settings className="h-4 w-4" />
        <span>Manage</span>
      </div>
      <ul className="space-y-3 text-sm text-olive-600 dark:text-gray-300">
        {actions.map((action) => (
          <li key={action.key}>
            <button
              type="button"
              onClick={() => onSelect(action.key)}
              className="flex w-full items-center justify-between gap-4 rounded-2xl bg-olive-50/70 p-4 text-left transition hover:bg-olive-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:bg-gray-800/80 dark:hover:bg-gray-800 dark:focus:ring-offset-gray-900"
            >
              <span className="flex items-start gap-3">
                <span className="rounded-full bg-olive-200/80 p-2 text-olive-700 dark:bg-emerald-500/20 dark:text-emerald-200">
                  <action.icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block font-semibold text-olive-900 dark:text-gray-100">{action.title}</span>
                  <span className="block text-sm text-olive-600 dark:text-gray-400">{action.description}</span>
                </span>
              </span>
              <ChevronRight className="h-4 w-4 text-olive-400" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SidebarQuickActionsCard({ onEditProfile, onPreferences, onSubscription }) {
  return (
    <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-green-500 to-teal-500 p-6 text-white shadow-lg">
      <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.35em] text-white/70">
        <Sparkles className="h-4 w-4" />
        <span>Quick actions</span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-white/85">
        Keep your profile fresh and tailored. Update your details or adjust your preferences in seconds.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={onEditProfile}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/25"
        >
          <Pencil className="h-4 w-4" />
          Edit profile
        </button>
        <button
          type="button"
          onClick={onPreferences}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/25"
        >
          <Activity className="h-4 w-4" />
          Preferences
        </button>
        <button
          type="button"
          onClick={onSubscription}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/25"
        >
          <Crown className="h-4 w-4" />
          Subscription
        </button>
      </div>
    </div>
  );
}

function SubscriptionManagementPanel({
  subscription,
  loading,
  error,
  onRefresh,
  onCancel,
  cancelLoading,
  feedback,
}) {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [requestRefund, setRequestRefund] = useState(false);

  useEffect(() => {
    if (!subscription?.hasSubscription) {
      setRequestRefund(false);
      return;
    }
    setRequestRefund(Boolean(subscription.refundEligible));
  }, [subscription?.hasSubscription, subscription?.refundEligible]);

  const formattedDate = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString();
  };

  const statusBadgeClass = (() => {
    switch (subscription?.status) {
      case 'active':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
      case 'canceled':
      case 'expired':
        return 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300';
      case 'past_due':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300';
      default:
        return 'bg-olive-100 text-olive-700 dark:bg-gray-700/60 dark:text-gray-200';
    }
  })();

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-olive-900 dark:text-gray-100">Subscription & billing</h2>
          <p className="text-sm text-olive-600 dark:text-gray-400">
            Review your current plan, guarantee window, and cancel or request a refund within 14 days.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-full border border-olive-200 px-3 py-1.5 text-sm font-semibold text-olive-700 transition hover:bg-olive-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          {loading ? 'Refreshing…' : 'Refresh status'}
        </button>
      </header>

      {feedback ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
              : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200'
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      {subscription?.hasSubscription ? (
        <div className="space-y-4 rounded-3xl border border-olive-100 bg-white/90 p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900/70">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-olive-500 dark:text-gray-400">
                Current plan
              </p>
              <h3 className="text-xl font-semibold text-olive-900 dark:text-gray-100">
                {subscription.plan?.name || 'Unknown plan'}
              </h3>
              <p className="text-sm text-olive-600 dark:text-gray-400">
                {subscription.plan?.billingCycle ? `Billed ${subscription.plan.billingCycle}` : 'Billing cycle unavailable'}
              </p>
            </div>
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${statusBadgeClass}`}>
              <CheckCircle2 className="h-4 w-4" />
              {subscription.status || 'unknown'}
            </span>
          </div>

          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-olive-100 bg-olive-50/40 p-4 text-sm text-olive-700 dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-200">
              <dt className="flex items-center gap-2 font-semibold text-olive-900 dark:text-gray-100">
                <Calendar className="h-4 w-4" /> Current period
              </dt>
              <dd className="mt-1 space-y-1 text-sm">
                <p>Start: {formattedDate(subscription.currentPeriodStart)}</p>
                <p>End: {formattedDate(subscription.currentPeriodEnd)}</p>
              </dd>
            </div>
            <div className="rounded-2xl border border-olive-100 bg-olive-50/40 p-4 text-sm text-olive-700 dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-200">
              <dt className="flex items-center gap-2 font-semibold text-olive-900 dark:text-gray-100">
                <Sparkles className="h-4 w-4" /> 14-day guarantee
              </dt>
              <dd className="mt-1 space-y-1 text-sm">
                <p>Eligible until: {formattedDate(subscription.guaranteeExpiresAt)}</p>
                <p>
                  Status:{' '}
                  {subscription.refundEligible ? (
                    <span className="font-semibold text-emerald-600 dark:text-emerald-300">Within guarantee window</span>
                  ) : (
                    <span className="text-olive-500 dark:text-gray-400">Guarantee expired</span>
                  )}
                </p>
              </dd>
            </div>
          </dl>

          {subscription.refundStatus ? (
            <div className="rounded-2xl border border-olive-100 bg-white/70 p-4 text-sm text-olive-600 shadow-sm dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-300">
              <p className="font-semibold text-olive-800 dark:text-gray-100">Refund status: {subscription.refundStatus}</p>
              {subscription.refundAmount ? (
                <p className="mt-1">
                  Amount: {subscription.refundCurrency || 'PHP'} {Number(subscription.refundAmount).toFixed(2)}
                </p>
              ) : null}
              {subscription.cancelReason ? (
                <p className="mt-1">Cancellation reason: {subscription.cancelReason}</p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-4">
            <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-200">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5" />
                <div>
                  <p className="font-semibold">Ready to cancel?</p>
                  <p className="mt-1">
                    Cancelling immediately ends premium access. Within 14 days, refunds are automatically queued.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm text-olive-600 dark:text-gray-300">
                Cancellation reason (optional)
                <select
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="rounded-lg border border-olive-200 bg-white px-3 py-2 text-sm text-olive-900 shadow-sm focus:border-olive-400 focus:outline-none focus:ring-2 focus:ring-olive-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                >
                  <option value="">Select a reason</option>
                  <option value="not_using">I no longer use the service</option>
                  <option value="too_expensive">It’s too expensive</option>
                  <option value="missing_features">Missing features I need</option>
                  <option value="temporary">Taking a break</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label className="flex items-center gap-3 rounded-lg border border-olive-200 bg-white px-3 py-3 text-sm font-medium text-olive-700 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-olive-300 text-emerald-600 focus:ring-emerald-500"
                  checked={requestRefund}
                  disabled={!subscription.refundEligible}
                  onChange={(event) => setRequestRefund(event.target.checked)}
                />
                Request refund under 14-day guarantee
              </label>
            </div>

            <label className="flex flex-col gap-2 text-sm text-olive-600 dark:text-gray-300">
              Additional notes (optional)
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={4}
                className="rounded-lg border border-olive-200 bg-white px-3 py-2 text-sm text-olive-900 shadow-sm focus:border-olive-400 focus:outline-none focus:ring-2 focus:ring-olive-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                placeholder="Share more details to help our team improve."
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onCancel({ reason, notes, refundRequested: requestRefund })}
                disabled={cancelLoading}
                className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {cancelLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {cancelLoading ? 'Cancelling…' : 'Cancel subscription'}
              </button>
              <p className="text-xs text-olive-500 dark:text-gray-400">
                Cancelling immediately revokes premium access. You can resubscribe any time.
              </p>
            </div>
          </div>
        </div>
      ) : loading ? (
        <div className="flex min-h-[200px] items-center justify-center rounded-3xl border border-olive-100 bg-white/90 dark:border-gray-800 dark:bg-gray-900/70">
          <Loader2 className="h-8 w-8 animate-spin text-olive-500" />
        </div>
      ) : (
        <div className="rounded-3xl border border-olive-100 bg-white/90 p-6 text-sm text-olive-600 shadow-sm dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-300">
          <p className="font-semibold text-olive-800 dark:text-gray-100">No active subscription</p>
          <p className="mt-1">Purchase a premium plan to unlock exclusive recipes and content.</p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.35em] text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200">
            <Crown className="h-4 w-4" /> Premium trial includes 14-day guarantee
          </div>
        </div>
      )}
    </section>
  );
}

function ProfileHeader({
  session,
  profileSettings,
  profileSettingsLoading,
  forceRefreshProfileSettings,
  lastFetchedAt,
  isForceRefreshing,
}) {
  const [subscription, setSubscription] = useState(null);
  const [loadingSubscription, setLoadingSubscription] = useState(true);

  const resolvedNameFromProfile = profileSettings?.profile?.displayName?.trim();
  const resolvedNameFromSession = session?.user?.name?.trim();
  const userName = resolvedNameFromProfile?.length
    ? resolvedNameFromProfile
    : resolvedNameFromSession?.length
      ? resolvedNameFromSession
      : 'SavoryFlavors Member';

  const isAdmin = (session?.user?.role ?? '').toLowerCase() === 'admin';
  const profileLabel = isAdmin ? 'Admin profile' : 'Member profile';

  const avatarImage = profileSettings?.user?.image ?? session?.user?.image ?? null;
  const initialsSource = userName;
  const initials = initialsSource
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');

  const userEmail = profileSettings?.user?.email ?? session?.user?.email ?? 'No email on file';
  const userLocation = profileSettings?.profile?.location?.trim();
  const userBio = profileSettings?.profile?.bio?.trim();

  const showSkeleton = profileSettingsLoading && !profileSettings;

  const billingCycle = subscription?.plan?.billingCycle?.toLowerCase() || '';
  const planName = subscription?.plan?.name?.toLowerCase() || '';
  const isYearlySubscription =
    Boolean(subscription) &&
    (billingCycle === 'yearly' ||
      billingCycle === 'year' ||
      billingCycle === 'annual' ||
      planName.includes('year'));

  const premiumBadge = isYearlySubscription
    ? {
        text: 'Royal Annual',
        className:
          'inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-yellow-300 via-amber-500 to-orange-600 px-3 py-1 text-[11px] font-semibold text-white shadow-sm ring-1 ring-amber-200/60',
        iconClass: 'h-3 w-3 text-white'
      }
    : {
        text: 'Premium',
        className:
          'inline-flex items-center gap-1 rounded-full bg-amber-400/90 px-3 py-1 text-[11px] font-semibold text-amber-900 shadow-sm',
        iconClass: 'h-3 w-3 text-amber-900'
      };

  useEffect(() => {
    const checkSubscription = async () => {
      try {
        const response = await fetch('/api/user/subscription');
        const data = await response.json();
        if (response.ok) {
          setSubscription(data.status === 'active' ? data : null);
        }
      } catch (error) {
        console.error('Error checking subscription:', error);
      } finally {
        setLoadingSubscription(false);
      }
    };

    if (session) {
      checkSubscription();
    }
  }, [session]);

  const lastUpdatedLabel = lastFetchedAt
    ? new Date(lastFetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <section className="relative overflow-hidden rounded-[36px] bg-gradient-to-br from-emerald-500 via-green-500 to-teal-500 text-white shadow-xl">
      <div className="absolute inset-0 opacity-[0.18]">
        <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
          <defs>
            <pattern id="profile-grid-pattern" width="120" height="120" patternUnits="userSpaceOnUse">
              <path d="M 0 0 L 120 0 120 120" fill="none" stroke="currentColor" strokeWidth="1" />
            </pattern>
            <linearGradient id="profile-grid-fade" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.45)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.05)" />
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#profile-grid-pattern)" />
          <rect width="100%" height="100%" fill="url(#profile-grid-fade)" />
        </svg>
      </div>

      <div className="relative flex flex-col items-start gap-6 px-8 py-10 sm:px-12 sm:py-12 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex w-full max-w-2xl items-center gap-7">
          <div className="relative h-24 w-24 shrink-0 rounded-full border-4 border-white/40 bg-white/15 shadow-lg backdrop-blur-sm sm:h-28 sm:w-28">
            {avatarImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarImage}
                alt={userName}
                className="h-full w-full rounded-full object-cover opacity-100 transition-opacity"
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                  event.currentTarget.nextElementSibling.style.display = 'flex';
                }}
              />
            ) : null}
            <div className={`absolute inset-0 ${avatarImage ? 'hidden' : 'flex'} items-center justify-center rounded-full bg-white/20 text-3xl font-semibold`}>
              {initials || 'SF'}
            </div>
          </div>

          <div className="flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.35em] text-white/70">
              <span>{profileLabel}</span>
              {isAdmin ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-300/90 px-3 py-1 text-[11px] font-semibold text-violet-900 shadow-sm">
                  <ShieldCheck className="h-3 w-3" />
                  Admin
                </span>
              ) : null}
              {!loadingSubscription && subscription ? (
                <span className={premiumBadge.className}>
                  <Sparkles className={premiumBadge.iconClass} />
                  {premiumBadge.text}
                </span>
              ) : null}
            </div>

            {showSkeleton ? (
              <div className="space-y-3">
                <div className="h-8 w-48 animate-pulse rounded-full bg-white/30" />
                <div className="h-3 w-64 animate-pulse rounded-full bg-white/25" />
              </div>
            ) : (
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold sm:text-4xl">{userName}</h1>
                <p className="text-sm text-white/80">{userEmail}</p>
                {userLocation ? (
                  <p className="flex items-center gap-2 text-sm text-white/80">
                    <MapPin className="h-4 w-4" />
                    {userLocation}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {!showSkeleton && userBio ? (
          <div className="max-w-md rounded-3xl bg-white/10 p-5 text-sm leading-relaxed text-white/85 shadow-inner backdrop-blur-sm">
            {userBio}
          </div>
        ) : null}

        {!showSkeleton ? (
          <div className="absolute left-4 top-4 flex items-center gap-2 text-xs text-white/80 sm:left-auto sm:right-6 sm:top-6 sm:gap-3">
            {lastUpdatedLabel ? (
              <span className="hidden sm:inline">Last updated {lastUpdatedLabel}</span>
            ) : null}
            <button
              type="button"
              onClick={forceRefreshProfileSettings}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-white/15 text-white shadow-sm backdrop-blur-sm transition hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-60 sm:h-auto sm:w-auto sm:gap-2 sm:px-3 sm:py-1.5"
              disabled={isForceRefreshing}
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              <span className="sr-only sm:not-sr-only">
                {isForceRefreshing ? 'Refreshing…' : 'Refresh profile data'}
              </span>
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default function ProfilePage() {
  const { data: session, status } = useMockableSession(useSession);
  const router = useRouter();
  const { favorites = [], removeFromFavorites, loading: favoritesLoading } = useFavorites();
  const [mounted, setMounted] = useState(false);
  const [personalRecipes, setPersonalRecipes] = useState([]);
  const [loadingPersonalRecipes, setLoadingPersonalRecipes] = useState(false);
  const [purchasedRecipes, setPurchasedRecipes] = useState([]);
  const [loadingPurchasedRecipes, setLoadingPurchasedRecipes] = useState(false);
  const [showAllPurchased, setShowAllPurchased] = useState(false);
  const [communityPosts, setCommunityPosts] = useState([]);
  const [loadingCommunityPosts, setLoadingCommunityPosts] = useState(false);
  const [activeManagementAction, setActiveManagementAction] = useState(null);
  const [subscriptionDetails, setSubscriptionDetails] = useState(null);
  const [subscriptionDetailsLoading, setSubscriptionDetailsLoading] = useState(false);
  const [subscriptionDetailsError, setSubscriptionDetailsError] = useState(null);
  const [cancelSubscriptionLoading, setCancelSubscriptionLoading] = useState(false);
  const [cancelSubscriptionFeedback, setCancelSubscriptionFeedback] = useState(null);
  const {
    profileSettings,
    profileSettingsLoading,
    profileSettingsError,
    setProfileSettings,
    setProfileSettingsError,
    refreshProfileSettings,
    forceRefreshProfileSettings,
    lastFetchedAt,
    isForceRefreshing,
  } = useProfileSettings();
  const [profileMutationLoading, setProfileMutationLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!session?.user) {
      setPersonalRecipes([]);
      setPurchasedRecipes([]);
      setShowAllPurchased(false);
      setCommunityPosts([]);
      setLoadingCommunityPosts(false);
      return;
    }

    const loadRecipes = async () => {
      setLoadingPersonalRecipes(true);
      setLoadingPurchasedRecipes(true);

      try {
        const response = await fetch('/api/recipes?mine=true');
        if (!response.ok) {
          console.warn('Failed to load personal recipes from API', await response.text());
          setPersonalRecipes([]);
        } else {
          const data = await response.json();
          const recipes = Array.isArray(data.recipes) ? data.recipes : [];
          setPersonalRecipes(recipes);
        }
      } catch (error) {
        console.error('Failed to load personal recipes from API', error);
        setPersonalRecipes([]);
      } finally {
        setLoadingPersonalRecipes(false);
      }

      try {
        const response = await fetch('/api/recipes?purchased=true');
        if (!response.ok) {
          console.warn('Failed to load purchased recipes from API', await response.text());
          setPurchasedRecipes([]);
        } else {
          const data = await response.json();
          const recipes = Array.isArray(data.recipes) ? data.recipes : [];
          setPurchasedRecipes(recipes);
          setShowAllPurchased((previous) => (recipes.length <= 4 ? false : previous));
        }
      } catch (error) {
        console.error('Failed to load purchased recipes from API', error);
        setPurchasedRecipes([]);
      } finally {
        setLoadingPurchasedRecipes(false);
      }
    };

    loadRecipes();
  }, [mounted, session]);

  useEffect(() => {
    if (!mounted) return;
    if (!session?.user) {
      setCommunityPosts([]);
      setLoadingCommunityPosts(false);
      return;
    }

    const controller = new AbortController();

    const loadCommunityPosts = async () => {
      setLoadingCommunityPosts(true);

      try {
        const response = await fetch('/api/community/posts?mine=true&limit=6', { signal: controller.signal });
        if (!response.ok) {
          console.warn('Failed to load community posts from API', await response.text());
          setCommunityPosts([]);
          return;
        }

        const data = await response.json();
        const posts = Array.isArray(data.posts) ? data.posts : [];
        setCommunityPosts(posts);
      } catch (error) {
        if (error.name === 'AbortError') {
          return;
        }
        console.error('Failed to load community posts from API', error);
        setCommunityPosts([]);
      } finally {
        if (!controller.signal.aborted) {
          setLoadingCommunityPosts(false);
        }
      }
    };

    loadCommunityPosts();

    return () => {
      controller.abort();
    };
  }, [mounted, session]);

  useEffect(() => {
    if (!mounted) return;
    if (!isAuthDisabled && status === 'unauthenticated') {
      router.push('/auth/login?callbackUrl=/profile');
    }
  }, [mounted, router, status]);

  const activities = useMemo(() => {
    const items = [];

    favorites.slice(0, 4).forEach((recipe) => {
      items.push({
        id: `favorite-${recipe.id}`,
        title: 'Saved to favorites',
        description: recipe.title ?? 'Untitled recipe',
        time: formatActivityDate(recipe.dateAdded),
      });
    });

    personalRecipes.slice(0, 4).forEach((recipe) => {
      items.push({
        id: `personal-${recipe.id}`,
        title: 'Created a new recipe',
        description: recipe.title ?? 'Untitled recipe',
        time: formatActivityDate(recipe.createdAt),
      });
    });

    purchasedRecipes.slice(0, 4).forEach((recipe) => {
      items.push({
        id: `purchased-${recipe.purchaseId || recipe.id}`,
        title: 'Purchased a premium recipe',
        description: recipe.title ?? 'Untitled recipe',
        time: formatActivityDate(recipe.purchasedAt || recipe.createdAt),
      });
    });

    if (!items.length) {
      return [
        {
          id: 'empty-activity',
          title: 'No recent activity yet',
          description: 'Start saving recipes or add your own creations to see them here.',
          time: '—',
          isEmpty: true,
        },
      ];
    }

    return items.slice(0, 6);
  }, [favorites, personalRecipes]);

  const stats = useMemo(
    () => [
      {
        key: 'favorites',
        label: 'Favorite recipes',
        value: favorites.length,
        description: 'Recipes you loved the most',
        icon: Heart,
        accent: 'bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300',
      },
      {
        key: 'personal',
        label: 'Personal recipes',
        value: personalRecipes.length,
        description: 'Creations stored on this device',
        icon: Utensils,
        accent: 'bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
      },
      {
        key: 'purchased',
        label: 'Purchased recipes',
        value: purchasedRecipes.length,
        description: 'Premium recipes you now own',
        icon: Crown,
        accent: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
      },
      {
        key: 'community',
        label: 'Community posts',
        value: communityPosts.length,
        description: 'Shared with fellow food lovers',
        icon: Activity,
        accent: 'bg-sky-100 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300',
      },
    ],
    [favorites.length, personalRecipes.length, purchasedRecipes.length, communityPosts.length],
  );

  const visiblePurchasedRecipes = useMemo(
    () => (showAllPurchased ? purchasedRecipes : purchasedRecipes.slice(0, 4)),
    [purchasedRecipes, showAllPurchased],
  );

  const fetchProfileSettings = useCallback(async () => {
    if (!session?.user) return;

    try {
      await refreshProfileSettings();
    } catch (error) {
      console.error('Failed to fetch profile settings:', error);
      // Error message is managed by the context; no additional action here.
    }
  }, [refreshProfileSettings, session?.user]);

  useEffect(() => {
    if (!mounted || !session?.user) return;
    fetchProfileSettings();
  }, [mounted, session?.user, fetchProfileSettings]);

  const handleProfileMutation = useCallback(
    async (updates) => {
      setProfileMutationLoading(true);
      setProfileSettingsError(null);

      try {
        const response = await fetch('/api/profile', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updates),
        });

        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || 'Failed to update profile settings');
        }

        const data = await response.json();
        setProfileSettings(data);
        return { success: true };
      } catch (error) {
        console.error('Failed to mutate profile settings:', error);
        setProfileSettingsError('Unable to save changes. Please try again.');
        return { success: false, error };
      } finally {
        setProfileMutationLoading(false);
      }
    },
    [setProfileSettings, setProfileSettingsError],
  );

  const handleOpenManagementAction = (actionKey) => {
    if (!profileSettings && !profileSettingsLoading && session?.user) {
      fetchProfileSettings();
    }
    const matchedAction = managementActions.find((action) => action.key === actionKey) || null;
    setActiveManagementAction(matchedAction);
    if (actionKey === 'subscription' && session?.user) {
      fetchSubscriptionDetails();
    }
  };

  const handleCloseManagementAction = () => {
    setActiveManagementAction(null);
    setCancelSubscriptionFeedback(null);
  };

  const fetchSubscriptionDetails = useCallback(async () => {
    if (!session?.user) {
      setSubscriptionDetails(null);
      return;
    }

    setSubscriptionDetailsLoading(true);
    setSubscriptionDetailsError(null);

    try {
      const response = await fetch('/api/user/subscription', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || 'Unable to load subscription details');
      }

      setSubscriptionDetails(data);
    } catch (error) {
      console.error('Failed to load subscription details:', error);
      setSubscriptionDetailsError(error.message || 'Unable to load subscription details');
    } finally {
      setSubscriptionDetailsLoading(false);
    }
  }, [session?.user]);

  useEffect(() => {
    if (!session?.user) {
      setSubscriptionDetails(null);
      setSubscriptionDetailsError(null);
      return;
    }
    fetchSubscriptionDetails();
  }, [session?.user, fetchSubscriptionDetails]);

  const handleCancelSubscription = useCallback(
    async ({ reason, notes, refundRequested }) => {
      if (cancelSubscriptionLoading) return;
      if (!subscriptionDetails?.hasSubscription) {
        setCancelSubscriptionFeedback({ type: 'error', message: 'No active subscription to cancel.' });
        return;
      }

      const confirmation = window.confirm(
        'Cancelling will immediately end your premium access. Continue?' +
          (subscriptionDetails?.refundEligible ? '\nA refund request will be submitted automatically.' : '')
      );

      if (!confirmation) {
        return;
      }

      setCancelSubscriptionLoading(true);
      setCancelSubscriptionFeedback(null);

      try {
        const response = await fetch('/api/user/subscription', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reason,
            notes,
            refundRequested,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.message || 'Failed to cancel subscription');
        }

        setCancelSubscriptionFeedback({ type: 'success', message: data?.message || 'Subscription cancelled' });
        await fetchSubscriptionDetails();
        await fetchProfileSettings();
      } catch (error) {
        console.error('Failed to cancel subscription:', error);
        setCancelSubscriptionFeedback({ type: 'error', message: error.message || 'Failed to cancel subscription' });
      } finally {
        setCancelSubscriptionLoading(false);
      }
    },
    [cancelSubscriptionLoading, subscriptionDetails?.hasSubscription, subscriptionDetails?.refundEligible, fetchSubscriptionDetails, fetchProfileSettings]
  );

  const profileDisplayName =
    profileSettings?.profile?.displayName?.trim() ||
    session?.user?.name?.trim() ||
    'SavoryFlavors Member';
  const profileEmail = profileSettings?.user?.email ?? session?.user?.email ?? 'No email on file';
  const profileLocation = profileSettings?.profile?.location?.trim() || '';
  const profileBio = profileSettings?.profile?.bio?.trim() || '';
  const profileImage = profileSettings?.user?.image ?? session?.user?.image ?? null;
  const profileInitials = profileDisplayName
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('') || 'SF';
  const isAdminUser = (session?.user?.role ?? '').toLowerCase() === 'admin';
  const adminTitle = profileSettings?.profile?.adminTitle?.trim();

  const recipeBadgeCount = personalRecipes.length + purchasedRecipes.length;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'recipes', label: 'Recipes', badge: recipeBadgeCount },
    { id: 'favorites', label: 'Favorites', badge: favorites.length },
    { id: 'community', label: 'Community', badge: communityPosts.length },
  ];

  const overviewSection = (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-olive-900 dark:text-gray-100">At a glance</h2>
        <p className="mt-1 text-sm text-olive-600 dark:text-gray-400">
          Keep track of your culinary footprint across SavoryFlavors.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {stats.map((stat) => (
            <div
              key={stat.key}
              className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-olive-100/60 transition hover:-translate-y-0.5 hover:shadow-md dark:bg-gray-900 dark:ring-gray-800"
            >
              <div className={`mb-4 inline-flex rounded-full ${stat.accent} p-3`}>
                {<stat.icon className="h-5 w-5" />}
              </div>
              <p className="text-sm font-medium uppercase tracking-wide text-olive-500 dark:text-gray-400">
                {stat.label}
              </p>
              <p className="mt-3 text-3xl font-semibold text-olive-900 dark:text-gray-100">{stat.value}</p>
              <p className="mt-2 text-sm text-olive-600 dark:text-gray-400">{stat.description}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-olive-100/60 dark:bg-gray-900 dark:ring-gray-800">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-olive-100 px-3 py-1 text-xs font-semibold text-olive-700 dark:bg-olive-500/10 dark:text-olive-300">
                <Sparkles className="h-3 w-3" />
                FitSavory
              </div>
              <h3 className="text-2xl font-semibold text-olive-900 dark:text-gray-100">Your personalized nutrition hub</h3>
              <p className="text-sm text-olive-600 dark:text-gray-400">
                Generate adaptive meal plans, track macros, and visualize weekly progress with FitSavory. Use this shortcut to jump back into your dashboard any time.
              </p>
              <ul className="space-y-2 text-sm text-olive-600 dark:text-gray-400">
                <li className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-olive-500" />
                  Dynamic macro presets and custom targets
                </li>
                <li className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-olive-500" />
                  Day-by-day meal breakdowns and snapshots
                </li>
                <li className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-olive-500" />
                  Weekly overview charts to monitor progress
                </li>
              </ul>
            </div>

            <div className="flex flex-col gap-4 rounded-2xl bg-soft-50 p-6 shadow-inner dark:bg-gray-800/60">
              <div>
                <p className="text-sm font-medium text-olive-700 dark:text-gray-200">Current status</p>
                <p className="mt-1 text-lg font-semibold text-olive-900 dark:text-gray-100">
                  {session ? 'Signed in and ready' : 'Sign in to access FitSavory'}
                </p>
              </div>
              <div className="rounded-xl border border-dashed border-olive-200 bg-white/70 p-4 text-sm text-olive-600 dark:border-gray-700 dark:bg-gray-900/80 dark:text-gray-300">
                No active meal plan detected. Generate a new one to sync it with your profile overview.
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/fitsavory"
                  className="inline-flex items-center gap-2 rounded-lg bg-olive-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-olive-700"
                >
                  Open FitSavory dashboard
                  <ChevronRight className="h-4 w-4" />
                </Link>
                <p className="text-xs text-olive-500 dark:text-gray-400">
                  Need a plan? Adjust your targets and generate one inside FitSavory.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-olive-100/60 dark:bg-gray-900 dark:ring-gray-800">
          <h3 className="text-lg font-semibold text-olive-900 dark:text-gray-100">Recent activity</h3>
          <p className="mt-1 text-sm text-olive-600 dark:text-gray-400">
            Automatic highlights based on your favorites and personal recipes.
          </p>
          <ul className="mt-5 space-y-4">
            {activities.map((item) => (
              <li key={item.id} className="flex gap-3 rounded-xl bg-olive-50/60 p-3 dark:bg-gray-800/80">
                <div className="mt-1 shrink-0 rounded-full bg-olive-200 p-2 text-olive-700 dark:bg-olive-500/20 dark:text-olive-200">
                  <Activity className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-olive-900 dark:text-gray-100">{item.title}</p>
                  <p className="text-sm text-olive-600 dark:text-gray-400">{item.description}</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-olive-500 dark:text-gray-500">{item.time}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );

  const recipesSection = (
    <div className="space-y-10">
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-olive-900 dark:text-gray-100">Personal recipe box</h2>
            <p className="mt-1 text-sm text-olive-600 dark:text-gray-400">
              Recipes you have created in SavoryFlavors.
            </p>
          </div>
        </div>

        {personalRecipes.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-olive-200 bg-white/60 p-8 text-center dark:border-gray-800 dark:bg-gray-900/60">
            <Utensils className="mx-auto h-10 w-10 text-olive-400" />
            <p className="mt-4 text-lg font-medium text-olive-900 dark:text-gray-100">No personal recipes yet</p>
            <p className="mt-2 text-sm text-olive-600 dark:text-gray-400">
              Create a recipe to see it appear in your personal collection.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {personalRecipes.slice(0, 4).map((recipe) => (
              <article
                key={recipe.id}
                className="flex h-full flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-olive-100/60 transition hover:-translate-y-1 hover:shadow-lg dark:bg-gray-900 dark:ring-gray-800"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-olive-500 dark:text-gray-400">Personal recipe</p>
                    <h3 className="mt-2 text-lg font-semibold text-olive-900 dark:text-gray-100">
                      {recipe.title || 'Untitled recipe'}
                    </h3>
                  </div>
                  <Bookmark className="h-5 w-5 text-olive-400 dark:text-gray-500" />
                </div>

                <p className="mt-3 text-sm text-olive-600 dark:text-gray-400 line-clamp-3">
                  {recipe.description || 'No description provided yet.'}
                </p>

                <div className="mt-4 flex items-center justify-between text-sm text-olive-500 dark:text-gray-400">
                  <span>{formatActivityDate(recipe.createdAt)}</span>
                  <Link
                    href={`/recipes/${encodeURIComponent(recipe.slug || recipe.id)}?source=community`}
                    className="inline-flex items-center gap-1 rounded-full bg-olive-100 px-3 py-1 font-medium text-olive-700 transition hover:bg-olive-200 dark:bg-olive-500/10 dark:text-olive-300 dark:hover:bg-olive-500/20"
                  >
                    View
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-olive-900 dark:text-gray-100">Purchased recipe library</h2>
            <p className="mt-1 text-sm text-olive-600 dark:text-gray-400">
              Premium recipes you&apos;ve unlocked from other creators.
            </p>
          </div>
          {purchasedRecipes.length > 4 ? (
            <button
              type="button"
              onClick={() => setShowAllPurchased((previous) => !previous)}
              className="inline-flex items-center gap-1 rounded-full border border-olive-300 px-4 py-2 text-sm font-medium text-olive-700 transition hover:bg-olive-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              {showAllPurchased ? 'View less' : 'View all'}
              <ChevronRight className={`h-4 w-4 transition-transform ${showAllPurchased ? 'rotate-90' : ''}`} />
            </button>
          ) : null}
        </div>

        {purchasedRecipes.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-olive-200 bg-white/60 p-8 text-center dark:border-gray-800 dark:bg-gray-900/60">
            <Crown className="mx-auto h-10 w-10 text-olive-400" />
            <p className="mt-4 text-lg font-medium text-olive-900 dark:text-gray-100">No purchases yet</p>
            <p className="mt-2 text-sm text-olive-600 dark:text-gray-400">
              Browse the marketplace and buy premium recipes to see them here.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {visiblePurchasedRecipes.map((recipe) => (
              <article
                key={recipe.purchaseId || recipe.id}
                className="flex h-full flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-olive-100/60 transition hover:-translate-y-1 hover:shadow-lg dark:bg-gray-900 dark:ring-gray-800"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-olive-500 dark:text-gray-400">Purchased recipe</p>
                    <h3 className="mt-2 text-lg font-semibold text-olive-900 dark:text-gray-100">
                      {recipe.title || 'Untitled recipe'}
                    </h3>
                  </div>
                  <Sparkles className="h-5 w-5 text-olive-400 dark:text-gray-500" />
                </div>

                <p className="mt-3 text-sm text-olive-600 dark:text-gray-400 line-clamp-3">
                  {recipe.description || 'No description provided yet.'}
                </p>

                <div className="mt-4 flex items-center justify-between text-sm text-olive-500 dark:text-gray-400">
                  <span>{formatActivityDate(recipe.purchasedAt || recipe.createdAt)}</span>
                  <Link
                    href={`/recipes/${encodeURIComponent(recipe.slug || recipe.id)}?source=purchased`}
                    className="inline-flex items-center gap-1 rounded-full bg-olive-100 px-3 py-1 font-medium text-olive-700 transition hover:bg-olive-200 dark:bg-olive-500/10 dark:text-olive-300 dark:hover:bg-olive-500/20"
                  >
                    View
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const favoritesSection = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-olive-900 dark:text-gray-100">Saved favorites</h2>
          <p className="mt-1 text-sm text-olive-600 dark:text-gray-400">
            A quick look at recipes you loved recently.
          </p>
        </div>
        <Link
          href="/favorites"
          className="inline-flex items-center gap-1 rounded-full bg-olive-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-olive-700"
        >
          View all
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {favorites.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-olive-200 bg-white/60 p-8 text-center dark:border-gray-800 dark:bg-gray-900/60">
          <Heart className="mx-auto h-10 w-10 text-olive-400" />
          <p className="mt-4 text-lg font-medium text-olive-900 dark:text-gray-100">No favorites just yet</p>
          <p className="mt-2 text-sm text-olive-600 dark:text-gray-400">
            Explore the recipe library and tap the heart icon to save dishes for later.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {favorites.slice(0, 6).map((recipe) => (
            <article
              key={recipe.id}
              className="group flex h-full flex-col rounded-2xl bg-white shadow-sm ring-1 ring-olive-100/60 transition hover:-translate-y-1 hover:shadow-lg dark:bg-gray-900 dark:ring-gray-800"
            >
              <div className="relative h-48 overflow-hidden rounded-t-2xl bg-olive-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={recipe.image || '/placeholder-recipe.jpg'}
                  alt={recipe.title}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  onError={(event) => {
                    event.currentTarget.src = '/placeholder-recipe.jpg';
                  }}
                />
              </div>
              <div className="flex flex-1 flex-col gap-4 p-5">
                <div>
                  <h3 className="text-lg font-semibold text-olive-900 dark:text-gray-100">{recipe.title}</h3>
                  <p className="mt-2 text-sm text-olive-600 dark:text-gray-400 line-clamp-2">
                    {recipe.description || 'No description provided yet.'}
                  </p>
                </div>
                <div className="flex items-center justify-between text-sm text-olive-500 dark:text-gray-400">
                  <span>{formatActivityDate(recipe.dateAdded)}</span>
                  <button
                    type="button"
                    onClick={() => removeFromFavorites(recipe.id)}
                    className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-3 py-1 font-medium text-rose-600 transition hover:bg-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                  >
                    <Heart className="h-4 w-4" />
                    Remove
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );

  const communitySection = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-olive-900 dark:text-gray-100">Community contributions</h2>
          <p className="mt-1 text-sm text-olive-600 dark:text-gray-400">
            Join the conversation with interactive likes and comments on your latest updates.
          </p>
        </div>
        <Link
          href="/community"
          className="inline-flex items-center gap-1 rounded-full border border-olive-300 px-4 py-2 text-sm font-medium text-olive-700 transition hover:bg-olive-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          Visit community
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {loadingCommunityPosts ? (
        <div className="rounded-2xl border border-dashed border-olive-200 bg-white/60 p-8 text-center dark:border-gray-800 dark:bg-gray-900/60">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-olive-400 border-t-transparent" />
          <p className="mt-4 text-sm font-medium text-olive-900 dark:text-gray-100">Loading your community posts…</p>
        </div>
      ) : (
        <ExternalPostFeed initialPosts={communityPosts} />
      )}
    </div>
  );

  const tabSections = {
    overview: overviewSection,
    recipes: recipesSection,
    favorites: favoritesSection,
    community: communitySection,
  };

  if (!mounted || status === 'loading' || favoritesLoading || loadingPersonalRecipes || loadingPurchasedRecipes) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-olive-500 border-t-transparent" />
      </div>
    );
  }

  if (!session && !isAuthDisabled) {
    return null;
  }

  const statsSummary = {
    favorites: favorites.length,
    personal: personalRecipes.length,
    purchased: purchasedRecipes.length,
    community: communityPosts.length,
    followers: profileSettings?.profile?.followerCount ?? 0,
    following: profileSettings?.profile?.followingCount ?? 0,
  };

  return (
    <>
      <div className="min-h-screen bg-gray-50 pb-16 pt-10 dark:bg-gray-950">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 sm:px-6 lg:px-8">
          <ProfileHeader
            session={session}
            profileSettings={profileSettings}
            profileSettingsLoading={profileSettingsLoading}
            forceRefreshProfileSettings={forceRefreshProfileSettings}
            lastFetchedAt={lastFetchedAt}
            isForceRefreshing={isForceRefreshing}
          />

          {profileSettingsError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-900/20 dark:text-rose-200">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p>{profileSettingsError}</p>
                <button
                  type="button"
                  onClick={fetchProfileSettings}
                  className="inline-flex items-center gap-1 rounded-full border border-rose-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/40 dark:text-rose-200 dark:hover:bg-rose-900/30"
                >
                  Retry
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          ) : null}

          <main className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <section className="space-y-6">
              <ProfileTabs tabs={tabs} sections={tabSections} />
            </section>
            <aside className="space-y-6">
              <SidebarAboutCard
                displayName={profileDisplayName}
                email={profileEmail}
                location={profileLocation}
                bio={profileBio}
                statsSummary={statsSummary}
                isAdminUser={isAdminUser}
                adminTitle={adminTitle}
              />
              <SidebarQuickActionsCard
                onEditProfile={() => handleOpenManagementAction('edit-profile')}
                onPreferences={() => handleOpenManagementAction('preferences')}
              />
              <SidebarManagementCard actions={managementActions} onSelect={handleOpenManagementAction} />
            </aside>
          </main>
        </div>
      </div>

    <Dialog open={Boolean(activeManagementAction)} onOpenChange={(isOpen) => (!isOpen ? handleCloseManagementAction() : null)}>
      <DialogContent className="max-w-4xl overflow-hidden p-0">
        {activeManagementAction ? (
          <div className="flex h-full max-h-[75vh] flex-col overflow-hidden lg:flex-row">
            <aside className="w-full space-y-6 bg-olive-50/80 p-6 dark:bg-gray-800/80 lg:w-72 lg:flex-none lg:border-r lg:border-olive-100/60 lg:dark:border-gray-800 lg:dark:bg-gray-900/70">
              <DialogHeader className="space-y-2">
                <DialogTitle className="flex items-center gap-3 text-xl font-semibold text-olive-900 dark:text-gray-100">
                  <activeManagementAction.icon className="h-6 w-6 text-olive-600" />
                  Settings
                </DialogTitle>
                <DialogDescription className="text-sm text-olive-600 dark:text-gray-300">
                  Manage your profile, security, and experience from one place.
                </DialogDescription>
              </DialogHeader>

              <nav className="space-y-2 text-sm font-medium text-olive-600 dark:text-gray-300">
                {managementActions.map((action) => {
                  const isActive = activeManagementAction.key === action.key;
                  return (
                    <button
                      key={action.key}
                      type="button"
                      onClick={() => handleOpenManagementAction(action.key)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 transition ${
                        isActive
                          ? 'bg-white text-olive-900 shadow-sm dark:bg-gray-900 dark:text-gray-100'
                          : 'bg-transparent text-olive-600 hover:bg-white/70 dark:text-gray-300 dark:hover:bg-gray-900/40'
                      }`}
                    >
                      <action.icon className={`h-4 w-4 ${isActive ? 'text-olive-600 dark:text-olive-300' : 'text-olive-400 dark:text-gray-500'}`} />
                      <span>{action.title}</span>
                    </button>
                  );
                })}
              </nav>

              <p className="mt-8 text-xs text-olive-500 dark:text-gray-400">
                Tip: We&apos;ll bring more settings from the dashboard into this modal soon.
              </p>
            </aside>

            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              {profileSettingsLoading && !profileSettings ? (
                <div className="flex min-h-[320px] items-center justify-center">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-olive-500 border-t-transparent" />
                </div>
              ) : profileSettings ? (
                <>
                  {profileSettingsError ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-900/20 dark:text-rose-200">
                      {profileSettingsError}
                    </div>
                  ) : null}

                  {activeManagementAction.key === 'edit-profile' ? (
                    <section className="space-y-6">
                      <header className="space-y-2">
                        <h2 className="text-2xl font-semibold text-olive-900 dark:text-gray-100">Profile details</h2>
                        <p className="text-sm text-olive-600 dark:text-gray-400">
                          Update your personal information and how others see you across SavoryFlavors.
                        </p>
                      </header>

                      <EditProfileForm
                        initialUser={profileSettings.user}
                        initialProfile={profileSettings.profile}
                        onSubmit={handleProfileMutation}
                        onClose={handleCloseManagementAction}
                        saving={profileMutationLoading}
                      />
                    </section>
                  ) : null}

                  {activeManagementAction.key === 'account-security' ? (
                    <section className="space-y-6">
                      <header className="space-y-2">
                        <h2 className="text-2xl font-semibold text-olive-900 dark:text-gray-100">Account protection</h2>
                        <p className="text-sm text-olive-600 dark:text-gray-400">
                          Strengthen your login safeguards and review trusted devices.
                        </p>
                      </header>

                      <AccountSecurityPanel
                        initialSecurity={profileSettings.security}
                        onSubmit={handleProfileMutation}
                        onClose={handleCloseManagementAction}
                        saving={profileMutationLoading}
                      />
                    </section>
                  ) : null}

                  {activeManagementAction.key === 'preferences' ? (
                    <section className="space-y-6">
                      <header className="space-y-2">
                        <h2 className="text-2xl font-semibold text-olive-900 dark:text-gray-100">Personal preferences</h2>
                        <p className="text-sm text-olive-600 dark:text-gray-400">
                          Set how SavoryFlavors adapts to your taste, schedule, and notifications.
                        </p>
                      </header>

                      <PreferencesPanel
                        initialPreferences={profileSettings.preferences}
                        onSubmit={handleProfileMutation}
                        onClose={handleCloseManagementAction}
                        saving={profileMutationLoading}
                      />
                    </section>
                  ) : null}

                  {activeManagementAction.key === 'subscription' ? (
                    <SubscriptionManagementPanel
                      subscription={subscriptionDetails}
                      loading={subscriptionDetailsLoading}
                      error={subscriptionDetailsError}
                      onRefresh={fetchSubscriptionDetails}
                      onCancel={handleCancelSubscription}
                      cancelLoading={cancelSubscriptionLoading}
                      feedback={cancelSubscriptionFeedback}
                    />
                  ) : null}
                </>
              ) : profileSettingsError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-900/20 dark:text-rose-200">
                  {profileSettingsError}
                </div>
              ) : (
                <div className="flex min-h-[320px] items-center justify-center">
                  <p className="text-sm text-olive-600 dark:text-gray-300">Sign in to manage your profile settings.</p>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
    </>
  );
}
