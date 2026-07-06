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


def _yfinance():
    try:
        import yfinance as yf  # type: ignore
    except Exception as exc:
        raise MarketDataError("yfinance is not installed or failed to import") from exc
    return yf


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


def _get_attr_or_item(value: Any, key: str) -> Any:
    if isinstance(value, dict):
        return value.get(key)
    return getattr(value, key, None)


def _first_value(source: Any, *keys: str) -> Any:
    for key in keys:
        value = _get_attr_or_item(source, key)
        if value is not None and str(value).strip() not in {"", "-", "nan", "None"}:
            return value
    return None


def _parse_market_time(value: Any) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    try:
        return datetime.fromtimestamp(float(value), tz=timezone.utc)
    except Exception:
        return _parse_date(value)


def _normalize_yahoo_symbol(symbol: str, market: str) -> str:
    text = symbol.strip().upper()
    if market == "KR":
        if text.endswith((".KS", ".KQ")):
            return text
        if text.isdigit() and len(text) == 6:
            return f"{text}.KS"
    return text


def _yahoo_quote_candidates(query: str, market: str) -> list[str]:
    text = query.strip().upper()
    if not text:
        return []
    if market == "KR":
        if text.endswith((".KS", ".KQ")):
            return [text]
        if text.isdigit() and len(text) == 6:
            return [f"{text}.KS", f"{text}.KQ"]
    return [_normalize_yahoo_symbol(text, market)]


def _quote_from_yahoo_ticker(symbol: str, market: str) -> dict[str, Any]:
    yf = _yfinance()
    ticker_symbol = _normalize_yahoo_symbol(symbol, market)
    ticker = yf.Ticker(ticker_symbol)

    fast_info: Any = {}
    try:
        fast_info = ticker.fast_info
    except Exception:
        fast_info = {}

    info: dict[str, Any] = {}
    try:
        info = ticker.info or {}
    except Exception:
        info = {}

    price = _first_value(
        fast_info,
        "last_price",
        "lastPrice",
        "regular_market_price",
        "regularMarketPrice",
        "previous_close",
        "previousClose",
    )
    if price is None:
        price = _first_value(info, "regularMarketPrice", "currentPrice", "previousClose", "open")

    currency = str(_first_value(fast_info, "currency") or info.get("currency") or ("KRW" if market == "KR" else "USD"))
    name = str(info.get("shortName") or info.get("longName") or info.get("displayName") or ticker_symbol)
    updated_at = _parse_market_time(
        info.get("regularMarketTime") or _first_value(fast_info, "last_trade_time", "lastTradeTime")
    )
    price_decimal = _to_decimal(price)
    exchange_rate = Decimal("1")
    if currency.upper() == "USD":
        exchange_rate = get_usd_cny_rate()
    elif currency.upper() == "KRW":
        exchange_rate = get_krw_cny_rate()
    elif currency.upper() != "CNY":
        raise MarketDataError(f"Unsupported Yahoo quote currency: {currency}")

    return {
        "symbol": ticker_symbol,
        "name": name,
        "market": market,
        "kind": "stock",
        "currency": currency.upper(),
        "price": price_decimal,
        "exchange_rate_to_cny": exchange_rate,
        "price_updated_at": updated_at,
        "quote_source": "yahoo:yfinance",
    }


def _yahoo_search(query: str, market: str) -> list[dict[str, Any]]:
    yf = _yfinance()
    results: list[dict[str, Any]] = []

    try:
        search = yf.Search(query, max_results=12)
        rows = getattr(search, "quotes", []) or []
    except Exception:
        rows = []

    for row in rows:
        symbol = str(_first_value(row, "symbol") or "").upper()
        if not symbol:
            continue
        if market == "KR" and not symbol.endswith((".KS", ".KQ")):
            continue
        if market == "US" and "." in symbol:
            continue
        quote_type = str(_first_value(row, "quoteType") or "").upper()
        if quote_type and quote_type not in {"EQUITY", "ETF"}:
            continue
        name = str(_first_value(row, "shortname", "shortName", "longname", "longName", "name") or symbol)
        currency = str(_first_value(row, "currency") or ("KRW" if market == "KR" else "USD")).upper()
        item: dict[str, Any] = {
            "symbol": symbol,
            "name": name,
            "market": market,
            "kind": "stock",
            "currency": currency,
            "quote_source": "yahoo:search",
        }
        price = _first_value(row, "regularMarketPrice", "price")
        if price is not None:
            item["price"] = _to_decimal(price)
            item["price_updated_at"] = datetime.now(timezone.utc)
        results.append(item)
        if len(results) >= 8:
            return results

    if market == "KR" and results:
        return results

    seen = {item["symbol"] for item in results}
    for symbol in _yahoo_quote_candidates(query, market):
        if symbol in seen:
            continue
        try:
            quote = _quote_from_yahoo_ticker(symbol, market)
        except Exception:
            continue
        results.append({
            "symbol": quote["symbol"],
            "name": quote["name"],
            "market": market,
            "kind": "stock",
            "currency": quote["currency"],
            "price": quote["price"],
            "price_updated_at": quote["price_updated_at"],
            "quote_source": "yahoo:yfinance",
        })
        if len(results) >= 8:
            break

    return results


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


def get_krw_cny_rate() -> Decimal:
    try:
        yf = _yfinance()
        ticker = yf.Ticker("KRWCNY=X")
        fast_info: Any = {}
        try:
            fast_info = ticker.fast_info
        except Exception:
            fast_info = {}
        info: dict[str, Any] = {}
        try:
            info = ticker.info or {}
        except Exception:
            info = {}
        price = _first_value(
            fast_info,
            "last_price",
            "lastPrice",
            "regular_market_price",
            "regularMarketPrice",
            "previous_close",
            "previousClose",
        )
        if price is None:
            price = _first_value(info, "regularMarketPrice", "currentPrice", "previousClose")
        return _to_decimal(price)
    except Exception as exc:
        raise MarketDataError("Unable to fetch KRW/CNY rate") from exc


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
        return _quote_from_yahoo_ticker(symbol, "US")
    except Exception as yahoo_error:
        pass

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
            raise MarketDataError(f"{yahoo_error}; {eastmoney_error}; {akshare_error}") from akshare_error
        raise MarketDataError(f"No US stock quote found for {symbol}")


def get_kr_stock_quote(symbol: str) -> dict[str, Any]:
    errors: list[str] = []
    for candidate in _yahoo_quote_candidates(symbol, "KR"):
        try:
            return _quote_from_yahoo_ticker(candidate, "KR")
        except Exception as exc:
            errors.append(str(exc))
    detail = "; ".join(errors) if errors else symbol
    raise MarketDataError(f"No KR stock quote found for {symbol}: {detail}")


def get_quote(market: str, symbol: str, kind: str | None = None) -> dict[str, Any]:
    market = market.upper()
    selected_kind = (kind or "").lower()
    if market == "US":
        return get_us_stock_quote(symbol)
    if market == "KR":
        return get_kr_stock_quote(symbol)
    if market == "CN" and selected_kind in {"", "fund", "etf"}:
        return get_fund_quote(symbol)
    raise MarketDataError(f"Unsupported market/kind: {market}/{kind}")


def search_instrument(query: str, market: str = "CN") -> list[dict[str, Any]]:
    q = query.strip()
    if len(q) < 2:
        return []

    market = market.upper()
    if market == "US":
        yahoo_results = _yahoo_search(q, "US")
        if yahoo_results:
            return yahoo_results
        return _eastmoney_search_us(q)

    if market == "KR":
        return _yahoo_search(q, "KR")

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
