import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  // Find or create the default account
  let account = await db.account.findFirst({
    where: { name: 'Default' },
  });

  if (!account) {
    account = await db.account.create({
      data: {
        name: 'Default',
        balance: 100000,
        currency: 'USD',
      },
    });
  }

  return NextResponse.json({
    id: account.id,
    name: account.name,
    balance: account.balance,
    currency: account.currency,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, amount, note } = body;

  if (!action || !['deposit', 'withdraw'].includes(action)) {
    return NextResponse.json(
      { error: 'Invalid action. Must be "deposit" or "withdraw".' },
      { status: 400 },
    );
  }

  if (typeof amount !== 'number' || amount <= 0) {
    return NextResponse.json(
      { error: 'Amount must be a positive number.' },
      { status: 400 },
    );
  }

  // Find or create default account
  let account = await db.account.findFirst({
    where: { name: 'Default' },
  });

  if (!account) {
    account = await db.account.create({
      data: {
        name: 'Default',
        balance: 100000,
        currency: 'USD',
      },
    });
  }

  const signedAmount = action === 'withdraw' ? -amount : amount;
  const newBalance = account.balance + signedAmount;

  if (newBalance < 0) {
    return NextResponse.json(
      { error: 'Insufficient balance for this withdrawal.' },
      { status: 400 },
    );
  }

  // Create the deposit record and update balance in a transaction
  const updated = await db.$transaction(async (tx) => {
    await tx.deposit.create({
      data: {
        accountId: account.id,
        amount: signedAmount,
        type: action,
        note: note ?? null,
      },
    });

    return tx.account.update({
      where: { id: account.id },
      data: { balance: newBalance },
    });
  });

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    balance: updated.balance,
    currency: updated.currency,
  });
}
