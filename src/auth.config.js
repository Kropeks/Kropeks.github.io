import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { getMockSession } from './lib/auth-utils';
import { queryOne } from './lib/db';

// Check if authentication is disabled
const isAuthDisabled = process.env.DISABLE_AUTH === 'true';

export const authConfig = {
  // Do not use PrismaAdapter because your Prisma schema does not include NextAuth tables
  adapter: undefined,
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (isAuthDisabled) {
          // Return mock session when auth is disabled
          return getMockSession();
        }

        if (!credentials?.email || !credentials?.password) {
          throw new Error('Please enter your email and password');
        }

        try {
          // Find user in database
          const user = await queryOne(
            'SELECT * FROM users WHERE email = ?',
            [credentials.email]
          );

          if (!user) {
            throw new Error('No account found with this email address. Please sign up first.');
          }

          if (user.account_status === 'suspended') {
            throw new Error('Your account has been suspended. Please contact support.');
          }

          // Ensure password field exists
          if (!user.password) {
            throw new Error('Please sign in using your social account or reset your password');
          }

          // Verify password
          const isValid = await bcrypt.compare(credentials.password, user.password);
          if (!isValid) {
            throw new Error('Incorrect password. Please try again.');
          }

          // Return user object without the password
          const { password, ...userWithoutPassword } = user;
          return userWithoutPassword;
        } catch (error) {
          console.error('Authentication error:', error);
          throw new Error(error.message || 'An error occurred during authentication');
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (isAuthDisabled) {
        return true;
      }

      try {
        if (!user?.email) {
          return false;
        }

        const account = await queryOne(
          'SELECT account_status FROM users WHERE email = ?',
          [user.email]
        );

        if (account?.account_status === 'suspended') {
          return false;
        }

        return true;
      } catch (error) {
        console.error('Error validating sign in:', error);
        return false;
      }
    },
    async session({ session, token }) {
      if (isAuthDisabled) {
        return session;
      }
      
      if (token) {
        if (token.account_status === 'suspended') {
          return null;
        }

        session.user.id = token.id || token.sub;
        session.user.role = token.role ? token.role.toLowerCase() : 'user';
        session.user.account_status = token.account_status || 'pending';
      }
      return session;
    },
    async jwt({ token, user }) {
      if (isAuthDisabled) {
        return token;
      }

      if (user) {
        token.id = user.id;
        token.role = user.role?.toUpperCase() || 'USER';
        const accountStatus = user.account_status || (user.is_verified ? 'active' : 'pending');
        token.account_status = accountStatus;
        if (accountStatus === 'suspended') {
          token.error = 'AccountSuspended';
        } else if (token.error === 'AccountSuspended') {
          delete token.error;
        }
      } else if (token?.sub) {
        try {
          const account = await queryOne(
            'SELECT account_status, is_verified, role FROM users WHERE id = ?',
            [token.sub]
          );

          if (account) {
            token.role = account.role?.toUpperCase() || token.role || 'USER';
            const accountStatus = account.account_status || (account.is_verified ? 'active' : 'pending');
            token.account_status = accountStatus;

            if (accountStatus === 'suspended') {
              token.error = 'AccountSuspended';
            } else if (token.error === 'AccountSuspended') {
              delete token.error;
            }
          }
        } catch (error) {
          console.error('Error refreshing account status for JWT:', error);
        }
      }

      if (!token.account_status) {
        token.account_status = 'pending';
      }
      return token;
    },
  },
  pages: {
    signIn: '/auth/login',
    signUp: '/auth/signup',
    error: '/auth/error',
  },
  session: {
    strategy: 'jwt',
  },
  debug: process.env.NODE_ENV === 'development',
  secret: process.env.NEXTAUTH_SECRET,
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
