'use client';

import React, { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  ChefHat,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  Utensils
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import Button from '@/components/ui/button';

export default function SignUpModal({ isOpen, onClose, feature }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      if (isLogin) {
        const result = await signIn('credentials', {
          email,
          password,
          redirect: false,
        });

        if (result?.error) {
          setError(result.error);
        } else if (result?.ok) {
          setSuccessMessage('Welcome back! Redirecting...');
          setTimeout(() => {
            onClose();
            router.refresh();
          }, 1000);
        }
      } else {
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name,
            email,
            password,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.message || 'Unable to create your account.');
        }

        setSuccessMessage('Account created successfully! Signing you in...');

        const loginResult = await signIn('credentials', {
          email,
          password,
          redirect: false,
        });

        if (loginResult?.error) {
          setSuccessMessage('Account created! Please sign in with your credentials.');
          setIsLogin(true);
        } else if (loginResult?.ok) {
          setTimeout(() => {
            onClose();
            router.refresh();
          }, 800);
        }
      }
    } catch (error) {
      console.error('Auth error:', error);
      setError(error?.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestContinue = () => {
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl overflow-hidden rounded-3xl border-none bg-white p-0 shadow-2xl">
        <div className="flex flex-col md:flex-row">
          <div className="w-full md:w-5/12 bg-gradient-to-br from-olive-700 via-olive-600 to-emerald-600 p-8 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                <ChefHat className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-white/70">SavoryFlavors</p>
                <h3 className="text-xl font-semibold text-white">Culinary journeys start here</h3>
              </div>
            </div>

            {feature ? (
              <div className="mt-6 rounded-2xl border border-white/20 bg-white/10 p-4 text-sm">
                <p className="text-white/80">You’re about to unlock</p>
                <p className="mt-1 text-base font-semibold text-white">{feature}</p>
              </div>
            ) : (
              <p className="mt-6 text-sm text-white/80">
                Join thousands of food lovers who save recipes, build weekly plans, and share their creations.
              </p>
            )}

            <ul className="mt-8 space-y-4 text-sm">
              {[ 
                'Save unlimited recipes and meal plans',
                'Post in the community and earn badges',
                'Unlock FitSavory insights tailored to you'
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 h-4 w-4 text-amber-200" />
                  <span className="text-white/90">{item}</span>
                </li>
              ))}
            </ul>

            <div className="mt-10 flex items-center gap-3 text-sm text-white/80">
              <ShieldCheck className="h-5 w-5" />
              <span>No spam. Cancel anytime. Your data stays private.</span>
            </div>
          </div>

          <div className="w-full md:w-7/12 p-6 sm:p-8">
            <DialogHeader className="space-y-3 text-left">
              <div className="inline-flex items-center gap-2 rounded-full bg-olive-50 px-3 py-1 text-xs font-semibold text-olive-700">
                <Sparkles className="h-3.5 w-3.5" />
                <span>{isLogin ? 'Welcome back to SavoryFlavors' : 'Create your free account'}</span>
              </div>
              <DialogTitle className="text-3xl font-bold text-gray-900">
                {isLogin ? 'Sign in to continue' : 'Start your culinary adventure'}
              </DialogTitle>
              <DialogDescription className="text-gray-600">
                {isLogin
                  ? 'Enter your credentials to access saved recipes, premium tools, and community updates.'
                  : 'Complete the form below to personalize your feed, keep favorites in sync, and get tailored recommendations.'}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              {!isLogin && (
                <div>
                  <label htmlFor="name" className="mb-2 block text-sm font-semibold text-gray-700">
                    Full name
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm shadow-sm focus:border-olive-500 focus:outline-none focus:ring-2 focus:ring-olive-100"
                    placeholder="Harriet Van Horne"
                    required={!isLogin}
                  />
                </div>
              )}

              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-semibold text-gray-700">
                  Email address
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                    <Mail className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 pl-11 text-sm shadow-sm focus:border-olive-500 focus:outline-none focus:ring-2 focus:ring-olive-100"
                    placeholder="you@example.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-semibold text-gray-700">
                  Password
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                    <Lock className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 pl-11 pr-12 text-sm shadow-sm focus:border-olive-500 focus:outline-none focus:ring-2 focus:ring-olive-100"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-400 transition hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                  <AlertCircle className="mt-0.5 h-4 w-4" />
                  <span>{error}</span>
                </div>
              )}

              {successMessage && (
                <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-600">
                  <CheckCircle className="mt-0.5 h-4 w-4" />
                  <span>{successMessage}</span>
                </div>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full gap-2 rounded-xl bg-gradient-to-r from-olive-600 via-olive-600 to-emerald-600 py-3 text-base font-semibold text-white shadow-lg shadow-olive-200 transition hover:from-olive-700 hover:via-olive-700 hover:to-emerald-700 disabled:opacity-60"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {isLogin ? 'Signing you in…' : 'Creating your account…'}
                  </>
                ) : (
                  <>
                    {isLogin ? 'Sign in to SavoryFlavors' : 'Create my account'}
                    {!isLogin && <ArrowRight className="h-4 w-4" />}
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-gray-600">
              <span className="mr-1">{isLogin ? "Don't have an account?" : 'Already have an account?'}</span>
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError('');
                  setSuccessMessage('');
                }}
                className="font-semibold text-olive-600 transition hover:text-olive-700"
              >
                {isLogin ? 'Create one' : 'Sign in'}
              </button>
            </div>

            <div className="mt-8 space-y-3">
              <button
                type="button"
                onClick={handleGuestContinue}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-3 text-sm font-medium text-gray-700 transition hover:border-olive-200 hover:bg-olive-50"
              >
                <Utensils className="h-4 w-4" />
                Continue as guest
              </button>
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-700">
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 h-4 w-4 text-amber-500" />
                  <div>
                    <p className="font-semibold">Demo experience</p>
                    <p>Explore SavoryFlavors freely. Upgrade later to unlock every premium perk.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
