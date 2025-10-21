import { query, transaction } from '@/lib/db';

function normalizeBillingCycle(cycle) {
  if (!cycle) return 'monthly';
  const value = cycle.toString().toLowerCase();
  if (value.startsWith('year')) return 'yearly';
  if (value.startsWith('month')) return 'monthly';
  return value;
}

export async function cancelSubscription({
  userId,
  cancelReason,
  cancelSource = 'user',
  refundRequested = false,
  refundAmount = null,
  refundCurrency = 'PHP',
  refundNotes = null,
}) {
  if (!userId) {
    throw new Error('cancelSubscription requires a valid userId');
  }

  const now = new Date();

  return transaction(async (connection) => {
    const [subscriptionRows] = await connection.query(
      `SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1`,
      [userId]
    );

    const currentSubscription = subscriptionRows?.[0];

    if (!currentSubscription) {
      return { cancelled: false, reason: 'no_active_subscription' };
    }

    const hasCancelReasonColumn = await hasColumnWithConnection(connection, 'subscriptions', 'cancel_reason');
    const hasCancelSourceColumn = await hasColumnWithConnection(connection, 'subscriptions', 'cancel_source');
    const hasCanceledAtColumn = await hasColumnWithConnection(connection, 'subscriptions', 'canceled_at');
    const hasCancelAtPeriodEndColumn = await hasColumnWithConnection(connection, 'subscriptions', 'cancel_at_period_end');
    const hasRefundStatusColumn = await hasColumnWithConnection(connection, 'subscriptions', 'refund_status');
    const hasRefundAmountColumn = await hasColumnWithConnection(connection, 'subscriptions', 'refund_amount');
    const hasRefundCurrencyColumn = await hasColumnWithConnection(connection, 'subscriptions', 'refund_currency');
    const hasGuaranteeColumn = await hasColumnWithConnection(connection, 'subscriptions', 'guarantee_expires_at');

    const paymentHasSubscriptionColumn = await hasColumnWithConnection(connection, 'payments', 'subscription_id');
    const paymentHasRefundedAmountColumn = await hasColumnWithConnection(connection, 'payments', 'refunded_amount');
    const paymentHasRefundStatusColumn = await hasColumnWithConnection(connection, 'payments', 'refund_status');

    const guaranteeExpiresAt = currentSubscription.guarantee_expires_at
      ? new Date(currentSubscription.guarantee_expires_at)
      : null;

    const withinGuarantee = guaranteeExpiresAt ? now <= guaranteeExpiresAt : false;
    const shouldAutoRefund = refundRequested || withinGuarantee;

    const refundMeta = shouldAutoRefund
      ? {
          amount: refundAmount || currentSubscription.refund_amount || null,
          currency: refundCurrency || currentSubscription.refund_currency || 'PHP',
          status: 'pending',
          notes: refundNotes,
        }
      : null;

    const updateFields = [
      `status = 'canceled'`,
      `updated_at = NOW()`,
    ];

    const updateValues = [];

    if (hasCancelReasonColumn) {
      updateFields.push('cancel_reason = ?');
      updateValues.push(cancelReason || null);
    }

    if (hasCancelSourceColumn) {
      updateFields.push('cancel_source = ?');
      updateValues.push(cancelSource || 'user');
    }

    if (hasCanceledAtColumn) {
      updateFields.push('canceled_at = ?');
      updateValues.push(now);
    }

    if (hasCancelAtPeriodEndColumn) {
      updateFields.push('cancel_at_period_end = 0');
    }

    if (hasRefundStatusColumn) {
      updateFields.push('refund_status = ?');
      updateValues.push(shouldAutoRefund ? 'pending' : 'not_requested');
    }

    if (hasRefundAmountColumn) {
      updateFields.push('refund_amount = ?');
      updateValues.push(refundMeta?.amount || null);
    }

    if (hasRefundCurrencyColumn) {
      updateFields.push('refund_currency = ?');
      updateValues.push(refundMeta?.currency || null);
    }

    if (hasGuaranteeColumn) {
      updateFields.push('guarantee_expires_at = guarantee_expires_at');
    }

    await connection.query(
      `UPDATE subscriptions SET ${updateFields.join(', ')} WHERE id = ?`,
      [...updateValues, currentSubscription.id]
    );

    await connection.query(
      `UPDATE users
          SET subscription_status = 'canceled',
              updated_at = NOW()
        WHERE id = ?`,
      [userId]
    );

    let refundRecord = null;

    if (shouldAutoRefund) {
      let paymentRow = null;

      if (paymentHasSubscriptionColumn) {
        const [paymentRows] = await connection.query(
          `SELECT id, amount, currency, payment_intent_id
             FROM payments
            WHERE subscription_id = ?
            ORDER BY created_at DESC
            LIMIT 1`,
          [currentSubscription.id]
        );
        paymentRow = paymentRows?.[0] || null;
      }

      if (!paymentRow) {
        const [paymentRows] = await connection.query(
          `SELECT id, amount, currency, payment_intent_id
             FROM payments
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 1`,
          [userId]
        );
        paymentRow = paymentRows?.[0] || null;
      }

      const computedAmount = refundMeta?.amount ?? paymentRow?.amount ?? null;
      const computedCurrency = refundMeta?.currency ?? paymentRow?.currency ?? refundCurrency ?? 'PHP';

      const refundColumns = ['subscription_id', 'user_id', 'amount', 'currency', 'status', 'guarantee_type'];
      const refundPlaceholders = ['?', '?', '?', '?', '?', '?'];
      const refundValues = [
        currentSubscription.id,
        userId,
        computedAmount,
        computedCurrency,
        'pending',
        withinGuarantee ? 'money_back' : 'manual',
      ];

      if (paymentRow?.id) {
        refundColumns.push('payment_id');
        refundPlaceholders.push('?');
        refundValues.push(paymentRow.id);
      }

      if (refundNotes) {
        refundColumns.push('notes');
        refundPlaceholders.push('?');
        refundValues.push(refundNotes);
      }

      const refundSql = `INSERT INTO subscription_refunds (${refundColumns.join(', ')}) VALUES (${refundPlaceholders.join(', ')})`;
      const [refundInsertResult] = await connection.query(refundSql, refundValues);

      refundRecord = {
        id: refundInsertResult?.insertId || null,
        amount: computedAmount,
        currency: computedCurrency,
        status: 'pending',
        guaranteeType: withinGuarantee ? 'money_back' : 'manual',
      };

      if (paymentHasRefundStatusColumn && paymentRow?.id) {
        await connection.query(
          `UPDATE payments
            SET refund_status = 'pending'
           WHERE id = ?`,
          [paymentRow?.id]
        );
      }

      if (paymentHasRefundedAmountColumn && paymentRow?.id && computedAmount !== null) {
        await connection.query(
          `UPDATE payments
              SET refunded_amount = ?
            WHERE id = ?`,
          [computedAmount, paymentRow.id]
        );
      }

    }

    return {
      cancelled: true,
      subscriptionId: currentSubscription.id,
      refund: refundRecord,
      withinGuarantee,
    };
  });
}

async function hasColumn(column) {
  const rows = await query(
    'SHOW COLUMNS FROM subscriptions LIKE ?',
    [column]
  );
  return rows.length > 0;
}

async function hasPaymentColumn(column) {
  const rows = await query(
    'SHOW COLUMNS FROM payments LIKE ?',
    [column]
  );
  return rows.length > 0;
}

async function hasColumnWithConnection(connection, table, column) {
  const [rows] = await connection.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [column]);
  return Array.isArray(rows) && rows.length > 0;
}

export async function activateSubscription({
  userId,
  planId,
  billingCycle,
  amountCentavos,
  paymentIntentId,
  paymentMethod,
}) {
  if (!userId || !planId) {
    throw new Error('Missing user or plan information when activating subscription');
  }

  const planIdValue = Number(planId) || planId;
  const cycle = normalizeBillingCycle(billingCycle);

  const now = new Date();
  const endDate = new Date(now);
  if (cycle === 'yearly') {
    endDate.setFullYear(now.getFullYear() + 1);
  } else {
    endDate.setMonth(now.getMonth() + 1);
  }

  const guaranteeEnd = new Date(now);
  guaranteeEnd.setDate(guaranteeEnd.getDate() + 14);

  const amount = typeof amountCentavos === 'number' ? amountCentavos / 100 : null;

  const [existingSub] = await query(
    'SELECT id FROM subscriptions WHERE user_id = ? LIMIT 1',
    [userId]
  );

  const hasCurrentPeriodStart = await hasColumn('current_period_start');
  const hasStartDate = await hasColumn('start_date');
  const hasEndDate = await hasColumn('end_date');
  const hasNextBillingDate = await hasColumn('next_billing_date');
  const hasPaymentMethodColumn = await hasColumn('payment_method');
  const hasLastPaymentDateColumn = await hasColumn('last_payment_date');
  const hasGuaranteeColumn = await hasColumn('guarantee_expires_at');
  const hasCancelSourceColumn = await hasColumn('cancel_source');
  const hasCanceledAtColumn = await hasColumn('canceled_at');
  const hasCancelReasonColumn = await hasColumn('cancel_reason');
  const hasCancelAtPeriodEndColumn = await hasColumn('cancel_at_period_end');
  const hasRefundStatusColumn = await hasColumn('refund_status');
  const hasRefundAmountColumn = await hasColumn('refund_amount');
  const hasRefundCurrencyColumn = await hasColumn('refund_currency');

  const paymentHasSubscriptionColumn = await hasPaymentColumn('subscription_id');
  const paymentHasRefundedAmountColumn = await hasPaymentColumn('refunded_amount');
  const paymentHasRefundIdColumn = await hasPaymentColumn('refund_id');
  const paymentHasRefundStatusColumn = await hasPaymentColumn('refund_status');
  const paymentHasRefundMetadataColumn = await hasPaymentColumn('refund_metadata');

  const updateAssignments = ['plan_id = ?', 'status = ?', 'billing_cycle = ?'];
  const updateValues = [String(planIdValue), 'active', cycle];

  if (hasCurrentPeriodStart) {
    updateAssignments.push('current_period_start = ?', 'current_period_end = ?');
    updateValues.push(now, endDate);
  }

  if (hasStartDate && hasEndDate) {
    updateAssignments.push('start_date = ?', 'end_date = ?');
    updateValues.push(now, endDate);
  }

  if (hasNextBillingDate) {
    updateAssignments.push('next_billing_date = ?');
    updateValues.push(endDate);
  }

  if (hasPaymentMethodColumn && paymentMethod) {
    updateAssignments.push('payment_method = ?');
    updateValues.push(paymentMethod);
  }

  if (hasLastPaymentDateColumn) {
    updateAssignments.push('last_payment_date = ?');
    updateValues.push(now);
  }

  if (hasGuaranteeColumn) {
    updateAssignments.push('guarantee_expires_at = ?');
    updateValues.push(guaranteeEnd);
  }

  if (hasCancelReasonColumn) {
    updateAssignments.push('cancel_reason = NULL');
  }

  if (hasCancelSourceColumn) {
    updateAssignments.push('cancel_source = ?');
    updateValues.push('user');
  }

  if (hasCanceledAtColumn) {
    updateAssignments.push('canceled_at = NULL');
  }

  if (hasCancelAtPeriodEndColumn) {
    updateAssignments.push('cancel_at_period_end = 0');
  }

  if (hasRefundStatusColumn) {
    updateAssignments.push('refund_status = ?');
    updateValues.push('not_requested');
  }

  if (hasRefundAmountColumn) {
    updateAssignments.push('refund_amount = NULL');
  }

  if (hasRefundCurrencyColumn) {
    updateAssignments.push('refund_currency = NULL');
  }

  updateAssignments.push('updated_at = NOW()');

  const insertColumns = ['user_id', 'plan_id', 'status', 'billing_cycle'];
  const insertPlaceholders = ['?', '?', '?', '?'];
  const insertValues = [userId, String(planIdValue), 'active', cycle];

  if (hasCurrentPeriodStart) {
    insertColumns.push('current_period_start', 'current_period_end');
    insertPlaceholders.push('?', '?');
    insertValues.push(now, endDate);
  }

  if (hasStartDate && hasEndDate) {
    insertColumns.push('start_date', 'end_date');
    insertPlaceholders.push('?', '?');
    insertValues.push(now, endDate);
  }

  if (hasNextBillingDate) {
    insertColumns.push('next_billing_date');
    insertPlaceholders.push('?');
    insertValues.push(endDate);
  }

  if (hasPaymentMethodColumn && paymentMethod) {
    insertColumns.push('payment_method');
    insertPlaceholders.push('?');
    insertValues.push(paymentMethod);
  }

  if (hasLastPaymentDateColumn) {
    insertColumns.push('last_payment_date');
    insertPlaceholders.push('?');
    insertValues.push(now);
  }

  if (hasGuaranteeColumn) {
    insertColumns.push('guarantee_expires_at');
    insertPlaceholders.push('?');
    insertValues.push(guaranteeEnd);
  }

  if (hasCancelSourceColumn) {
    insertColumns.push('cancel_source');
    insertPlaceholders.push('?');
    insertValues.push('user');
  }

  if (hasCancelAtPeriodEndColumn) {
    insertColumns.push('cancel_at_period_end');
    insertPlaceholders.push('?');
    insertValues.push(0);
  }

  if (hasRefundStatusColumn) {
    insertColumns.push('refund_status');
    insertPlaceholders.push('?');
    insertValues.push('not_requested');
  }

  let subscriptionResult = { action: null, id: existingSub?.id || null };

  if (existingSub) {
    const updateSql = `UPDATE subscriptions SET ${updateAssignments.join(', ')} WHERE user_id = ?`;
    await query(updateSql, [...updateValues, userId]);
    subscriptionResult = { action: 'updated', id: existingSub.id };
  } else {
    const insertSql = `INSERT INTO subscriptions (${insertColumns.join(', ')}) VALUES (${insertPlaceholders.join(', ')})`;
    const insertResult = await query(insertSql, insertValues);
    subscriptionResult = { action: 'created', id: insertResult?.insertId || null };
  }

  if (subscriptionResult.id) {
    try {
      await query(
        `UPDATE users
            SET subscription_status = 'active',
                current_subscription_id = ?,
                updated_at = NOW()
          WHERE id = ?`,
        [subscriptionResult.id, userId]
      );
    } catch (userSyncError) {
      console.error('Failed to sync user subscription status during activation:', userSyncError);
    }
  }

  if (amount !== null && paymentIntentId) {
    const existingPayment = await query(
      'SELECT id, status FROM payments WHERE payment_intent_id = ? LIMIT 1',
      [paymentIntentId]
    );

    let paymentActionResult = null;

    if (!existingPayment.length) {
      const paymentColumns = ['user_id', 'plan_id', 'amount', 'currency', 'payment_intent_id', 'status', 'payment_method'];
      const paymentPlaceholders = ['?', '?', '?', '?', '?', '?', '?'];
      const paymentValues = [userId, planIdValue, amount, 'PHP', paymentIntentId, 'succeeded', paymentMethod || 'card'];

      if (paymentHasSubscriptionColumn && subscriptionResult.id) {
        paymentColumns.push('subscription_id');
        paymentPlaceholders.push('?');
        paymentValues.push(subscriptionResult.id);
      }

      if (paymentHasRefundedAmountColumn) {
        paymentColumns.push('refunded_amount');
        paymentPlaceholders.push('NULL');
      }

      if (paymentHasRefundIdColumn) {
        paymentColumns.push('refund_id');
        paymentPlaceholders.push('NULL');
      }

      if (paymentHasRefundStatusColumn) {
        paymentColumns.push('refund_status');
        paymentPlaceholders.push('?');
        paymentValues.push('none');
      }

      if (paymentHasRefundMetadataColumn) {
        paymentColumns.push('refund_metadata');
        paymentPlaceholders.push('NULL');
      }

      paymentColumns.push('created_at');
      paymentPlaceholders.push('NOW()');

      const placeholderList = paymentPlaceholders
        .map((placeholder) => (placeholder === 'NULL' ? 'NULL' : placeholder))
        .join(', ');

      const insertSql = `INSERT INTO payments (${paymentColumns.join(', ')}) VALUES (${placeholderList})`;
      const insertResult = await query(insertSql, paymentValues);
      paymentActionResult = { action: 'created', id: insertResult?.insertId || null };
    } else if (existingPayment[0].status !== 'succeeded') {
      await query(
        `UPDATE payments
           SET user_id = ?, plan_id = ?, amount = ?, status = 'succeeded', payment_method = ?, updated_at = NOW()
         WHERE id = ?`,
        [userId, planIdValue, amount, paymentMethod || 'card', existingPayment[0].id]
      );
      paymentActionResult = { action: 'updated', id: existingPayment[0].id };
    } else {
      paymentActionResult = { action: 'unchanged', id: existingPayment[0].id };
    }

    return {
      subscription: {
        id: subscriptionResult.id,
        action: subscriptionResult.action,
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: endDate,
        guaranteeExpiresAt: guaranteeEnd,
      },
      payment: {
        id: paymentActionResult?.id || null,
        action: paymentActionResult?.action || 'unchanged',
        intentId: paymentIntentId,
        amount,
        method: paymentMethod || 'card',
      },
    };
  }

  return {
    subscription: {
      id: subscriptionResult.id,
      action: subscriptionResult.action,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: endDate,
      guaranteeExpiresAt: guaranteeEnd,
    },
    payment: null,
  };
}

