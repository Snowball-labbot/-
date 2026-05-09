from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..dependencies import get_current_user
from ..models import Holding, Transaction, User
from ..schemas import (
    PortfolioBackupHolding,
    PortfolioBackupImportIn,
    PortfolioBackupImportOut,
    PortfolioBackupOut,
    PortfolioBackupTransaction,
)
from ..services import VALID_TRANSACTION_TYPES, apply_market_price, recalculate_holding, write_snapshot

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


def _transaction_payload(transaction: Transaction) -> PortfolioBackupTransaction:
    return PortfolioBackupTransaction(
        type=transaction.type,
        trade_date=transaction.trade_date,
        quantity=transaction.quantity,
        unit_price=transaction.unit_price,
        fee=transaction.fee,
        currency=transaction.currency,
        exchange_rate_to_cny=transaction.exchange_rate_to_cny,
        note=transaction.note,
    )


def _holding_payload(holding: Holding, transactions: list[Transaction]) -> PortfolioBackupHolding:
    return PortfolioBackupHolding(
        type=holding.type,
        name=holding.name,
        group=holding.group,
        market=holding.market,
        symbol=holding.symbol,
        instrument_name=holding.instrument_name,
        quote_source=holding.quote_source,
        currency=holding.currency,
        quantity=holding.quantity,
        avg_cost=holding.avg_cost,
        current_price=holding.current_price,
        exchange_rate_to_cny=holding.exchange_rate_to_cny,
        price_updated_at=holding.price_updated_at,
        transactions=[_transaction_payload(item) for item in transactions],
    )


@router.get("/export", response_model=PortfolioBackupOut)
def export_portfolio(user: User = Depends(get_current_user), db: DbSession = Depends(get_db)) -> PortfolioBackupOut:
    holdings = db.scalars(
        select(Holding).where(Holding.user_id == user.id).order_by(Holding.created_at.asc())
    ).all()
    holding_ids = [holding.id for holding in holdings]
    transactions_by_holding: dict[str, list[Transaction]] = {holding.id: [] for holding in holdings}
    if holding_ids:
        transactions = db.scalars(
            select(Transaction)
            .where(Transaction.user_id == user.id, Transaction.holding_id.in_(holding_ids))
            .order_by(Transaction.trade_date.asc())
        ).all()
        for transaction in transactions:
            transactions_by_holding.setdefault(transaction.holding_id, []).append(transaction)

    return PortfolioBackupOut(
        exported_at=datetime.now(timezone.utc),
        holdings=[_holding_payload(holding, transactions_by_holding.get(holding.id, [])) for holding in holdings],
    )


@router.post("/import", response_model=PortfolioBackupImportOut)
def import_portfolio(
    payload: PortfolioBackupImportIn,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> PortfolioBackupImportOut:
    if payload.schema_version and payload.schema_version != "portfolio_backup_v1":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported portfolio backup version")

    imported = 0
    for item in payload.holdings:
        holding = Holding(
            user_id=user.id,
            type=item.type,
            name=item.name,
            group=item.group or None,
            market=item.market or None,
            symbol=item.symbol or None,
            instrument_name=item.instrument_name or item.name,
            quote_source=item.quote_source or "portfolio_import",
            currency=item.currency.upper(),
            exchange_rate_to_cny=item.exchange_rate_to_cny,
            price_updated_at=item.price_updated_at,
        )
        db.add(holding)
        db.flush()

        transactions = item.transactions
        if not transactions and (item.quantity > 0 or item.avg_cost > 0):
            transactions = [
                PortfolioBackupTransaction(
                    type="buy",
                    trade_date=item.price_updated_at,
                    quantity=item.quantity,
                    unit_price=item.avg_cost,
                    fee=Decimal("0"),
                    currency=item.currency.upper(),
                    exchange_rate_to_cny=item.exchange_rate_to_cny,
                    note="Portfolio backup import",
                )
            ]

        for transaction in transactions:
            if transaction.type not in VALID_TRANSACTION_TYPES:
                continue
            db.add(
                Transaction(
                    user_id=user.id,
                    holding_id=holding.id,
                    type=transaction.type,
                    trade_date=transaction.trade_date or datetime.now(timezone.utc),
                    quantity=transaction.quantity,
                    unit_price=transaction.unit_price,
                    fee=transaction.fee,
                    currency=transaction.currency.upper(),
                    exchange_rate_to_cny=transaction.exchange_rate_to_cny,
                    note=transaction.note,
                )
            )

        db.flush()
        recalculate_holding(db, holding)
        if item.current_price > 0:
            apply_market_price(
                db,
                holding,
                item.current_price,
                item.exchange_rate_to_cny,
                source=item.quote_source or "portfolio_import",
                when=item.price_updated_at,
                instrument_name=item.instrument_name or item.name,
            )
        else:
            write_snapshot(db, holding)
        imported += 1

    db.commit()
    return PortfolioBackupImportOut(imported=imported)
