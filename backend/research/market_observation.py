from __future__ import annotations

import csv
import html
import io
import logging
import threading
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

import httpx
import yfinance as yf
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import MarketScoreSnapshot
from .sources import DEFAULT_HEADERS


UTC = timezone.utc
logger = logging.getLogger(__name__)
_cache_lock = threading.Lock()
_social_cache: tuple[datetime, list[dict[str, Any]]] | None = None
_score_cache: tuple[datetime, list[dict[str, Any]]] | None = None
SCORE_ASSETS = (
    ("SPY", "标普 500"),
    ("QQQ", "纳斯达克 100"),
    ("GLD", "黄金"),
    ("BTC-USD", "比特币"),
)


def _clamp(value: float, low: float = 0, high: float = 100) -> float:
    return max(low, min(high, value))


def social_top_ten(force: bool = False) -> list[dict[str, Any]]:
    global _social_cache
    with _cache_lock:
        if not force and _social_cache and datetime.now(UTC) - _social_cache[0] < timedelta(minutes=15):
            return _social_cache[1]
    try:
        with httpx.Client(headers=DEFAULT_HEADERS, timeout=20, follow_redirects=True) as client:
            response = client.get("https://apewisdom.io/api/v1.0/filter/all-stocks/page/1")
            response.raise_for_status()
            rows = response.json().get("results", [])[:10]
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        logger.warning("ApeWisdom unavailable, using cached or empty result: %s", exc)
        with _cache_lock:
            return _social_cache[1] if _social_cache else []
    normalized = [{
        "rank": int(item.get("rank") or 0),
        "ticker": str(item.get("ticker") or ""),
        "name": html.unescape(str(item.get("name") or item.get("ticker") or "")),
        "mentions": int(item.get("mentions") or 0),
        "upvotes": int(item.get("upvotes") or 0),
        "rank_24h_ago": int(item["rank_24h_ago"]) if item.get("rank_24h_ago") is not None else None,
        "mentions_24h_ago": int(item["mentions_24h_ago"]) if item.get("mentions_24h_ago") is not None else None,
    } for item in rows]
    with _cache_lock:
        _social_cache = (datetime.now(UTC), normalized)
    return normalized


def _fred_latest(series_id: str) -> float | None:
    url = "https://fred.stlouisfed.org/graph/fredgraph.csv"
    with httpx.Client(headers=DEFAULT_HEADERS, timeout=20, follow_redirects=True) as client:
        response = client.get(url, params={"id": series_id})
        response.raise_for_status()
    rows = list(csv.DictReader(io.StringIO(response.text)))
    for row in reversed(rows):
        value = row.get(series_id)
        if value and value != ".":
            try:
                return float(value)
            except ValueError:
                continue
    return None


def _safe_fred_latest(series_id: str) -> float | None:
    try:
        return _fred_latest(series_id)
    except (httpx.HTTPError, csv.Error, ValueError):
        return None


def _safe_info(ticker: yf.Ticker) -> dict[str, Any]:
    try:
        return ticker.info or {}
    except Exception:
        return {}


def _calculate_score(symbol: str, label: str) -> dict[str, Any]:
    ticker = yf.Ticker(symbol)
    history = ticker.history(period="1y", interval="1d", auto_adjust=True)
    if history.empty or len(history) < 120:
        raise RuntimeError(f"Insufficient market history for {symbol}")
    close = history["Close"].dropna()
    latest = float(close.iloc[-1])
    ma50 = float(close.tail(50).mean())
    ma200 = float(close.tail(min(200, len(close))).mean())
    six_month_start = float(close.iloc[max(0, len(close) - 126)])
    return_6m = (latest / six_month_start - 1) * 100 if six_month_start else 0
    trend_score = (
        (30 if latest >= ma200 else 0)
        + (25 if latest >= ma50 else 0)
        + (20 if ma50 >= ma200 else 0)
        + _clamp(12.5 + return_6m * 1.25, 0, 25)
    )

    info = _safe_info(ticker)
    pe = info.get("trailingPE") or info.get("forwardPE")
    pe_ranges = {"SPY": (16, 30), "QQQ": (20, 40)}
    pe_low, pe_high = pe_ranges.get(symbol, (0, 0))
    valuation_score = (
        50
        if not pe or symbol not in pe_ranges
        else _clamp((pe_high - float(pe)) / (pe_high - pe_low) * 100)
    )

    real_yield = _safe_fred_latest("DFII10")
    yield_curve = _safe_fred_latest("T10Y2Y")
    real_yield_score = 50 if real_yield is None else _clamp(100 - (real_yield - 0.25) / 2.75 * 100)
    curve_score = 50 if yield_curve is None else _clamp(50 + yield_curve * 30)
    macro_score = real_yield_score * 0.65 + curve_score * 0.35

    try:
        vix_history = yf.Ticker("^VIX").history(period="5d", interval="1d", auto_adjust=False)
        vix = float(vix_history["Close"].dropna().iloc[-1]) if not vix_history.empty else 20
    except Exception:
        vix = 20
    volatility_score = _clamp(100 - max(0, vix - 12) / 33 * 95)

    weights = {
        "SPY": (0.35, 0.25, 0.25, 0.15),
        "QQQ": (0.30, 0.25, 0.30, 0.15),
        "GLD": (0.00, 0.40, 0.40, 0.20),
        "BTC-USD": (0.00, 0.45, 0.30, 0.25),
    }[symbol]
    score = (
        valuation_score * weights[0]
        + trend_score * weights[1]
        + macro_score * weights[2]
        + volatility_score * weights[3]
    )
    return {
        "symbol": symbol,
        "label": label,
        "score": round(score, 2),
        "valuation_score": round(valuation_score, 2),
        "trend_score": round(trend_score, 2),
        "macro_score": round(macro_score, 2),
        "volatility_score": round(volatility_score, 2),
        "as_of_date": date.today(),
        "data": {
            "price": round(latest, 2),
            "ma50": round(ma50, 2),
            "ma200": round(ma200, 2),
            "return_6m_pct": round(return_6m, 2),
            "pe": round(float(pe), 2) if pe else None,
            "valuation_available": symbol in pe_ranges and bool(pe),
            "real_yield_10y": real_yield,
            "yield_curve_10y_2y": yield_curve,
            "vix": round(vix, 2),
            "methodology": {
                "valuation": int(weights[0] * 100),
                "trend": int(weights[1] * 100),
                "macro": int(weights[2] * 100),
                "volatility": int(weights[3] * 100),
            },
        },
    }


def market_scores(db: Session, force: bool = False) -> list[dict[str, Any]]:
    global _score_cache
    with _cache_lock:
        if not force and _score_cache and datetime.now(UTC) - _score_cache[0] < timedelta(minutes=30):
            return _score_cache[1]
    results: list[dict[str, Any]] = []
    for symbol, label in SCORE_ASSETS:
        try:
            result = _calculate_score(symbol, label)
        except Exception:
            latest = db.scalar(
                select(MarketScoreSnapshot)
                .where(MarketScoreSnapshot.symbol == symbol)
                .order_by(MarketScoreSnapshot.as_of_date.desc())
            )
            if latest:
                result = {
                    "symbol": latest.symbol,
                    "label": latest.label,
                    "score": float(latest.score),
                    "valuation_score": float(latest.valuation_score),
                    "trend_score": float(latest.trend_score),
                    "macro_score": float(latest.macro_score),
                    "volatility_score": float(latest.volatility_score),
                    "as_of_date": latest.as_of_date,
                    "data": {**latest.data, "stale": True},
                }
            else:
                continue
        snapshot = db.scalar(select(MarketScoreSnapshot).where(
            MarketScoreSnapshot.symbol == symbol,
            MarketScoreSnapshot.as_of_date == result["as_of_date"],
        ))
        if snapshot is None:
            snapshot = MarketScoreSnapshot(symbol=symbol, label=label, as_of_date=result["as_of_date"])
            db.add(snapshot)
        snapshot.score = Decimal(str(result["score"]))
        snapshot.valuation_score = Decimal(str(result["valuation_score"]))
        snapshot.trend_score = Decimal(str(result["trend_score"]))
        snapshot.macro_score = Decimal(str(result["macro_score"]))
        snapshot.volatility_score = Decimal(str(result["volatility_score"]))
        snapshot.data = result["data"]
        results.append(result)
    db.commit()
    with _cache_lock:
        _score_cache = (datetime.now(UTC), results)
    return results


def score_history(db: Session, symbol: str, days: int = 365) -> list[MarketScoreSnapshot]:
    cutoff = date.today() - timedelta(days=days)
    return db.scalars(
        select(MarketScoreSnapshot)
        .where(MarketScoreSnapshot.symbol == symbol.upper(), MarketScoreSnapshot.as_of_date >= cutoff)
        .order_by(MarketScoreSnapshot.as_of_date)
    ).all()
