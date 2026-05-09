from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status

from ..dependencies import get_current_user
from ..market_data import MarketDataError, get_quote, search_instrument
from ..models import User
from ..schemas import MarketQuoteOut, MarketSearchResult

router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/search", response_model=list[MarketSearchResult])
def search_market(q: str, market: str = "CN", user: User = Depends(get_current_user)) -> list[dict]:
    try:
        return search_instrument(q, market)
    except MarketDataError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc


@router.get("/quote", response_model=MarketQuoteOut)
def quote_market(market: str, symbol: str, kind: str = "fund", user: User = Depends(get_current_user)) -> dict:
    try:
        quote = get_quote(market, symbol, kind)
    except MarketDataError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    # Keep the wire shape stable even when upstream returns Decimal-like objects.
    quote["exchange_rate_to_cny"] = Decimal(quote["exchange_rate_to_cny"])
    quote["price"] = Decimal(quote["price"])
    return quote
