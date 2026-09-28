"""Idempotent in-place schema upgrades, run on every startup after create_all().

create_all() only creates missing tables — it never alters existing ones — so any
column/index added to an existing model must be added here too. Every step checks
the current schema first, so re-running is a no-op.
"""
from sqlalchemy import inspect, text


def _columns(insp, table):
    return {c["name"] for c in insp.get_columns(table)}


def _add_column(conn, insp, table, column, ddl_type):
    if column not in _columns(insp, table):
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}"))
        print(f"[migrate] added {table}.{column}")


def run_migrations(engine):
    with engine.begin() as conn:
        insp = inspect(conn)

        # --- Locations + rep ownership ---
        _add_column(conn, insp, "users", "full_name", "VARCHAR")
        _add_column(conn, insp, "users", "location", "VARCHAR DEFAULT 'USA'")
        _add_column(conn, insp, "students", "rep_id", "INTEGER REFERENCES users(id)")
        _add_column(conn, insp, "students", "location", "VARCHAR DEFAULT 'USA'")
        _add_column(conn, insp, "approvals", "rep_id", "INTEGER REFERENCES users(id)")
        _add_column(conn, insp, "approvals", "location", "VARCHAR DEFAULT 'USA'")

        # --- Commission payment status (paid / partial / pending) ---
        _add_column(conn, insp, "students", "payment_status", "VARCHAR DEFAULT 'pending'")
        conn.execute(text("UPDATE students SET payment_status = 'pending' WHERE payment_status IS NULL"))

        insp = inspect(conn)  # refresh after DDL

        # --- Approvals: one per month  ->  one per (month, rep) ---
        idx = {i["name"]: i for i in insp.get_indexes("approvals")}
        if idx.get("ix_approvals_month", {}).get("unique"):
            conn.execute(text("DROP INDEX ix_approvals_month"))
            conn.execute(text("CREATE INDEX ix_approvals_month ON approvals (month)"))
            print("[migrate] approvals.month is no longer unique on its own")
        uniques = {u["name"] for u in insp.get_unique_constraints("approvals")} | {
            n for n, i in idx.items() if i.get("unique")
        }
        if "uq_approval_month_rep" not in uniques:
            conn.execute(text("CREATE UNIQUE INDEX uq_approval_month_rep ON approvals (month, rep_id)"))
            print("[migrate] added unique (month, rep_id) on approvals")

        for table, col in (("students", "rep_id"), ("students", "location"),
                           ("approvals", "rep_id"), ("approvals", "location"),
                           ("users", "location")):
            ix = f"ix_{table}_{col}"
            if ix not in {i["name"] for i in inspect(conn).get_indexes(table)}:
                conn.execute(text(f"CREATE INDEX {ix} ON {table} ({col})"))

        # --- Backfill: everything that existed before this change is USA / Eli ---
        conn.execute(text("UPDATE users SET location = 'USA' WHERE location IS NULL"))
        conn.execute(text("UPDATE students SET location = 'USA' WHERE location IS NULL"))
        conn.execute(text("UPDATE approvals SET location = 'USA' WHERE location IS NULL"))

        default_rep = conn.execute(text(
            "SELECT id FROM users WHERE role = 'ADMISSIONS_REP' AND location = 'USA' "
            "ORDER BY (username = 'eli') DESC, id LIMIT 1"
        )).scalar()
        if default_rep is not None:
            # Records a rep created belong to that rep; ones Admin/Marcelo keyed in go to the USA rep
            conn.execute(text(
                "UPDATE students SET rep_id = created_by WHERE rep_id IS NULL AND created_by IN "
                "(SELECT id FROM users WHERE role = 'ADMISSIONS_REP')"
            ))
            n = conn.execute(text("UPDATE students SET rep_id = :r WHERE rep_id IS NULL"), {"r": default_rep}).rowcount
            a = conn.execute(text("UPDATE approvals SET rep_id = :r WHERE rep_id IS NULL"), {"r": default_rep}).rowcount
            if n or a:
                print(f"[migrate] assigned {n} records and {a} approvals to the USA rep (id {default_rep})")
