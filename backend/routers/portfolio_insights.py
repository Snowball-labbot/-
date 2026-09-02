from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..dependencies import get_current_user
from ..exposure_templates import ensure_holding_mapping, infer_stock_sector, replace_manual_mappings, seed_profiles
from ..models import ExposureProfile, FamilySafetyItem, FamilySafetySnapshot, Holding, HoldingExposure, User
from ..schemas import (
    ExposureMappingIn,
    ExposureProfileOut,
    FamilySafetyIn,
    FamilySafetyItemIn,
    FamilySafetyItemOut,
    FamilySafetyOut,
    PortfolioPerspectiveOut,
)
from ..services import portfolio_performance


router = APIRouter(prefix="/api/portfolio-insights", tags=["portfolio-insights"])


def _active_holdings(db: DbSession, user_id: str) -> list[Holding]:
    return db.scalars(select(Holding).where(Holding.user_id == user_id, Holding.archived_at.is_(None))).all()


@router.get("/profiles", response_model=list[ExposureProfileOut])
def profiles(user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    del user
    seed_profiles(db)
    db.commit()
    return db.scalars(select(ExposureProfile).order_by(ExposureProfile.name.asc())).all()


@router.get("/perspective", response_model=PortfolioPerspectiveOut)
def perspective(user: User = Depends(get_current_user), db: DbSession = Depends(get_db)) -> PortfolioPerspectiveOut:
    seed_profiles(db)
    holdings = _active_holdings(db, user.id)
    profiles_by_code = {item.code: item for item in db.scalars(select(ExposureProfile)).all()}
    dimension_totals = {"core": {}, "asset_class": {}, "region": {}, "sector": {}}
    contributors: dict[str, list[dict]] = {}
    total_value = sum((holding.current_value_cny for holding in holdings), Decimal("0"))

    for holding in holdings:
        for mapping in ensure_holding_mapping(db, holding):
            profile = profiles_by_code[mapping.profile_code]
            mapped_value = holding.current_value_cny * mapping.weight_pct / Decimal("100")
            dimension_totals["core"][profile.name] = dimension_totals["core"].get(profile.name, Decimal("0")) + mapped_value
            contributors.setdefault(profile.name, []).append({
                "holding_id": holding.id,
                "name": holding.name,
                "value_cny": mapped_value,
                "weight_pct": mapping.weight_pct,
                "mapping_source": mapping.mapping_source,
            })
            sector_weights = profile.sector_weights
            if profile.code in {"US_STOCK", "CN_STOCK", "JP_STOCK", "KR_STOCK"}:
                sector_weights = {infer_stock_sector(holding): 100}
            for dimension, weights in (
                ("asset_class", profile.asset_class_weights),
                ("region", profile.region_weights),
                ("sector", sector_weights),
            ):
                for name, weight in weights.items():
                    value = mapped_value * Decimal(str(weight)) / Decimal("100")
                    dimension_totals[dimension][name] = dimension_totals[dimension].get(name, Decimal("0")) + value

    db.commit()
    views = {}
    for dimension, totals in dimension_totals.items():
        views[dimension] = [
            {
                "name": name,
                "value_cny": value,
                "percent": value / total_value * Decimal("100") if total_value > 0 else Decimal("0"),
                "contributors": contributors.get(name, []) if dimension == "core" else [],
            }
            for name, value in sorted(totals.items(), key=lambda item: item[1], reverse=True)
        ]
    return PortfolioPerspectiveOut(
        total_value_cny=total_value,
        unclassified_pct=next((row["percent"] for row in views["core"] if row["name"] == "其他/未分类"), Decimal("0")),
        source="持仓映射 + 内置代理模板",
        as_of_date=date.today(),
        views=views,
    )


@router.put("/holdings/{holding_id}/exposures")
def update_exposures(
    holding_id: str,
    payload: ExposureMappingIn,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    seed_profiles(db)
    holding = db.get(Holding, holding_id)
    if not holding or holding.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Holding not found")
    try:
        mappings = replace_manual_mappings(db, holding, [item.model_dump() for item in payload.items])
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    db.commit()
    return {"ok": True, "items": [{"profile_code": item.profile_code, "weight_pct": item.weight_pct} for item in mappings]}


@router.get("/holdings/{holding_id}/exposures")
def holding_exposures(
    holding_id: str,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    seed_profiles(db)
    holding = db.get(Holding, holding_id)
    if not holding or holding.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Holding not found")
    profiles_by_code = {item.code: item for item in db.scalars(select(ExposureProfile)).all()}
    mappings = ensure_holding_mapping(db, holding)
    db.commit()
    return {
        "holding_id": holding.id,
        "items": [
            {
                "profile_code": item.profile_code,
                "profile_name": profiles_by_code[item.profile_code].name,
                "weight_pct": item.weight_pct,
                "mapping_source": item.mapping_source,
                "as_of_date": item.as_of_date,
            }
            for item in mappings
        ],
    }


@router.get("/performance")
def performance(range: str = "month", user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    if range not in {"week", "month", "year", "all"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid range")
    return portfolio_performance(db, user.id, range)


@router.get("/family-safety/latest", response_model=FamilySafetyOut | None)
def latest_family_safety(user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    return db.scalar(
        select(FamilySafetySnapshot)
        .where(FamilySafetySnapshot.user_id == user.id)
        .order_by(FamilySafetySnapshot.as_of_date.desc(), FamilySafetySnapshot.created_at.desc())
    )


@router.get("/family-safety/history", response_model=list[FamilySafetyOut])
def family_safety_history(user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    return db.scalars(
        select(FamilySafetySnapshot)
        .where(FamilySafetySnapshot.user_id == user.id)
        .order_by(FamilySafetySnapshot.as_of_date.desc())
    ).all()


@router.post("/family-safety", response_model=FamilySafetyOut)
def save_family_safety(payload: FamilySafetyIn, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    as_of = payload.as_of_date or date.today()
    snapshot = FamilySafetySnapshot(
        user_id=user.id,
        term_deposits_cny=payload.term_deposits_cny,
        cash_funds_cny=payload.cash_funds_cny,
        note=payload.note,
        as_of_date=as_of,
        next_review_date=payload.next_review_date or (as_of + timedelta(days=183)),
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    return snapshot


@router.get("/family-safety/items", response_model=list[FamilySafetyItemOut])
def family_safety_items(user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    return db.scalars(
        select(FamilySafetyItem)
        .where(FamilySafetyItem.user_id == user.id, FamilySafetyItem.archived_at.is_(None))
        .order_by(FamilySafetyItem.sort_order.asc(), FamilySafetyItem.maturity_date.asc().nullslast(), FamilySafetyItem.created_at.asc())
    ).all()


@router.post("/family-safety/items", response_model=FamilySafetyItemOut)
def create_family_safety_item(payload: FamilySafetyItemIn, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    item = FamilySafetyItem(user_id=user.id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def _owned_family_safety_item(db: DbSession, user_id: str, item_id: str) -> FamilySafetyItem:
    item = db.scalar(
        select(FamilySafetyItem).where(
            FamilySafetyItem.id == item_id,
            FamilySafetyItem.user_id == user_id,
            FamilySafetyItem.archived_at.is_(None),
        )
    )
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family safety item not found")
    return item


@router.patch("/family-safety/items/{item_id}", response_model=FamilySafetyItemOut)
def update_family_safety_item(item_id: str, payload: FamilySafetyItemIn, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    item = _owned_family_safety_item(db, user.id, item_id)
    for field, value in payload.model_dump().items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/family-safety/items/{item_id}")
def archive_family_safety_item(item_id: str, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    item = _owned_family_safety_item(db, user.id, item_id)
    item.archived_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}
