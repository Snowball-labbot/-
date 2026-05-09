from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..dependencies import get_current_user
from ..models import Holding, Transaction, User
from ..schemas import ImportOut, LocalStorageImportIn
from ..services import recalculate_holding, write_snapshot

router = APIRouter(prefix="/api/import", tags=["import"])


@router.post("/local-storage", response_model=ImportOut)
def import_local_storage(payload: LocalStorageImportIn, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)) -> ImportOut:
    imported = 0
    for asset in payload.assets:
        holding = Holding(
            user_id=user.id,
            type=asset.type,
            name=asset.name or f"{asset.type} Asset",
            group=asset.group or None,
            currency="CNY",
            quantity=1,
            exchange_rate_to_cny=1,
            created_at=asset.createdAt or datetime.now(timezone.utc),
        )
        db.add(holding)
        db.flush()
        db.add(Transaction(
            user_id=user.id,
            holding_id=holding.id,
            type="buy",
            trade_date=asset.createdAt or datetime.now(timezone.utc),
            quantity=1,
            unit_price=asset.amount,
            fee=0,
            currency="CNY",
            exchange_rate_to_cny=1,
            note="从旧版 localStorage 导入",
        ))
        db.flush()
        recalculate_holding(db, holding)
        write_snapshot(db, holding, source="import", when=asset.createdAt)
        imported += 1
    db.commit()
    return ImportOut(imported=imported)
