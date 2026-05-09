from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


HOLDING_COLUMNS = {
    "instrument_name": "VARCHAR(255)",
    "quote_source": "VARCHAR(64)",
    "price_updated_at": "TIMESTAMP",
}


def ensure_lightweight_migrations(engine: Engine) -> None:
    inspector = inspect(engine)
    if "holdings" not in inspector.get_table_names():
        return

    existing = {column["name"] for column in inspector.get_columns("holdings")}
    with engine.begin() as connection:
        for name, ddl_type in HOLDING_COLUMNS.items():
            if name not in existing:
                connection.execute(text(f"ALTER TABLE holdings ADD COLUMN {name} {ddl_type}"))
