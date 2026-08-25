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
  if (status && ['open', 'closed'].includes(status)) {
    where.status = status;
  }

  const trades = await db.trade.findMany({
    where,
    orderBy: { entryTime: 'desc' },
  });

  return NextResponse.json({ data: trades });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;

  // Find the default account
  const account = await db.account.findFirst({ where: { name: 'Default' } });
  if (!account) {
    return NextResponse.json({ error: 'No account found. Create an account first.' }, { status: 404 });
  }

  if (action === 'close') {
    const { tradeId, price } = body;

    if (!tradeId) {
      return NextResponse.json({ error: 'Missing tradeId.' }, { status: 400 });
    }

    const trade = await db.trade.findUnique({ where: { id: tradeId } });
    if (!trade) {
      return NextResponse.json({ error: 'Trade not found.' }, { status: 404 });
    }
    if (trade.status !== 'open') {
      return NextResponse.json({ error: 'Trade is already closed.' }, { status: 400 });
    }
    if (trade.accountId !== account.id) {
      return NextResponse.json({ error: 'Trade does not belong to this account.' }, { status: 403 });
    }

    const exitPrice = price ?? trade.entryPrice;
    const exitTime = Math.floor(Date.now() / 1000);
    const commission = trade.quantity * exitPrice * 0.001;

    const direction = trade.side === 'long' ? 1 : -1;
    const pnl = direction * (exitPrice - trade.entryPrice) * trade.quantity - commission;

    const updated = await db.trade.update({
      where: { id: tradeId },
      data: {
        status: 'closed',
        exitPrice,
        exitTime,
        pnl,
        commission: trade.commission + commission,
      },
    });

    return NextResponse.json({ data: updated });
  }

  if (action === 'create') {
    const { symbol, side, quantity, price, stopLoss, takeProfit } = body;

    if (!symbol || !side || !quantity || price == null) {
      return NextResponse.json(
        { error: 'Missing required fields: symbol, side, quantity, price.' },
        { status: 400 },
      );
    }

    if (!['long', 'short'].includes(side)) {
      return NextResponse.json({ error: 'Side must be "long" or "short".' }, { status: 400 });
    }

    if (quantity <= 0) {
      return NextResponse.json({ error: 'Quantity must be positive.' }, { status: 400 });
    }

    if (price <= 0) {
      return NextResponse.json({ error: 'Price must be positive.' }, { status: 400 });
    }

    const entryTime = Math.floor(Date.now() / 1000);
    const commission = quantity * price * 0.001;

    const trade = await db.trade.create({
      data: {
        accountId: account.id,
        symbol,
        side,
        quantity,
        entryPrice: price,
        stopLoss: stopLoss ?? null,
        takeProfit: takeProfit ?? null,
        commission,
        status: 'open',
        entryTime,
      },
    });

    return NextResponse.json({ data: trade });
  }

  return NextResponse.json({ error: 'Invalid action. Must be "create" or "close".' }, { status: 400 });
}
