import { Inject, Injectable } from "@nestjs/common";
import type { AuthUser } from "../../common/auth/auth.types.js";
import { CryptoService } from "../../common/crypto.service.js";
import { AppError, Errors } from "../../common/errors.js";
import { PrismaService } from "../../common/prisma.service.js";
import type { FilePurpose } from "../../generated/prisma/client.js";
import { MALWARE_SCANNER, STORAGE_DRIVER, type MalwareScanner, type StorageDriver } from "../integrations/providers.js";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Allowed types are detected from content, never from the client's filename or Content-Type. SVG/HTML are refused. */
function sniff(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png" };
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return { mime: "image/webp", ext: "webp" };
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  return null;
}

const safeName = (name: string, ext: string) => {
  const base = name.split(/[\\/]/).pop()!.replace(/\.[^.]*$/, "").replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 80) || "file";
  return `${base}.${ext}`;
};

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
    @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScanner,
  ) {}

  async upload(user: AuthUser, file: { buffer: Buffer; originalname: string; size: number } | undefined, purpose: FilePurpose, tradeId?: string) {
    if (!file?.buffer?.length) throw new AppError("FILE_REQUIRED", 422);
    if (file.size > MAX_UPLOAD_BYTES) throw new AppError("FILE_TOO_LARGE", 413);
    const type = sniff(file.buffer);
    if (!type) throw new AppError("FILE_TYPE_NOT_ALLOWED", 415);
    if (purpose === "KYC_DOCUMENT") throw new AppError("USE_KYC_PROVIDER_FLOW", 422);

    if (purpose === "CHAT_ATTACHMENT") {
      if (!tradeId) throw new AppError("TRADE_ID_REQUIRED", 422);
      const t = await this.prisma.trade.findUnique({ where: { id: tradeId }, select: { buyerId: true, sellerId: true } });
      const party = t && (t.buyerId === user.id || t.sellerId === user.id);
      if (!party && !user.permissions.has("trades:chat_intervene")) throw Errors.notFound("TRADE");
    }

    const scan = await this.scanner.scan(file.buffer, file.originalname);
    if (!scan.clean) {
      await this.prisma.riskFlag.create({ data: { userId: user.id, type: "MALWARE_UPLOAD", severity: "HIGH", details: { signature: scan.signature } } });
      throw new AppError("FILE_REJECTED_BY_SCANNER", 422);
    }

    const id = this.crypto.randomToken(12).replace(/[^a-zA-Z0-9]/g, "x");
    const now = new Date();
    const key = `files/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${id}`;
    await this.storage.put(key, this.crypto.encryptBuffer(file.buffer));
    const row = await this.prisma.fileObject.create({
      data: {
        ownerId: user.id,
        purpose,
        tradeId: purpose === "CHAT_ATTACHMENT" ? tradeId! : null,
        fileName: safeName(file.originalname, type.ext),
        mimeType: type.mime,
        size: file.size,
        sha256: this.crypto.sha256(file.buffer),
        storageKey: key,
        scanStatus: "CLEAN",
      },
    });
    return { id: row.id, fileName: row.fileName, mimeType: row.mimeType, size: row.size };
  }

  /** Authorised download: owner, the trade's parties, dispute parties, or staff with the right permission. */
  async download(user: AuthUser, id: string): Promise<{ data: Buffer; mimeType: string; fileName: string }> {
    const f = await this.prisma.fileObject.findUnique({
      where: { id },
      include: { disputeMessage: { select: { staffOnly: true, dispute: { select: { trade: { select: { buyerId: true, sellerId: true } } } } } } },
    });
    if (!f || f.scanStatus !== "CLEAN") throw Errors.notFound("FILE");
    let allowed = f.ownerId === user.id || user.permissions.has("trades:read_all") || user.permissions.has("disputes:read");
    if (!allowed && f.tradeId) {
      const t = await this.prisma.trade.findUnique({ where: { id: f.tradeId }, select: { buyerId: true, sellerId: true } });
      allowed = !!t && (t.buyerId === user.id || t.sellerId === user.id);
    }
    if (!allowed && f.disputeMessage && !f.disputeMessage.staffOnly) {
      const t = f.disputeMessage.dispute.trade;
      allowed = t.buyerId === user.id || t.sellerId === user.id;
    }
    if (!allowed) throw Errors.notFound("FILE");
    const blob = await this.storage.get(f.storageKey);
    return { data: this.crypto.decryptBuffer(blob), mimeType: f.mimeType, fileName: f.fileName };
  }
}
