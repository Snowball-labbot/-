from __future__ import annotations

import csv
import hashlib
import io
import os
import re
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from urllib.parse import urljoin, urlparse
from zoneinfo import ZoneInfo

import httpx
import yfinance as yf
from bs4 import BeautifulSoup


EASTERN = ZoneInfo("America/New_York")
UTC = timezone.utc
DEFAULT_HEADERS = {
    "User-Agent": os.getenv("RESEARCH_USER_AGENT", "PortfolioResearch/1.0 admin@example.com"),
    "Accept": "text/html,application/json,text/calendar;q=0.9,*/*;q=0.8",
}


@dataclass(slots=True)
class ExternalEvent:
    event_key: str
    event_type: str
    title: str
    scheduled_at: datetime | None
    source: str
    source_url: str | None = None
    description: str | None = None
    country: str | None = "US"
    ticker: str | None = None
    company_name: str | None = None
    indicator_code: str | None = None
    reference_period: str | None = None
    time_precision: str = "exact"
    status: str = "scheduled"
    importance: int = 2
    actual: str | None = None
    consensus: str | None = None
    previous: str | None = None
    unit: str | None = None
    published_at: datetime | None = None
    raw_data: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class ExternalNews:
    news_key: str
    title: str
    source: str
    source_url: str
    published_at: datetime
    summary: str | None = None
    source_domain: str | None = None
    ticker: str | None = None
    topic: str = "market"
    language: str = "en"
    image_url: str | None = None
    raw_data: dict[str, Any] = field(default_factory=dict)


BLS_NAMES = {
    "Consumer Price Index": "美国消费者价格指数（CPI）",
    "Producer Price Index": "美国生产者价格指数（PPI）",
    "Employment Situation": "美国非农就业报告",
    "Job Openings and Labor Turnover Survey": "美国职位空缺与劳动力流动调查（JOLTS）",
    "Employment Cost Index": "美国就业成本指数",
    "Import and Export Price Indexes": "美国进出口价格指数",
    "Productivity and Costs": "美国生产率与成本",
}


def _request(url: str, *, params: dict[str, str] | None = None) -> httpx.Response:
    with httpx.Client(headers=DEFAULT_HEADERS, timeout=30, follow_redirects=True) as client:
        response = client.get(url, params=params)
        response.raise_for_status()
        return response


def _unfold_ics(text: str) -> list[str]:
    lines: list[str] = []
    for raw in text.replace("\r\n", "\n").split("\n"):
        if raw.startswith((" ", "\t")) and lines:
            lines[-1] += raw[1:]
        else:
            lines.append(raw)
    return lines


def _ics_value(block: list[str], key: str) -> str | None:
    for line in block:
        if line.startswith(f"{key}:") or line.startswith(f"{key};"):
            return line.split(":", 1)[1].replace("\\,", ",").strip()
    return None


def _parse_ics_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    cleaned = value.strip()
    tz = UTC if cleaned.endswith("Z") else EASTERN
    cleaned = cleaned.rstrip("Z")
    for pattern in ("%Y%m%dT%H%M%S", "%Y%m%dT%H%M", "%Y%m%d"):
        try:
            parsed = datetime.strptime(cleaned, pattern)
            if pattern == "%Y%m%d":
                parsed = datetime.combine(parsed.date(), time(8, 30))
            return parsed.replace(tzinfo=tz).astimezone(UTC)
        except ValueError:
            continue
    return None


def _macro_importance(title: str) -> int:
    high_signal = ("Consumer Price", "Producer Price", "Employment Situation", "Job Openings", "Employment Cost")
    return 3 if any(name.lower() in title.lower() for name in high_signal) else 2


def _translate_bls_title(title: str) -> str:
    for key, translated in BLS_NAMES.items():
        if key.lower() in title.lower():
            return translated
    return title


def fetch_bls_events(start: datetime, end: datetime) -> list[ExternalEvent]:
    url = "https://www.bls.gov/schedule/news_release/bls.ics"
    lines = _unfold_ics(_request(url).text)
    blocks: list[list[str]] = []
    current: list[str] | None = None
    for line in lines:
        if line == "BEGIN:VEVENT":
            current = []
        elif line == "END:VEVENT" and current is not None:
            blocks.append(current)
            current = None
        elif current is not None:
            current.append(line)

    events: list[ExternalEvent] = []
    for block in blocks:
        scheduled_at = _parse_ics_datetime(_ics_value(block, "DTSTART"))
        if not scheduled_at or not (start <= scheduled_at <= end):
            continue
        raw_title = _ics_value(block, "SUMMARY") or "BLS economic release"
        uid = _ics_value(block, "UID") or f"{raw_title}:{scheduled_at.date().isoformat()}"
        events.append(ExternalEvent(
            event_key=f"bls:{uid}",
            event_type="macro",
            title=_translate_bls_title(raw_title),
            scheduled_at=scheduled_at,
            source="BLS",
            source_url="https://www.bls.gov/bls/newsrels.htm",
            indicator_code=raw_title,
            importance=_macro_importance(raw_title),
            raw_data={"official_title": raw_title, "uid": uid},
        ))
    return events


def _parse_eastern_schedule(value: str, year: int) -> datetime | None:
    cleaned = re.sub(r"\s+", " ", value).strip()
    for pattern in ("%B %d %I:%M %p", "%b %d %I:%M %p"):
        try:
            parsed = datetime.strptime(cleaned, pattern).replace(year=year, tzinfo=EASTERN)
            return parsed.astimezone(UTC)
        except ValueError:
            continue
    return None


def _bea_title(title: str) -> str:
    if title.startswith("GDP"):
        return f"美国国内生产总值：{title}"
    if title.startswith("Personal Income and Outlays"):
        return f"美国个人收入与支出（含 PCE）：{title.split(',', 1)[-1].strip()}"
    if "Trade in Goods and Services" in title:
        return f"美国国际贸易：{title.split(',', 1)[-1].strip()}"
    return title


def fetch_bea_events(start: datetime, end: datetime) -> list[ExternalEvent]:
    url = "https://www.bea.gov/news/schedule"
    soup = BeautifulSoup(_request(url).text, "html.parser")
    heading = soup.select_one("table tr")
    year_match = re.search(r"20\d{2}", heading.get_text(" ", strip=True) if heading else "")
    year = int(year_match.group(0)) if year_match else datetime.now(UTC).year
    events: list[ExternalEvent] = []
    for row in soup.select("table tr"):
        cells = row.select("td")
        if len(cells) < 3:
            continue
        scheduled_at = _parse_eastern_schedule(cells[0].get_text(" ", strip=True), year)
        if not scheduled_at or not (start <= scheduled_at <= end):
            continue
        raw_title = cells[2].get_text(" ", strip=True)
        logical_period = raw_title.rsplit(",", 1)[-1].strip() if "," in raw_title else str(year)
        key_title = re.sub(r"\W+", "-", raw_title.lower()).strip("-")[:150]
        events.append(ExternalEvent(
            event_key=f"bea:{key_title}:{logical_period}",
            event_type="macro",
            title=_bea_title(raw_title),
            scheduled_at=scheduled_at,
            source="BEA",
            source_url=url,
            indicator_code=raw_title.split(",", 1)[0],
            reference_period=logical_period,
            importance=3 if raw_title.startswith(("GDP", "Personal Income")) else 2,
            raw_data={"official_title": raw_title, "release_kind": cells[1].get_text(" ", strip=True)},
        ))
    return events


def _parse_fomc_date(text_value: str, year: int) -> date | None:
    match = re.match(r"([A-Za-z]+)(?:/[A-Za-z]+)?\s+(\d+)(?:-(\d+))?", text_value)
    if not match:
        return None
    month_name, first_day, second_day = match.groups()
    try:
        month = datetime.strptime(month_name[:3], "%b").month
    except ValueError:
        return None
    day = int(second_day or first_day)
    return date(year, month, day)


def fetch_fomc_events(start: datetime, end: datetime) -> list[ExternalEvent]:
    url = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"
    soup = BeautifulSoup(_request(url).text, "html.parser")
    events: list[ExternalEvent] = []
    for heading in soup.find_all("h4"):
        year_match = re.search(r"(20\d{2}) FOMC Meetings", heading.get_text(" ", strip=True))
        if not year_match:
            continue
        year = int(year_match.group(1))
        panel = heading.find_parent("div", class_="panel")
        if not panel:
            continue
        for meeting in panel.select(".fomc-meeting"):
            month_node = meeting.select_one(".fomc-meeting__month")
            date_node = meeting.select_one(".fomc-meeting__date")
            if not month_node or not date_node:
                continue
            text_value = meeting.get_text(" ", strip=True)
            date_text = date_node.get_text(" ", strip=True).replace("*", "")
            meeting_date = _parse_fomc_date(f"{month_node.get_text(' ', strip=True)} {date_text}", year)
            if not meeting_date:
                continue
            scheduled_at = datetime.combine(meeting_date, time(14, 0), EASTERN).astimezone(UTC)
            if not (start <= scheduled_at <= end):
                continue
            has_statement = "Statement:" in text_value
            events.append(ExternalEvent(
                event_key=f"fed:fomc:{meeting_date.isoformat()}",
                event_type="macro",
                title="美联储 FOMC 利率决议",
                scheduled_at=scheduled_at,
                source="Federal Reserve",
                source_url=url,
                indicator_code="FOMC",
                reference_period=meeting_date.isoformat(),
                status="published" if has_statement and scheduled_at <= datetime.now(UTC) else "scheduled",
                importance=3,
                published_at=scheduled_at if has_statement and scheduled_at <= datetime.now(UTC) else None,
                raw_data={"meeting_text": text_value[:1000]},
            ))
    return events


def fetch_alpha_vantage_earnings(symbols: set[str], api_key: str) -> list[ExternalEvent]:
    if not symbols or not api_key:
        return []
    response = _request("https://www.alphavantage.co/query", params={
        "function": "EARNINGS_CALENDAR",
        "horizon": "3month",
        "apikey": api_key,
    })
    reader = csv.DictReader(io.StringIO(response.text))
    events: list[ExternalEvent] = []
    for row in reader:
        symbol = (row.get("symbol") or "").upper()
        if symbol not in symbols:
            continue
        report_date = row.get("reportDate") or ""
        try:
            release_date = date.fromisoformat(report_date)
        except ValueError:
            continue
        period = row.get("fiscalDateEnding") or report_date
        release_window = (row.get("timeOfTheDay") or "").lower()
        release_time = time(8, 0) if release_window == "pre-market" else time(16, 15) if release_window == "post-market" else time(12, 0)
        scheduled_at = datetime.combine(release_date, release_time, EASTERN).astimezone(UTC)
        events.append(ExternalEvent(
            event_key=f"earnings:{symbol}:{period}",
            event_type="earnings",
            title=f"{symbol} 财报发布",
            scheduled_at=scheduled_at,
            source="Alpha Vantage",
            source_url="https://www.alphavantage.co/documentation/#earnings-calendar",
            ticker=symbol,
            company_name=row.get("name") or symbol,
            reference_period=period,
            time_precision="window" if release_window else "date",
            importance=3,
            consensus=row.get("estimate") or None,
            unit=row.get("currency") or None,
            raw_data=dict(row),
        ))
    return events


def fetch_yahoo_earnings(symbols: set[str], days_forward: int = 120) -> list[ExternalEvent]:
    """Best-effort fallback when no calendar API key is configured."""
    now = datetime.now(UTC)
    cutoff = now + timedelta(days=days_forward)
    events: list[ExternalEvent] = []
    for symbol in sorted(symbols):
        try:
            calendar = yf.Ticker(symbol).calendar or {}
        except Exception:
            continue
        raw_dates = calendar.get("Earnings Date") or calendar.get("EarningsDate") or []
        if not isinstance(raw_dates, (list, tuple)):
            raw_dates = [raw_dates]
        for raw_date in raw_dates:
            if hasattr(raw_date, "to_pydatetime"):
                raw_date = raw_date.to_pydatetime()
            if isinstance(raw_date, date) and not isinstance(raw_date, datetime):
                scheduled_at = datetime.combine(raw_date, time(16, 15), EASTERN).astimezone(UTC)
            elif isinstance(raw_date, datetime):
                scheduled_at = raw_date
                if scheduled_at.tzinfo is None:
                    scheduled_at = scheduled_at.replace(tzinfo=EASTERN)
                scheduled_at = scheduled_at.astimezone(UTC)
            else:
                continue
            if not (now - timedelta(days=1) <= scheduled_at <= cutoff):
                continue
            def serializable(value: Any) -> Any:
                if value is None or isinstance(value, (str, int, float, bool)):
                    return value
                if hasattr(value, "item"):
                    return value.item()
                return str(value)

            events.append(ExternalEvent(
                event_key=f"earnings:{symbol}:{scheduled_at.date().isoformat()}",
                event_type="earnings",
                title=f"{symbol} 财报发布",
                scheduled_at=scheduled_at,
                source="Yahoo Finance",
                source_url=f"https://finance.yahoo.com/quote/{symbol}/",
                ticker=symbol,
                company_name=symbol,
                reference_period=scheduled_at.date().isoformat(),
                time_precision="window",
                importance=3,
                consensus=str(calendar.get("Earnings Average")) if calendar.get("Earnings Average") is not None else None,
                raw_data={
                    "earnings_low": serializable(calendar.get("Earnings Low")),
                    "earnings_high": serializable(calendar.get("Earnings High")),
                    "revenue_average": serializable(calendar.get("Revenue Average")),
                },
            ))
            break
    return events


def _news_datetime(value: Any) -> datetime | None:
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, UTC)
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)
    except ValueError:
        return None


def fetch_yahoo_company_news(symbols: set[str], per_symbol: int = 4) -> list[ExternalNews]:
    items: list[ExternalNews] = []
    for symbol in sorted(symbols):
        try:
            rows = yf.Search(symbol, news_count=max(per_symbol * 2, 8)).news
        except Exception:
            continue
        for raw in rows:
            related_tickers = {
                str(ticker).strip().upper()
                for ticker in raw.get("relatedTickers", [])
                if ticker
            }
            if related_tickers and symbol not in related_tickers:
                continue
            url = str(raw.get("link") or "").strip()
            title = str(raw.get("title") or "").strip()
            published_at = _news_datetime(raw.get("providerPublishTime"))
            if not url or not title or not published_at:
                continue
            thumbnail = raw.get("thumbnail") if isinstance(raw.get("thumbnail"), dict) else {}
            resolutions = thumbnail.get("resolutions") if isinstance(thumbnail.get("resolutions"), list) else []
            image_url = resolutions[0].get("url") if resolutions else None
            raw_key = str(raw.get("uuid") or hashlib.sha256(url.encode("utf-8")).hexdigest())
            items.append(ExternalNews(
                news_key=f"company:{symbol}:{raw_key}"[:255],
                title=title,
                source=str(raw.get("publisher") or "Yahoo Finance")[:128],
                source_domain=urlparse(url).netloc,
                source_url=url,
                published_at=published_at,
                ticker=symbol,
                topic="company",
                image_url=image_url,
                raw_data={"content_type": raw.get("type"), "related_tickers": sorted(related_tickers)},
            ))
            if sum(1 for item in items if item.ticker == symbol) >= per_symbol:
                break
    return items


def fetch_yahoo_macro_news() -> list[ExternalNews]:
    queries = (
        "Federal Reserve inflation",
        "US economy GDP employment",
        "US Treasury yields dollar",
    )
    items: list[ExternalNews] = []
    seen_urls: set[str] = set()
    for query in queries:
        try:
            rows = yf.Search(query, news_count=8).news
        except Exception:
            continue
        for raw in rows:
            url = str(raw.get("link") or "").strip()
            title = str(raw.get("title") or "").strip()
            published_at = _news_datetime(raw.get("providerPublishTime"))
            if not url or url in seen_urls or not title or not published_at:
                continue
            seen_urls.add(url)
            thumbnail = raw.get("thumbnail") if isinstance(raw.get("thumbnail"), dict) else {}
            resolutions = thumbnail.get("resolutions") if isinstance(thumbnail.get("resolutions"), list) else []
            image_url = resolutions[0].get("url") if resolutions else None
            raw_key = str(raw.get("uuid") or hashlib.sha256(url.encode("utf-8")).hexdigest())
            items.append(ExternalNews(
                news_key=f"macro:{raw_key}"[:255],
                title=title,
                source=str(raw.get("publisher") or "Yahoo Finance")[:128],
                source_domain=urlparse(url).netloc,
                source_url=url,
                published_at=published_at,
                topic="macro",
                image_url=image_url,
                raw_data={"query": query, "content_type": raw.get("type")},
            ))
    return items


def fetch_sec_ticker_map() -> dict[str, dict[str, Any]]:
    response = _request("https://www.sec.gov/files/company_tickers.json")
    payload = response.json()
    return {
        str(item.get("ticker", "")).upper(): item
        for item in payload.values()
        if item.get("ticker")
    }


def fetch_sec_filings(symbol: str, cik: str, since: date) -> list[ExternalEvent]:
    padded_cik = str(cik).zfill(10)
    url = f"https://data.sec.gov/submissions/CIK{padded_cik}.json"
    payload = _request(url).json()
    recent = payload.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    events: list[ExternalEvent] = []
    accepted = recent.get("acceptanceDateTime", [])
    for index, form in enumerate(forms):
        if form not in {"8-K", "10-Q", "10-K", "20-F", "6-K"}:
            continue
        filed = (recent.get("filingDate", []) or [""])[index]
        try:
            filed_date = date.fromisoformat(filed)
        except ValueError:
            continue
        if filed_date < since:
            continue
        accession = recent.get("accessionNumber", [""])[index]
        primary = recent.get("primaryDocument", [""])[index]
        accepted_value = accepted[index] if index < len(accepted) else ""
        try:
            published_at = datetime.fromisoformat(accepted_value.replace("Z", "+00:00")).astimezone(UTC)
        except ValueError:
            published_at = datetime.combine(filed_date, time(12), EASTERN).astimezone(UTC)
        accession_path = accession.replace("-", "")
        filing_url = f"https://www.sec.gov/Archives/edgar/data/{int(padded_cik)}/{accession_path}/{primary}"
        events.append(ExternalEvent(
            event_key=f"sec:{accession}",
            event_type="filing",
            title=f"{symbol} 提交 {form}",
            scheduled_at=published_at,
            source="SEC EDGAR",
            source_url=filing_url,
            ticker=symbol,
            company_name=payload.get("name") or symbol,
            reference_period=(recent.get("reportDate", [""])[index] or filed),
            status="published",
            importance=3 if form in {"10-Q", "10-K", "20-F"} else 2,
            published_at=published_at,
            raw_data={"form": form, "accession": accession, "primary_document": primary},
        ))
    return events
