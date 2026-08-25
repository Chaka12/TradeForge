import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');

  // Find the default account
  const account = await db.account.findFirst({ where: { name: 'Default' } });
  if (!account) {
    return NextResponse.json({ error: 'No account found. Create an account first.' }, { status: 404 });
  }

  const where: Record<string, unknown> = { accountId: account.id };
  if (status && ['pending', 'filled', 'partially_filled', 'cancelled', 'rejected'].includes(status)) {
    where.status = status;
  }

  const orders = await db.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ data: orders });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { symbol, side, type, quantity, price, stopPrice } = body;

  if (!symbol || !side || !type || !quantity) {
    return NextResponse.json(
      { error: 'Missing required fields: symbol, side, type, quantity.' },
      { status: 400 },
    );
  }

  if (!['buy', 'sell'].includes(side)) {
    return NextResponse.json({ error: 'Side must be "buy" or "sell".' }, { status: 400 });
  }

  if (!['market', 'limit', 'stop', 'stop_limit'].includes(type)) {
    return NextResponse.json(
      { error: 'Type must be "market", "limit", "stop", or "stop_limit".' },
      { status: 400 },
    );
  }

  if (quantity <= 0) {
    return NextResponse.json({ error: 'Quantity must be positive.' }, { status: 400 });
  }

  // Find the default account
  const account = await db.account.findFirst({ where: { name: 'Default' } });
  if (!account) {
    return NextResponse.json({ error: 'No account found. Create an account first.' }, { status: 404 });
  }

  const createdAt = Math.floor(Date.now() / 1000);

  const order = await db.order.create({
    data: {
      accountId: account.id,
      symbol,
      side,
      type,
      quantity,
      price: price ?? null,
      stopPrice: stopPrice ?? null,
      status: 'pending',
      filledQty: 0,
      createdAt,
    },
  });

  return NextResponse.json({ data: order });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get('orderId');

  if (!orderId) {
    return NextResponse.json({ error: 'Missing required query param: orderId.' }, { status: 400 });
  }

  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  if (order.status !== 'pending') {
    return NextResponse.json({ error: 'Only pending orders can be cancelled.' }, { status: 400 });
  }

  await db.order.update({
    where: { id: orderId },
    data: { status: 'cancelled' },
  });

  return NextResponse.json({ success: true, orderId });
}
