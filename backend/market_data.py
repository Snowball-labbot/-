from datetime import datetime, timezone
from decimal import Decimal
from functools import lru_cache
from typing import Any

import requests


class MarketDataError(RuntimeError):
    pass


EASTMONEY_UT = "bd1d9ddb04089700cf9c27f6f7426281"
REQUEST_TIMEOUT_SECONDS = 8


def _akshare():
    try:
        import akshare as ak  # type: ignore
    except Exception as exc:
        raise MarketDataError("AKShare is not installed or failed to import") from exc
    return ak


def _request_json(url: str, params: dict[str, Any]) -> dict[str, Any]:
    try:
        response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        return response.json()
    except Exception as exc:
        raise MarketDataError(f"Market request failed: {exc}") from exc


def _to_decimal(value: Any) -> Decimal:
    if value is None:
        raise MarketDataError("Missing price")
    text = str(value).replace(",", "").strip()
    if text in {"", "-", "nan", "None"}:
        raise MarketDataError("Invalid price")
    return Decimal(text)


def _parse_date(value: Any) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    try:
        return datetime.fromisoformat(str(value)).replace(tzinfo=timezone.utc)
    except Exception:
        return datetime.now(timezone.utc)


def _clean_us_symbol(symbol: str) -> str:
    return symbol.split(".")[-1].upper()


def _eastmoney_search_us(query: str) -> list[dict[str, Any]]:
    data = _request_json(
        "https://searchapi.eastmoney.com/api/suggest/get",
        {"input": query, "type": "14", "token": "D43BF722C8E33BDC906FB84D85E326E8"},
    )
    table = data.get("QuotationCodeTable") or {}
    rows = table.get("Data") or []
    results: list[dict[str, Any]] = []
    for row in rows[:8]:
        symbol = str(row.get("Code") or row.get("UnifiedCode") or "").upper()
        quote_id = str(row.get("QuoteID") or "")
        if not symbol or not quote_id:
            continue
        results.append({
            "symbol": symbol,
            "name": str(row.get("Name") or symbol),
            "market": "US",
            "kind": "stock",
            "currency": "USD",
            "quote_source": "eastmoney:suggest",
        })
    return results


def _eastmoney_us_quote(symbol: str) -> dict[str, Any]:
    candidates = _eastmoney_search_us(symbol)
    target = _clean_us_symbol(symbol)
    match = next((item for item in candidates if item["symbol"].upper() == target), None)
    if not match and candidates:
        match = candidates[0]
    if not match:
        raise MarketDataError(f"No US stock quote found for {symbol}")

    quote_id = f"105.{match['symbol']}"
    data = _request_json(
        "https://push2.eastmoney.com/api/qt/ulist.np/get",
        {
            "secids": quote_id,
            "ut": EASTMONEY_UT,
            "fltt": "2",
            "fields": "f12,f13,f14,f2,f3,f4,f17,f18",
        },
    )
    rows = ((data.get("data") or {}).get("diff") or [])
    if not rows:
        raise MarketDataError(f"No US stock quote found for {symbol}")
    row = rows[0]
    return {
        "symbol": match["symbol"],
        "name": match["name"],
        "market": "US",
        "kind": "stock",
        "currency": "USD",
        "price": _to_decimal(row.get("f2")),
        "exchange_rate_to_cny": get_usd_cny_rate(),
        "price_updated_at": datetime.now(timezone.utc),
        "quote_source": "eastmoney:us_quote",
    }


def _eastmoney_fund_search(query: str) -> list[dict[str, Any]]:
    data = _request_json(
        "https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx",
        {"m": "1", "key": query},
    )
    rows = data.get("Datas") or []
    results: list[dict[str, Any]] = []
    for row in rows[:8]:
        base = row.get("FundBaseInfo") or {}
        symbol = str(row.get("CODE") or base.get("FCODE") or "")
        if not symbol:
            continue
        item: dict[str, Any] = {
            "symbol": symbol,
            "name": str(row.get("NAME") or base.get("SHORTNAME") or f"Fund {symbol}"),
            "market": "CN",
            "kind": "fund",
            "currency": "CNY",
            "quote_source": "eastmoney:fund_suggest",
        }
        if base.get("DWJZ") not in {None, "", "-"}:
            item["price"] = _to_decimal(base.get("DWJZ"))
        if base.get("FSRQ"):
            item["price_updated_at"] = _parse_date(base.get("FSRQ"))
        results.append(item)
    return results


def get_usd_cny_rate() -> Decimal:
    try:
        data = _request_json(
            "https://push2.eastmoney.com/api/qt/clist/get",
            {
                "np": "1",
                "fltt": "2",
                "invt": "2",
                "fs": "m:119,m:120,m:133",
                "fields": "f12,f13,f14,f2",
                "fid": "f3",
                "pn": "1",
                "pz": "300",
                "po": "1",
                "dect": "1",
                "wbp2u": "|0|0|0|web",
            },
        )
        rows = ((data.get("data") or {}).get("diff") or [])
        for row in rows:
            code = str(row.get("f12") or "").upper()
            name = str(row.get("f14") or "")
            if "USDCNY" in code or "美元人民币" in name:
                return _to_decimal(row.get("f2"))
    except Exception:
        pass

    return _akshare_usd_cny_rate()


def _akshare_usd_cny_rate() -> Decimal:
    ak = _akshare()
    code_key = "\u4ee3\u7801"
    name_key = "\u540d\u79f0"
    latest_key = "\u6700\u65b0\u4ef7"
    df = ak.forex_spot_em()
    for row in df.to_dict("records"):
        code = str(row.get(code_key, "")).upper()
        name = str(row.get(name_key, ""))
        if "USDCNY" in code or "\u7f8e\u5143\u4eba\u6c11\u5e01" in name:
            return _to_decimal(row.get(latest_key))
    raise MarketDataError("Unable to fetch USD/CNY rate")


def get_fund_quote(symbol: str) -> dict[str, Any]:
    for item in _eastmoney_fund_search(symbol):
        if item["symbol"] == symbol and item.get("price") is not None:
            return {
                **item,
                "exchange_rate_to_cny": Decimal("1"),
                "quote_source": "eastmoney:fund_suggest",
            }

    ak = _akshare()
    df = ak.fund_open_fund_info_em(symbol=symbol, indicator="\u5355\u4f4d\u51c0\u503c\u8d70\u52bf")
    if df.empty:
        raise MarketDataError(f"No fund quote found for {symbol}")
    latest = df.iloc[-1].to_dict()
    price = _to_decimal(latest.get("\u5355\u4f4d\u51c0\u503c"))
    name = f"Fund {symbol}"
    for row in _fund_name_records():
        if str(row.get("\u57fa\u91d1\u4ee3\u7801", "")) == symbol:
            name = str(row.get("\u57fa\u91d1\u7b80\u79f0") or row.get("\u57fa\u91d1\u540d\u79f0") or name)
            break
    return {
        "symbol": symbol,
        "name": name,
        "market": "CN",
        "kind": "fund",
        "currency": "CNY",
        "price": price,
        "exchange_rate_to_cny": Decimal("1"),
        "price_updated_at": _parse_date(latest.get("\u51c0\u503c\u65e5\u671f")),
        "quote_source": "akshare:fund_open_fund_info_em",
    }


@lru_cache(maxsize=1)
def _fund_name_records() -> list[dict[str, Any]]:
    try:
        df = _akshare().fund_name_em()
    except Exception:
        return []
    return df.to_dict("records")


def get_us_stock_quote(symbol: str) -> dict[str, Any]:
    try:
        return _eastmoney_us_quote(symbol)
    except Exception as eastmoney_error:
        target = _clean_us_symbol(symbol)
        code_key = "\u4ee3\u7801"
        name_key = "\u540d\u79f0"
        latest_key = "\u6700\u65b0\u4ef7"
        try:
            df = _akshare().stock_us_spot_em()
            for row in df.to_dict("records"):
                code = str(row.get(code_key, ""))
                short_code = _clean_us_symbol(code)
                name = str(row.get(name_key, ""))
                if short_code == target or code.upper() == symbol.upper() or name.upper() == target:
                    return {
                        "symbol": short_code,
                        "name": name,
                        "market": "US",
                        "kind": "stock",
                        "currency": "USD",
                        "price": _to_decimal(row.get(latest_key)),
                        "exchange_rate_to_cny": get_usd_cny_rate(),
                        "price_updated_at": datetime.now(timezone.utc),
                        "quote_source": "akshare:stock_us_spot_em",
                    }
        except Exception as akshare_error:
            raise MarketDataError(f"{eastmoney_error}; {akshare_error}") from akshare_error
        raise MarketDataError(f"No US stock quote found for {symbol}")


def get_quote(market: str, symbol: str, kind: str | None = None) -> dict[str, Any]:
    market = market.upper()
    selected_kind = (kind or "").lower()
    if market == "US":
        return get_us_stock_quote(symbol)
    if market == "CN" and selected_kind in {"", "fund", "etf"}:
        return get_fund_quote(symbol)
    raise MarketDataError(f"Unsupported market/kind: {market}/{kind}")


def search_instrument(query: str, market: str = "CN") -> list[dict[str, Any]]:
    q = query.strip()
    if len(q) < 2:
        return []

    market = market.upper()
    if market == "US":
        return _eastmoney_search_us(q)

    results = _eastmoney_fund_search(q)
    if results:
        return results

    records = _fund_name_records()
    fallback: list[dict[str, Any]] = []
    for row in records:
        code = str(row.get("\u57fa\u91d1\u4ee3\u7801", ""))
        name = str(row.get("\u57fa\u91d1\u7b80\u79f0") or row.get("\u57fa\u91d1\u540d\u79f0") or "")
        if q in code or q.lower() in name.lower():
            fallback.append({
                "symbol": code,
                "name": name or f"Fund {code}",
                "market": "CN",
                "kind": "fund",
                "currency": "CNY",
                "quote_source": "akshare:fund_name_em",
            })
        if len(fallback) >= 8:
            break

    if not fallback and q.isdigit() and len(q) == 6:
        fallback.append({
            "symbol": q,
            "name": f"Fund {q}",
            "market": "CN",
            "kind": "fund",
            "currency": "CNY",
            "quote_source": "manual",
        })
    return fallback
