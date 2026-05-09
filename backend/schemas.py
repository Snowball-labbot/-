from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UserOut(ApiModel):
    id: str
    email: EmailStr
    role: str


class RegisterIn(ApiModel):
    email: EmailStr
    password: str = Field(min_length=8)
    invite_code: str = Field(min_length=4)


class LoginIn(ApiModel):
    email: EmailStr
    password: str


class InviteCreateIn(ApiModel):
    max_uses: int = Field(default=1, ge=1, le=100)
    expires_at: datetime | None = None


class InviteOut(ApiModel):
    code: str
    max_uses: int
    used_count: int
    expires_at: datetime | None


class HoldingCreateIn(ApiModel):
    type: str
    name: str = Field(min_length=1)
    group: str | None = None
    market: str | None = None
    symbol: str | None = None
    currency: str = Field(default="CNY", min_length=3, max_length=3)
    quantity: Decimal = Field(default=Decimal("1"), ge=0)
    unit_price: Decimal = Field(default=Decimal("0"), ge=0)
    current_price: Decimal | None = Field(default=None, ge=0)
    fee: Decimal = Field(default=Decimal("0"), ge=0)
    exchange_rate_to_cny: Decimal = Field(default=Decimal("1"), gt=0)
    trade_date: datetime | None = None
    note: str | None = None


class HoldingUpdateIn(ApiModel):
    name: str | None = None
    group: str | None = None
    market: str | None = None
    symbol: str | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    exchange_rate_to_cny: Decimal | None = Field(default=None, gt=0)


class HoldingOut(ApiModel):
    id: str
    type: str
    name: str
    group: str | None
    market: str | None
    symbol: str | None
    instrument_name: str | None
    quote_source: str | None
    currency: str
    quantity: Decimal
    avg_cost: Decimal
    current_price: Decimal
    current_value: Decimal
    current_value_cny: Decimal
    exchange_rate_to_cny: Decimal
    price_updated_at: datetime | None
    unrealized_gain_native: Decimal
    unrealized_gain_cny: Decimal
    unrealized_gain_pct: Decimal
    created_at: datetime
    updated_at: datetime


class MarketSearchResult(ApiModel):
    symbol: str
    name: str
    market: str
    kind: str
    currency: str
    price: Decimal | None = None
    price_updated_at: datetime | None = None
    quote_source: str | None = None


class MarketQuoteOut(ApiModel):
    symbol: str
    name: str
    market: str
    kind: str
    currency: str
    price: Decimal
    exchange_rate_to_cny: Decimal
    price_updated_at: datetime
    quote_source: str


class TransactionCreateIn(ApiModel):
    type: str
    quantity: Decimal = Field(default=Decimal("0"), ge=0)
    unit_price: Decimal = Field(default=Decimal("0"), ge=0)
    fee: Decimal = Field(default=Decimal("0"), ge=0)
    currency: str = Field(default="CNY", min_length=3, max_length=3)
    exchange_rate_to_cny: Decimal = Field(default=Decimal("1"), gt=0)
    trade_date: datetime | None = None
    note: str | None = None


class TransactionOut(ApiModel):
    id: str
    holding_id: str
    type: str
    trade_date: datetime
    quantity: Decimal
    unit_price: Decimal
    fee: Decimal
    currency: str
    exchange_rate_to_cny: Decimal
    note: str | None
    created_at: datetime


class SummarySlice(ApiModel):
    type: str
    value_cny: Decimal
    count: int


class SummaryOut(ApiModel):
    total_value_cny: Decimal
    total_cost_cny: Decimal
    unrealized_gain_cny: Decimal
    slices: list[SummarySlice]


class TrendPoint(ApiModel):
    date: str
    value_cny: Decimal


class PortfolioBackupTransaction(ApiModel):
    type: str
    trade_date: datetime | None = None
    quantity: Decimal = Field(default=Decimal("0"), ge=0)
    unit_price: Decimal = Field(default=Decimal("0"), ge=0)
    fee: Decimal = Field(default=Decimal("0"), ge=0)
    currency: str = Field(default="CNY", min_length=3, max_length=3)
    exchange_rate_to_cny: Decimal = Field(default=Decimal("1"), gt=0)
    note: str | None = None


class PortfolioBackupHolding(ApiModel):
    type: str
    name: str = Field(min_length=1)
    group: str | None = None
    market: str | None = None
    symbol: str | None = None
    instrument_name: str | None = None
    quote_source: str | None = None
    currency: str = Field(default="CNY", min_length=3, max_length=3)
    quantity: Decimal = Field(default=Decimal("0"), ge=0)
    avg_cost: Decimal = Field(default=Decimal("0"), ge=0)
    current_price: Decimal = Field(default=Decimal("0"), ge=0)
    exchange_rate_to_cny: Decimal = Field(default=Decimal("1"), gt=0)
    price_updated_at: datetime | None = None
    transactions: list[PortfolioBackupTransaction] = Field(default_factory=list)


class PortfolioBackupOut(ApiModel):
    schema_version: str = "portfolio_backup_v1"
    exported_at: datetime
    base_currency: str = "CNY"
    holdings: list[PortfolioBackupHolding]


class PortfolioBackupImportIn(ApiModel):
    schema_version: str | None = None
    holdings: list[PortfolioBackupHolding]


class PortfolioBackupImportOut(ApiModel):
    imported: int


class StrategyAdviceIn(ApiModel):
    selected_strategy: dict[str, Any] = Field(default_factory=dict)
    allocation_rows: list[dict[str, Any]] = Field(default_factory=list)
    custom_context: str | None = None
    chat_history: list[dict[str, str]] = Field(default_factory=list)


class StrategyAdviceOut(ApiModel):
    advice_markdown: str
    risk_flags: list[str] = Field(default_factory=list)
    rebalance_notes: list[str] = Field(default_factory=list)


class HoldingsImageExtractIn(ApiModel):
    image_data_url: str


class ExtractedHoldingIn(ApiModel):
    type: str = "fund"
    market: str | None = None
    symbol: str | None = None
    name: str
    quantity: Decimal = Field(default=Decimal("0"), ge=0)
    unit_price: Decimal = Field(default=Decimal("0"), ge=0)
    current_price: Decimal | None = Field(default=None, ge=0)
    currency: str = Field(default="CNY", min_length=3, max_length=3)
    exchange_rate_to_cny: Decimal = Field(default=Decimal("1"), gt=0)
    group: str | None = None
    note: str | None = None
    confidence: Decimal | None = Field(default=None, ge=0, le=1)


class HoldingsImageExtractOut(ApiModel):
    holdings: list[ExtractedHoldingIn]


class ImportExtractedHoldingsIn(ApiModel):
    holdings: list[ExtractedHoldingIn]


class ImportExtractedHoldingsOut(ApiModel):
    imported: int
    holdings: list[HoldingOut]
