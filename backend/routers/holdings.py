from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..dependencies import get_current_user
from ..market_data import MarketDataError, get_quote
from ..models import Holding, Transaction, User
from ..schemas import HoldingCreateIn, HoldingOut, HoldingUpdateIn, TransactionCreateIn, TransactionOut
from ..services import (
    VALID_TRANSACTION_TYPES,
    apply_market_price,
    create_holding_record,
    create_transaction_record,
    normalize_currency,
    recalculate_holding,
    trend_points,
    write_snapshot,
)

router = APIRouter(prefix="/api", tags=["holdings"])


def get_user_holding(db: DbSession, user_id: str, holding_id: str) -> Holding:
    holding = db.get(Holding, holding_id)
    if not holding or holding.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Holding not found")
    return holding


@router.get("/holdings", response_model=list[HoldingOut])
def list_holdings(user: User = Depends(get_current_user), db: DbSession = Depends(get_db)) -> list[Holding]:
    return db.scalars(select(Holding).where(Holding.user_id == user.id).order_by(Holding.created_at.desc())).all()


@router.post("/holdings", response_model=HoldingOut)
def create_holding(payload: HoldingCreateIn, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)) -> Holding:
    holding = create_holding_record(
        db,
        user_id=user.id,
        asset_type=payload.type,
        name=payload.name,
        group=payload.group,
        market=payload.market,
        symbol=payload.symbol,
        currency=payload.currency,
        exchange_rate_to_cny=payload.exchange_rate_to_cny,
    )

    if payload.quantity > 0 or payload.unit_price > 0:
        create_transaction_record(
            db,
            user_id=user.id,
            holding_id=holding.id,
            transaction_type="buy",
            trade_date=payload.trade_date,
            quantity=payload.quantity,
            unit_price=payload.unit_price,
            fee=payload.fee,
            currency=payload.currency,
            exchange_rate_to_cny=payload.exchange_rate_to_cny,
            note=payload.note or "初始持仓",
        )
        recalculate_holding(db, holding)
        if payload.current_price is not None:
            apply_market_price(
                db,
                holding,
                payload.current_price,
                payload.exchange_rate_to_cny,
                source="initial_quote",
                when=None,
                instrument_name=payload.name,
            )
        else:
            write_snapshot(db, holding, when=payload.trade_date)
    db.commit()
    db.refresh(holding)
    return holding


@router.patch("/holdings/{holding_id}", response_model=HoldingOut)
def update_holding(holding_id: str, payload: HoldingUpdateIn, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)) -> Holding:
    holding = get_user_holding(db, user.id, holding_id)
    for field in ["name", "group", "market", "symbol", "currency", "exchange_rate_to_cny"]:
        value = getattr(payload, field)
        if value is not None:
            setattr(holding, field, normalize_currency(value) if field == "currency" else value)
    recalculate_holding(db, holding)
    write_snapshot(db, holding)
    db.commit()
    db.refresh(holding)
    return holding


@router.delete("/holdings/{holding_id}")
def delete_holding(holding_id: str, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)) -> dict:
    holding = get_user_holding(db, user.id, holding_id)
    db.delete(holding)
    db.commit()
    return {"ok": True}


@router.get("/holdings/{holding_id}/transactions", response_model=list[TransactionOut])
def list_transactions(holding_id: str, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)) -> list[Transaction]:
    get_user_holding(db, user.id, holding_id)
    return db.scalars(
        select(Transaction).where(Transaction.holding_id == holding_id).order_by(Transaction.trade_date.desc())
    ).all()


@router.post("/holdings/{holding_id}/transactions", response_model=TransactionOut)
def create_transaction(holding_id: str, payload: TransactionCreateIn, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)) -> Transaction:
    holding = get_user_holding(db, user.id, holding_id)
    if payload.type not in VALID_TRANSACTION_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid transaction type")
    transaction = create_transaction_record(
        db,
        user_id=user.id,
        holding_id=holding.id,
        transaction_type=payload.type,
        trade_date=payload.trade_date,
        quantity=payload.quantity,
        unit_price=payload.unit_price,
        fee=payload.fee,
        currency=payload.currency,
        exchange_rate_to_cny=payload.exchange_rate_to_cny,
        note=payload.note,
    )
    recalculate_holding(db, holding)
    write_snapshot(db, holding, when=transaction.trade_date)
    db.commit()
    db.refresh(transaction)
    return transaction


@router.post("/holdings/{holding_id}/refresh-price", response_model=HoldingOut)
def refresh_holding_price(holding_id: str, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)) -> Holding:
    holding = get_user_holding(db, user.id, holding_id)
    if not holding.market or not holding.symbol:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Holding has no market symbol")
    kind = "stock" if holding.market.upper() == "US" else "fund"
    try:
        quote = get_quote(holding.market, holding.symbol, kind)
    except MarketDataError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    exchange_rate = quote["exchange_rate_to_cny"] or holding.exchange_rate_to_cny
    if holding.currency.upper() != "CNY" and exchange_rate <= 1:
        exchange_rate = holding.exchange_rate_to_cny
    apply_market_price(
        db,
        holding,
        quote["price"],
        exchange_rate,
        source=quote["quote_source"],
        when=quote["price_updated_at"],
        instrument_name=quote["name"],
    )
    holding.currency = quote["currency"]
    db.commit()
    db.refresh(holding)
    return holding


@router.get("/holdings/{holding_id}/trend")
def holding_trend(holding_id: str, range: str = "week", user: User = Depends(get_current_user), db: DbSession = Depends(get_db)) -> list[dict]:
    get_user_holding(db, user.id, holding_id)
    return trend_points(db, user.id, range, holding_id)
