'use server';

import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { pool, query } from '@/lib/db';

const REFUND_STATUS_VALUES = ['pending', 'processing', 'processed', 'failed', 'manual'];

function ensureAdmin(session) {
  const userEmail = session?.user?.email?.toLowerCase();
  const userRole = session?.user?.role?.toLowerCase();
  const isAdminUser = userRole === 'admin' || userEmail === 'savoryadmin@example.com';

  if (!isAdminUser) {
    console.log('Admin action unauthorized:', { userEmail, userRole });
    throw new Error('Unauthorized');
  }

  return { userEmail, userRole };
}

function mapRefundStatusForSubscription(status) {
  switch (status) {
    case 'processed':
      return 'processed';
    case 'failed':
      return 'denied';
    case 'pending':
    case 'processing':
    case 'manual':
    default:
      return 'pending';
  }
}

function mapRefundStatusForPayment(status) {
  switch (status) {
    case 'processed':
      return 'processed';
    case 'failed':
      return 'failed';
    case 'pending':
    case 'processing':
    case 'manual':
    default:
      return 'pending';
  }
}

function formatRefundRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    amount: typeof row.amount === 'number' ? row.amount : Number(row.amount ?? 0),
    currency: row.currency || 'PHP',
    status: row.status,
    guaranteeType: row.guarantee_type,
    reason: row.reason,
    notes: row.notes,
    requestedAt: row.requested_at ? new Date(row.requested_at).toISOString() : null,
    processedAt: row.processed_at ? new Date(row.processed_at).toISOString() : null,
    referenceId: row.reference_id,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    user: {
      id: row.user_id,
      name: row.user_name || row.user_email,
      email: row.user_email,
    },
    subscription: {
      id: row.subscription_id,
      status: row.subscription_status,
      refundStatus: row.subscription_refund_status,
      planId: row.plan_id,
      planName: row.plan_name,
    },
    payment: {
      id: row.payment_id,
      amount: typeof row.payment_amount === 'number' ? row.payment_amount : row.payment_amount ? Number(row.payment_amount) : null,
      currency: row.payment_currency,
      status: row.payment_status,
      refundStatus: row.payment_refund_status,
      method: row.payment_method,
    },
  };
}

export async function getRefundRequests({ page = 1, limit = 10, status = 'pending', search = '' }) {
  const session = await auth();
  ensureAdmin(session);

  const offset = (page - 1) * limit;
  const params = [];

  let queryStr = `
    SELECT
      sr.id,
      sr.subscription_id,
      sr.user_id,
      sr.payment_id,
      sr.amount,
      sr.currency,
      sr.status,
      sr.guarantee_type,
      sr.reason,
      sr.notes,
      sr.requested_at,
      sr.processed_at,
      sr.reference_id,
      sr.created_at,
      sr.updated_at,
      u.email AS user_email,
      u.name AS user_name,
      s.status AS subscription_status,
      s.refund_status AS subscription_refund_status,
      s.plan_id,
      sp.name AS plan_name,
      p.amount AS payment_amount,
      p.currency AS payment_currency,
      p.status AS payment_status,
      p.payment_method,
      p.refund_status AS payment_refund_status
    FROM subscription_refunds sr
    JOIN users u ON sr.user_id = u.id
    LEFT JOIN subscriptions s ON sr.subscription_id = s.id
    LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
    LEFT JOIN payments p ON sr.payment_id = p.id
    WHERE 1 = 1
  `;

  if (status && status !== 'all') {
    queryStr += ' AND sr.status = ?';
    params.push(status);
  }

  if (search) {
    queryStr += ' AND (u.email LIKE ? OR u.name LIKE ? OR sr.reference_id LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  queryStr += ' ORDER BY sr.requested_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = await query(queryStr, params);

  const countParams = [];
  let countQuery = `
    SELECT COUNT(*) AS total
    FROM subscription_refunds sr
    JOIN users u ON sr.user_id = u.id
    WHERE 1 = 1
  `;

  if (status && status !== 'all') {
    countQuery += ' AND sr.status = ?';
    countParams.push(status);
  }

  if (search) {
    countQuery += ' AND (u.email LIKE ? OR u.name LIKE ? OR sr.reference_id LIKE ?)';
    const searchTerm = `%${search}%`;
    countParams.push(searchTerm, searchTerm, searchTerm);
  }

  const [countResult] = await query(countQuery, countParams);
  const total = countResult?.total || 0;

  return {
    refunds: rows.map(formatRefundRow).filter(Boolean),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function updateRefundRequest(refundId, { status, referenceId, notes }) {
  const session = await auth();
  ensureAdmin(session);

  if (status && !REFUND_STATUS_VALUES.includes(status)) {
    throw new Error(`Invalid refund status: ${status}`);
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [existingRows] = await connection.query(
      `SELECT * FROM subscription_refunds WHERE id = ? FOR UPDATE`,
      [refundId]
    );

    const existing = existingRows?.[0];

    if (!existing) {
      throw new Error('Refund request not found');
    }

    const updates = [];
    const values = [];

    if (status) {
      updates.push('status = ?');
      values.push(status);

      if (status === 'processed' || status === 'failed') {
        updates.push('processed_at = ?');
        values.push(new Date());
      } else {
        updates.push('processed_at = NULL');
      }
    }

    if (referenceId !== undefined) {
      updates.push('reference_id = ?');
      values.push(referenceId || null);
    }

    if (notes !== undefined) {
      updates.push('notes = ?');
      values.push(notes || null);
    }

    if (updates.length) {
      updates.push('updated_at = NOW()');
      await connection.query(
        `UPDATE subscription_refunds SET ${updates.join(', ')} WHERE id = ?`,
        [...values, refundId]
      );
    }

    const nextStatus = status || existing.status;

    if (existing.subscription_id) {
      const subscriptionRefundStatus = mapRefundStatusForSubscription(nextStatus);
      await connection.query(
        `UPDATE subscriptions
            SET refund_status = ?,
                refund_amount = COALESCE(refund_amount, ?),
                refund_currency = COALESCE(refund_currency, ?),
                updated_at = NOW()
          WHERE id = ?`,
        [
          subscriptionRefundStatus,
          existing.amount,
          existing.currency,
          existing.subscription_id,
        ]
      );
    }

    if (existing.payment_id) {
      const paymentRefundStatus = mapRefundStatusForPayment(nextStatus);
      await connection.query(
        `UPDATE payments
            SET refund_status = ?,
                refunded_amount = CASE WHEN ? = 'processed' THEN ? ELSE refunded_amount END,
                updated_at = NOW()
          WHERE id = ?`,
        [
          paymentRefundStatus,
          nextStatus,
          existing.amount,
          existing.payment_id,
        ]
      );
    }

    await connection.commit();

    const [updatedRows] = await connection.query(
      `SELECT
          sr.id,
          sr.subscription_id,
          sr.user_id,
          sr.payment_id,
          sr.amount,
          sr.currency,
          sr.status,
          sr.guarantee_type,
          sr.reason,
          sr.notes,
          sr.requested_at,
          sr.processed_at,
          sr.reference_id,
          sr.created_at,
          sr.updated_at,
          u.email AS user_email,
          u.name AS user_name,
          s.status AS subscription_status,
          s.refund_status AS subscription_refund_status,
          s.plan_id,
          sp.name AS plan_name,
          p.amount AS payment_amount,
          p.currency AS payment_currency,
          p.status AS payment_status,
          p.payment_method,
          p.refund_status AS payment_refund_status
        FROM subscription_refunds sr
        JOIN users u ON sr.user_id = u.id
        LEFT JOIN subscriptions s ON sr.subscription_id = s.id
        LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
        LEFT JOIN payments p ON sr.payment_id = p.id
        WHERE sr.id = ?`,
      [refundId]
    );

    const updatedRefund = formatRefundRow(updatedRows?.[0]);

    revalidatePath('/admin/refunds');

    return {
      success: true,
      message: 'Refund request updated successfully',
      refund: updatedRefund,
    };
  } catch (error) {
    await connection.rollback();
    console.error('Error updating refund request:', error);
    throw new Error(error.message || 'Failed to update refund request');
  } finally {
    connection.release();
  }
}
