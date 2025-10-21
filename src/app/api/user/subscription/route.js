import { auth } from '@/auth';
import { query } from '@/lib/db';
import { NextResponse } from 'next/server';
import { cancelSubscription } from '@/app/api/payment/paymongo/subscription-utils';

export async function POST(req) {
  const session = await auth();
  
  if (!session?.user?.id) {
    return NextResponse.json(
      { 
        success: false,
        message: 'Not authenticated' 
      },
      { status: 401 }
    );
  }

  try {
    const { planId, planName, price, billingCycle } = await req.json();
    
    // For free plan, we just update the user's subscription in the database
    if (planName === 'Basic') {
      // First, get the plan ID from subscription_plans
      const [plan] = await query(
        'SELECT id, billing_cycle FROM subscription_plans WHERE name = ? AND billing_cycle = ?',
        [planName, billingCycle]
      );
      
      if (!plan) {
        return NextResponse.json(
          { success: false, message: 'Subscription plan not found' },
          { status: 404 }
        );
      }
      
      // Check if user already has an active subscription
      const [existingSub] = await query(
        'SELECT id FROM subscriptions WHERE user_id = ? AND status = ?',
        [session.user.id, 'active']
      );
      
      const now = new Date();
      const normalizedCycle = (billingCycle || plan?.billing_cycle || 'monthly').toLowerCase();
      const computePeriodEnd = (startDate, cycle) => {
        const result = new Date(startDate);
        if (Number.isNaN(result.getTime())) {
          return null;
        }
        if (cycle === 'yearly') {
          result.setFullYear(result.getFullYear() + 1);
        } else {
          result.setMonth(result.getMonth() + 1);
        }
        return result;
      };

      const periodEnd = computePeriodEnd(now, normalizedCycle) || now;
      const nextBillingDate = periodEnd;

      let hasNextBillingDateColumn = false;
      try {
        const columnCheck = await query('SHOW COLUMNS FROM subscriptions LIKE ?', ['next_billing_date']);
        hasNextBillingDateColumn = columnCheck.length > 0;
      } catch (columnError) {
        console.warn('Failed to check next_billing_date column:', columnError);
      }
      
      let resultingSubscriptionId = existingSub?.id || null;

      if (existingSub) {
        // Update existing subscription
        const updateAssignments = [
          'plan_id = ?',
          'status = ?',
          'billing_cycle = ?',
          'current_period_start = ?',
          'current_period_end = ?',
        ];
        const updateValues = [plan.id, 'active', normalizedCycle, now, periodEnd];

        if (hasNextBillingDateColumn && nextBillingDate) {
          updateAssignments.push('next_billing_date = ?');
          updateValues.push(nextBillingDate);
        }

        updateAssignments.push('updated_at = NOW()');

        const updateSql = `UPDATE subscriptions 
           SET ${updateAssignments.join(', ')}
           WHERE user_id = ?`;

        updateValues.push(session.user.id);

        await query(updateSql, updateValues);
      } else {
        // Create new subscription
        const insertColumns = ['user_id', 'plan_id', 'status', 'billing_cycle', 'current_period_start', 'current_period_end'];
        const insertPlaceholders = ['?', '?', '?', '?', '?', '?'];
        const insertValues = [session.user.id, plan.id, 'active', normalizedCycle, now, periodEnd];

        if (hasNextBillingDateColumn && nextBillingDate) {
          insertColumns.push('next_billing_date');
          insertPlaceholders.push('?');
          insertValues.push(nextBillingDate);
        }

        const columnsSql = `${insertColumns.join(', ')}, created_at, updated_at`;
        const placeholdersSql = `${insertPlaceholders.join(', ')}, NOW(), NOW()`;

        const insertSql = `INSERT INTO subscriptions (${columnsSql}) VALUES (${placeholdersSql})`;

        const result = await query(insertSql, insertValues);
        resultingSubscriptionId = result?.insertId || null;
      }

      if (resultingSubscriptionId) {
        try {
          await query(
            `UPDATE users
                SET subscription_status = 'active',
                    current_subscription_id = ?,
                    updated_at = NOW()
              WHERE id = ?`,
            [resultingSubscriptionId, session.user.id]
          );
        } catch (userSyncError) {
          console.warn('Failed to sync user subscription for Basic plan:', userSyncError);
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Subscription updated successfully'
      });
    }
    // For premium plans, we'll handle this in the payment flow
    return NextResponse.json({
      success: true,
      requiresPayment: true
    });
    
  } catch (error) {
    console.error('Subscription update error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update subscription' },
      { status: 500 }
    );
  }
}

export async function GET() {
  const session = await auth();
  
  if (!session?.user?.id) {
    return NextResponse.json(
      { 
        hasSubscription: false,
        status: 'unauthenticated',
        message: 'Not authenticated' 
      },
      { status: 401 }
    );
  }

  try {
    // Get the user's active subscription
    const [subscription] = await query(
      `SELECT s.*, sp.name AS plan_name, sp.features, sp.billing_cycle AS plan_billing_cycle
         FROM subscriptions s
         JOIN subscription_plans sp ON s.plan_id = sp.id
        WHERE s.user_id = ?
        ORDER BY s.updated_at DESC
        LIMIT 1`,
      [session.user.id]
    );

    if (!subscription) {
      return NextResponse.json(
        {
          hasSubscription: false,
          status: 'inactive',
          message: 'No subscription history found',
        },
        { status: 200 }
      );
    }

    const guaranteeExpiresAt = subscription.guarantee_expires_at
      ? new Date(subscription.guarantee_expires_at)
      : null;

    return NextResponse.json(
      {
        hasSubscription: subscription.status === 'active',
        status: subscription.status,
        plan: {
          id: subscription.plan_id,
          name: subscription.plan_name,
          features: subscription.features ? JSON.parse(subscription.features) : [],
          billingCycle: subscription.billing_cycle || subscription.plan_billing_cycle || null,
        },
        currentPeriodStart: subscription.current_period_start || subscription.start_date,
        currentPeriodEnd: subscription.current_period_end || subscription.end_date,
        cancelAtPeriodEnd: subscription.cancel_at_period_end === 1,
        cancelReason: subscription.cancel_reason,
        cancelSource: subscription.cancel_source,
        canceledAt: subscription.canceled_at,
        guaranteeExpiresAt,
        refundEligible: guaranteeExpiresAt ? Date.now() <= guaranteeExpiresAt.getTime() : false,
        refundStatus: subscription.refund_status,
        refundAmount: subscription.refund_amount,
        refundCurrency: subscription.refund_currency,
      },
      { status: 200 }
    );
    
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch subscription',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function DELETE(req) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      {
        success: false,
        message: 'Not authenticated',
      },
      { status: 401 }
    );
  }

  try {
    const payload = await req.json().catch(() => ({}));
    const { reason, refundRequested, refundAmount, refundCurrency, notes } = payload || {};

    const result = await cancelSubscription({
      userId: session.user.id,
      cancelReason: reason,
      cancelSource: 'user',
      refundRequested: Boolean(refundRequested),
      refundAmount: refundAmount ? Number(refundAmount) : null,
      refundCurrency: refundCurrency || 'PHP',
      refundNotes: notes,
    });

    if (!result.cancelled) {
      return NextResponse.json(
        {
          success: false,
          message: result.reason === 'no_active_subscription'
            ? 'No active subscription to cancel'
            : 'Unable to cancel subscription',
          details: result.reason,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: result.withinGuarantee
          ? 'Subscription cancelled. Refund is being processed.'
          : 'Subscription cancelled successfully.',
        refund: result.refund,
        withinGuarantee: result.withinGuarantee,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Subscription cancellation error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to cancel subscription',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
