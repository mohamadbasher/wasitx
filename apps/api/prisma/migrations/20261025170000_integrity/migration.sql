-- Integrity rules the application must not be able to bypass.

-- 1. Append-only tables -------------------------------------------------------
CREATE OR REPLACE FUNCTION wx_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'APPEND_ONLY: % rows cannot be %d', TG_TABLE_NAME, lower(TG_OP)
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_event_append_only   BEFORE UPDATE OR DELETE ON "AuditEvent"   FOR EACH ROW EXECUTE FUNCTION wx_forbid_mutation();
CREATE TRIGGER trade_event_append_only   BEFORE UPDATE OR DELETE ON "TradeEvent"   FOR EACH ROW EXECUTE FUNCTION wx_forbid_mutation();
CREATE TRIGGER journal_entry_append_only BEFORE UPDATE OR DELETE ON "JournalEntry" FOR EACH ROW EXECUTE FUNCTION wx_forbid_mutation();
CREATE TRIGGER ledger_line_append_only   BEFORE UPDATE OR DELETE ON "LedgerLine"   FOR EACH ROW EXECUTE FUNCTION wx_forbid_mutation();
CREATE TRIGGER kyc_event_append_only     BEFORE UPDATE OR DELETE ON "KycEvent"     FOR EACH ROW EXECUTE FUNCTION wx_forbid_mutation();

-- 2. Ledger: balances are maintained ONLY by this trigger -----------------------
CREATE OR REPLACE FUNCTION wx_apply_ledger_line() RETURNS trigger AS $$
BEGIN
  UPDATE "LedgerAccount" SET balance = balance + NEW.amount WHERE id = NEW."accountId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LEDGER_ACCOUNT_MISSING: %', NEW."accountId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_line_apply AFTER INSERT ON "LedgerLine" FOR EACH ROW EXECUTE FUNCTION wx_apply_ledger_line();

-- Balance can only change through ledger lines (the trigger above runs at depth 2).
CREATE OR REPLACE FUNCTION wx_guard_ledger_balance() RETURNS trigger AS $$
BEGIN
  IF NEW.balance <> OLD.balance AND pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'LEDGER_BALANCE_DIRECT_WRITE: balances change only via LedgerLine'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_account_balance_guard BEFORE UPDATE ON "LedgerAccount" FOR EACH ROW EXECUTE FUNCTION wx_guard_ledger_balance();

ALTER TABLE "LedgerAccount" ADD CONSTRAINT ledger_account_non_negative CHECK ("allowNegative" OR balance >= 0);
ALTER TABLE "LedgerLine" ADD CONSTRAINT ledger_line_non_zero CHECK (amount <> 0);

-- Every journal entry must balance to zero per currency, checked at COMMIT.
CREATE OR REPLACE FUNCTION wx_check_entry_balanced() RETURNS trigger AS $$
DECLARE
  unbalanced record;
BEGIN
  SELECT currency, SUM(amount) AS total INTO unbalanced
    FROM "LedgerLine" WHERE "entryId" = NEW."entryId"
    GROUP BY currency HAVING SUM(amount) <> 0 LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'LEDGER_UNBALANCED: entry % currency % sums to %', NEW."entryId", unbalanced.currency, unbalanced.total
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ledger_entry_balanced
  AFTER INSERT ON "LedgerLine" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION wx_check_entry_balanced();

-- 3. Marketplace & trade invariants --------------------------------------------
ALTER TABLE "Offer" ADD CONSTRAINT offer_amounts_valid CHECK (
  "amountUsdt" > 0 AND "remainingUsdt" >= 0 AND "remainingUsdt" <= "amountUsdt"
  AND "priceE4" > 0 AND "minOrderAgorot" > 0 AND "maxOrderAgorot" >= "minOrderAgorot"
);

ALTER TABLE "Trade" ADD CONSTRAINT trade_amounts_valid CHECK (
  "amountUsdt" > 0 AND "priceE4" > 0 AND "fiatAgorot" > 0
  AND "feeUsdt" = "buyerFeeUsdt" + "sellerFeeUsdt"
  AND "sellerLocksUsdt" = "amountUsdt" + "sellerFeeUsdt"
  AND "buyerReceivesUsdt" = "amountUsdt" - "buyerFeeUsdt"
  AND "buyerReceivesUsdt" > 0
  AND "buyerId" <> "sellerId"
);

ALTER TABLE "Trade" ADD CONSTRAINT trade_frozen_has_origin CHECK (
  (status = 'FROZEN' AND "frozenFrom" IS NOT NULL) OR (status <> 'FROZEN')
);

ALTER TABLE "SandboxCustodyAccount" ADD CONSTRAINT sandbox_custody_valid CHECK (
  "totalUsdt" >= 0 AND "heldUsdt" >= 0 AND "heldUsdt" <= "totalUsdt"
);

ALTER TABLE "CommissionConfig" ADD CONSTRAINT commission_valid CHECK (
  "rateBps" BETWEEN 0 AND 1000 AND "minUsdt" >= 0 AND "maxUsdt" >= "minUsdt"
);

-- 4. Fast marketplace lookup of open offers only
CREATE INDEX offer_open_book_idx ON "Offer" (side, "paymentMethod", "priceE4", "createdAt")
  WHERE status = 'ACTIVE';
