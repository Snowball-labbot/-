from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .models import Holding, Transaction, ValuationSnapshot, now_utc


VALID_TRANSACTION_TYPES = {
    "buy",
    "sell",
    "adjustment",
    "cash_in",
    "cash_out",
    "transfer_in",
    "transfer_out",
    "income",
}

VALID_FLOW_CLASSES = {
    "opening_balance",
    "external_contribution",
    "external_withdrawal",
    "internal_trade",
    "internal_transfer",
    "valuation_correction",
}

PERFORMANCE_BASELINE = datetime(2026, 7, 6, tzinfo=timezone.utc)


def normalize_currency(currency: str | None) -> str:
    return (currency or "CNY").upper()


def optional_text(value: str | None) -> str | None:
    return value or None


def to_decimal(value: Decimal | int | float | str | None) -> Decimal:
    if value is None:
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def snapshot_day(dt: datetime | None = None) -> datetime:
    source = dt or now_utc()
    if source.tzinfo is None:
        source = source.replace(tzinfo=timezone.utc)
    return datetime(source.year, source.month, source.day, tzinfo=timezone.utc)


def create_holding_record(
    db: Session,
    *,
    user_id: str,
    asset_type: str,
    name: str,
    group: str | None = None,
    market: str | None = None,
    symbol: str | None = None,
    instrument_name: str | None = None,
    quote_source: str | None = None,
    currency: str = "CNY",
    exchange_rate_to_cny: Decimal | int | float | str = Decimal("1"),
    price_updated_at: datetime | None = None,
    created_at: datetime | None = None,
) -> Holding:
    holding = Holding(
        user_id=user_id,
        type=asset_type,
        name=name,
        group=optional_text(group),
        market=optional_text(market),
        symbol=optional_text(symbol),
        instrument_name=instrument_name or name,
        quote_source=optional_text(quote_source),
        currency=normalize_currency(currency),
        exchange_rate_to_cny=to_decimal(exchange_rate_to_cny) or Decimal("1"),
        price_updated_at=price_updated_at,
    )
    if created_at is not None:
        holding.created_at = created_at
    db.add(holding)
    db.flush()
    return holding


def create_transaction_record(
    db: Session,
    *,
    user_id: str,
    holding_id: str,
    transaction_type: str,
    trade_date: datetime | None = None,
    quantity: Decimal | int | float | str = Decimal("0"),
    unit_price: Decimal | int | float | str = Decimal("0"),
    fee: Decimal | int | float | str = Decimal("0"),
    currency: str = "CNY",
    exchange_rate_to_cny: Decimal | int | float | str = Decimal("1"),
    operation_id: str | None = None,
    related_holding_id: str | None = None,
    flow_class: str = "internal_trade",
    realized_gain_native: Decimal | int | float | str = Decimal("0"),
    realized_gain_cny: Decimal | int | float | str = Decimal("0"),
    note: str | None = None,
) -> Transaction:
    transaction = Transaction(
        user_id=user_id,
        holding_id=holding_id,
        type=transaction_type,
        trade_date=trade_date or now_utc(),
        quantity=to_decimal(quantity),
        unit_price=to_decimal(unit_price),
        fee=to_decimal(fee),
        currency=normalize_currency(currency),
        exchange_rate_to_cny=to_decimal(exchange_rate_to_cny) or Decimal("1"),
        operation_id=operation_id,
        related_holding_id=related_holding_id,
        flow_class=flow_class if flow_class in VALID_FLOW_CLASSES else "internal_trade",
        realized_gain_native=to_decimal(realized_gain_native),
        realized_gain_cny=to_decimal(realized_gain_cny),
        note=note,
    )
    db.add(transaction)
    db.flush()
    return transaction


def recalculate_holding(db: Session, holding: Holding) -> None:
    transactions = db.scalars(
        select(Transaction).where(Transaction.holding_id == holding.id).order_by(Transaction.trade_date.asc())
    ).all()

    quantity = Decimal("0")
    cost = Decimal("0")
    cost_cny = Decimal("0")
    current_price = holding.current_price or Decimal("0")
    exchange_rate = holding.exchange_rate_to_cny or Decimal("1")

    for item in transactions:
        q = to_decimal(item.quantity)
        p = to_decimal(item.unit_price)
        fee = to_decimal(item.fee)
        exchange_rate = to_decimal(item.exchange_rate_to_cny) or exchange_rate
        transaction_cost = q * p + fee
        transaction_cost_cny = transaction_cost * exchange_rate

        if item.type in {"buy", "cash_in", "transfer_in"}:
            quantity += q
            cost += transaction_cost
            cost_cny += transaction_cost_cny
            current_price = p
        elif item.type == "sell":
            avg_cost = cost / quantity if quantity > 0 else Decimal("0")
            avg_cost_cny = cost_cny / quantity if quantity > 0 else Decimal("0")
            sell_quantity = min(q, quantity)
            quantity -= sell_quantity
            cost -= avg_cost * sell_quantity
            cost_cny -= avg_cost_cny * sell_quantity
            current_price = p
        elif item.type in {"cash_out", "transfer_out"}:
            avg_cost = cost / quantity if quantity > 0 else Decimal("0")
            avg_cost_cny = cost_cny / quantity if quantity > 0 else Decimal("0")
            withdrawn_quantity = min(q + fee, quantity)
            quantity -= withdrawn_quantity
            cost -= avg_cost * withdrawn_quantity
            cost_cny -= avg_cost_cny * withdrawn_quantity
            current_price = p
        elif item.type == "adjustment":
            if q > 0:
                quantity += q
                cost += transaction_cost
                cost_cny += transaction_cost_cny
            current_price = p

    current_value = quantity * current_price
    holding.quantity = quantity
    holding.avg_cost = cost / quantity if quantity > 0 else Decimal("0")
    holding.cost_basis_cny = max(cost_cny, Decimal("0"))
    holding.current_price = current_price
    holding.current_value = current_value
    holding.current_value_cny = current_value * exchange_rate
    holding.exchange_rate_to_cny = exchange_rate
    holding.updated_at = now_utc()


def backfill_cost_bases(db: Session) -> None:
    holdings = db.scalars(select(Holding)).all()
    changed = False
    for holding in holdings:
        if (holding.cost_basis_cny or Decimal("0")) == 0 and holding.transactions:
            recalculate_holding(db, holding)
            changed = True
    if changed:
        db.commit()


def write_snapshot(db: Session, holding: Holding, source: str = "manual", when: datetime | None = None) -> None:
    day = snapshot_day(when)
    db.execute(delete(ValuationSnapshot).where(
        ValuationSnapshot.holding_id == holding.id,
        ValuationSnapshot.snapshot_date == day,
    ))
    db.add(ValuationSnapshot(
        user_id=holding.user_id,
        holding_id=holding.id,
        snapshot_date=day,
        quantity=holding.quantity,
        unit_price=holding.current_price,
        value=holding.current_value,
        value_cny=holding.current_value_cny,
        source=source,
    ))


def apply_market_price(
    db: Session,
    holding: Holding,
    price: Decimal,
    exchange_rate_to_cny: Decimal,
    source: str,
    when: datetime | None = None,
    instrument_name: str | None = None,
) -> None:
    holding.current_price = to_decimal(price)
    holding.exchange_rate_to_cny = to_decimal(exchange_rate_to_cny) or Decimal("1")
    holding.current_value = (holding.quantity or Decimal("0")) * holding.current_price
    holding.current_value_cny = holding.current_value * holding.exchange_rate_to_cny
    holding.quote_source = source
    holding.price_updated_at = when or now_utc()
    if instrument_name:
        holding.instrument_name = instrument_name
    holding.updated_at = now_utc()
    write_snapshot(db, holding, source=source, when=holding.updated_at)


def total_cost_cny(holding: Holding) -> Decimal:
    return holding.cost_basis_cny or Decimal("0")


def range_start(range_name: str) -> datetime:
    if range_name == "all":
        return PERFORMANCE_BASELINE
    days = {"week": 6, "month": 29, "year": 364}.get(range_name, 6)
    today = snapshot_day()
    return today - timedelta(days=days)


def trend_points(db: Session, user_id: str, range_name: str, holding_id: str | None = None) -> list[dict]:
    today = snapshot_day()
    if holding_id:
        first_market_update = db.scalar(
            select(func.min(ValuationSnapshot.created_at)).where(
                ValuationSnapshot.user_id == user_id,
                ValuationSnapshot.holding_id == holding_id,
                ValuationSnapshot.source != "manual",
            )
        )
        first_snapshot = db.scalar(
            select(func.min(ValuationSnapshot.snapshot_date)).where(
                ValuationSnapshot.user_id == user_id,
                ValuationSnapshot.holding_id == holding_id,
            )
        )
        first_available = snapshot_day(first_market_update) if first_market_update else (first_snapshot or today)
        requested_start = range_start(range_name)
        start = max(first_available, requested_start)
    else:
        start = range_start(range_name)
    days = (today - start).days + 1
    filters = [ValuationSnapshot.user_id == user_id]
    if holding_id:
        filters.append(ValuationSnapshot.holding_id == holding_id)

    snapshots = db.scalars(
        select(ValuationSnapshot)
        .where(*filters, ValuationSnapshot.snapshot_date <= today)
        .order_by(ValuationSnapshot.snapshot_date.asc())
    ).all()

    result = []
    for offset in range(days):
        day = start + timedelta(days=offset)
        by_holding: dict[str, Decimal] = {}
        for snapshot in snapshots:
            effective_day = snapshot_day(snapshot.created_at) if snapshot.source != "manual" else snapshot.snapshot_date
            if effective_day <= day:
                by_holding[snapshot.holding_id] = snapshot.value_cny
        result.append({"date": day.date().isoformat(), "value_cny": sum(by_holding.values(), Decimal("0"))})
    return result


def _external_flow_cny(transaction: Transaction) -> Decimal:
    rate = to_decimal(transaction.exchange_rate_to_cny) or Decimal("1")
    gross = (to_decimal(transaction.quantity) * to_decimal(transaction.unit_price) + to_decimal(transaction.fee)) * rate
    if transaction.flow_class == "external_contribution":
        return gross
    if transaction.flow_class == "external_withdrawal":
        return -gross
    return Decimal("0")


def portfolio_performance(db: Session, user_id: str, range_name: str) -> dict:
    today = snapshot_day()
    requested_start = max(range_start(range_name), PERFORMANCE_BASELINE)
    snapshots = db.scalars(
        select(ValuationSnapshot)
        .where(
            ValuationSnapshot.user_id == user_id,
            ValuationSnapshot.snapshot_date <= today,
        )
        .order_by(ValuationSnapshot.snapshot_date.asc(), ValuationSnapshot.created_at.asc())
    ).all()
    transactions = db.scalars(
        select(Transaction)
        .where(
            Transaction.user_id == user_id,
            Transaction.trade_date >= PERFORMANCE_BASELINE,
            Transaction.trade_date < today + timedelta(days=1),
        )
        .order_by(Transaction.trade_date.asc())
    ).all()
    current_total = sum((holding.current_value_cny for holding in db.scalars(
        select(Holding).where(Holding.user_id == user_id, Holding.archived_at.is_(None))
    ).all()), Decimal("0"))

    first_snapshot = min((snapshot_day(snapshot.snapshot_date) for snapshot in snapshots), default=PERFORMANCE_BASELINE)
    calculation_start = max(PERFORMANCE_BASELINE, first_snapshot)
    flow_by_day: dict[str, Decimal] = {}
    for transaction in transactions:
        key = snapshot_day(transaction.trade_date).date().isoformat()
        flow_by_day[key] = flow_by_day.get(key, Decimal("0")) + _external_flow_cny(transaction)

    by_holding: dict[str, Decimal] = {}
    snapshot_index = 0
    day = calculation_start
    previous_value: Decimal | None = None
    cumulative_growth = Decimal("1")
    peak_growth = Decimal("1")
    max_drawdown = Decimal("0")
    net_external = Decimal("0")
    opening_value = Decimal("0")
    all_points: list[dict] = []

    while day <= today:
        while snapshot_index < len(snapshots) and snapshot_day(snapshots[snapshot_index].snapshot_date) <= day:
            snapshot = snapshots[snapshot_index]
            by_holding[snapshot.holding_id] = to_decimal(snapshot.value_cny)
            snapshot_index += 1
        value = sum(by_holding.values(), Decimal("0"))
        if day == today:
            value = current_total
        day_key = day.date().isoformat()
        flow = flow_by_day.get(day_key, Decimal("0"))
        if previous_value is None:
            opening_value = value - flow
            if opening_value < 0:
                opening_value = Decimal("0")
        elif previous_value > 0:
            daily_return = (value - previous_value - flow) / previous_value
            cumulative_growth *= Decimal("1") + daily_return
            peak_growth = max(peak_growth, cumulative_growth)
            if peak_growth > 0:
                max_drawdown = min(max_drawdown, cumulative_growth / peak_growth - Decimal("1"))
        net_external += flow
        invested = opening_value + net_external
        profit = value - invested
        all_points.append({
            "date": day_key,
            "value_cny": value,
            "net_flow_cny": flow,
            "invested_capital_cny": invested,
            "profit_cny": profit,
            "cumulative_return_pct": (cumulative_growth - Decimal("1")) * Decimal("100"),
        })
        previous_value = value
        day += timedelta(days=1)

    points = [point for point in all_points if point["date"] >= requested_start.date().isoformat()]
    latest = all_points[-1] if all_points else {
        "value_cny": Decimal("0"),
        "invested_capital_cny": Decimal("0"),
        "profit_cny": Decimal("0"),
        "cumulative_return_pct": Decimal("0"),
    }
    return {
        "baseline_date": PERFORMANCE_BASELINE.date().isoformat(),
        "current_value_cny": latest["value_cny"],
        "net_invested_cny": latest["invested_capital_cny"],
        "profit_cny": latest["profit_cny"],
        "return_pct": latest["cumulative_return_pct"],
        "max_drawdown_pct": max_drawdown * Decimal("100"),
        "points": points,
    }
