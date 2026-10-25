-- Audit tamper-evidence moves from a synchronous global hash chain (a global lock on every financial
-- transaction, which deadlocked under load) to per-row digests + background seals over committed rows.
DROP INDEX "AuditEvent_hash_key";
ALTER TABLE "AuditEvent" DROP COLUMN "prevHash";

CREATE TABLE "AuditSeal" (
    "id" SERIAL NOT NULL,
    "fromId" BIGINT NOT NULL,
    "toId" BIGINT NOT NULL,
    "count" INTEGER NOT NULL,
    "prevSealHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditSeal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AuditSeal_toId_key" ON "AuditSeal"("toId");
CREATE TRIGGER audit_seal_append_only BEFORE UPDATE OR DELETE ON "AuditSeal" FOR EACH ROW EXECUTE FUNCTION wx_forbid_mutation();
