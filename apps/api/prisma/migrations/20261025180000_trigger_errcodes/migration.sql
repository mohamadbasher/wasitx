-- Raise integrity violations as plain P0001 exceptions so the message (APPEND_ONLY, LEDGER_*) reaches the
-- application intact; specific SQLSTATEs were being re-labelled by the driver as unrelated errors.
CREATE OR REPLACE FUNCTION wx_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'APPEND_ONLY: % rows cannot be %d', TG_TABLE_NAME, lower(TG_OP);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION wx_guard_ledger_balance() RETURNS trigger AS $$
BEGIN
  IF NEW.balance <> OLD.balance AND pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'LEDGER_BALANCE_DIRECT_WRITE: balances change only via LedgerLine';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION wx_check_entry_balanced() RETURNS trigger AS $$
DECLARE
  unbalanced record;
BEGIN
  SELECT currency, SUM(amount) AS total INTO unbalanced
    FROM "LedgerLine" WHERE "entryId" = NEW."entryId"
    GROUP BY currency HAVING SUM(amount) <> 0 LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'LEDGER_UNBALANCED: entry % currency % sums to %', NEW."entryId", unbalanced.currency, unbalanced.total;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
