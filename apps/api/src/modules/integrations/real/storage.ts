import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { StorageDriver } from "../providers.js";

/**
 * Local-disk storage for development. Blobs are already AES-256-GCM encrypted by FilesService before
 * they reach the driver, so the disk never holds plaintext documents.
 */
export class LocalStorageDriver implements StorageDriver {
  readonly name = "local-storage";
  readonly sandbox = true;
  private readonly root: string;

  constructor(dir: string) {
    this.root = resolve(dir);
  }

  private path(key: string) {
    if (!/^[a-zA-Z0-9/_-]+$/.test(key) || key.includes("..")) throw new Error("Invalid storage key");
    return join(this.root, key);
  }

  async put(key: string, data: Buffer) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data, { mode: 0o600 });
  }

  async get(key: string) {
    return readFile(this.path(key));
  }

  async delete(key: string) {
    await rm(this.path(key), { force: true });
  }
}

/**
 * Private S3-compatible bucket (AWS S3 / Cloudflare R2 / MinIO). Requires `@aws-sdk/client-s3`
 * (installed only in deployments that set STORAGE_DRIVER=s3) and env S3_BUCKET, S3_REGION,
 * optional S3_ENDPOINT. The bucket must block public access and enforce SSE-KMS.
 */
export class S3StorageDriver implements StorageDriver {
  readonly name = "s3-storage";
  readonly sandbox = false;
  private clientPromise: Promise<{ send: (cmd: unknown) => Promise<unknown>; mod: Record<string, new (input: object) => unknown> }>;

  constructor(private readonly bucket: string) {
    const moduleName = "@aws-sdk/client-s3";
    this.clientPromise = import(moduleName).then((mod: Record<string, unknown>) => {
      const S3Client = mod.S3Client as new (cfg: object) => { send: (cmd: unknown) => Promise<unknown> };
      const client = new S3Client({ region: process.env.S3_REGION, endpoint: process.env.S3_ENDPOINT || undefined });
      return { send: (cmd: unknown) => client.send(cmd), mod: mod as Record<string, new (input: object) => unknown> };
    });
  }

  async put(key: string, data: Buffer) {
    const c = await this.clientPromise;
    await c.send(new c.mod.PutObjectCommand!({ Bucket: this.bucket, Key: key, Body: data, ServerSideEncryption: "aws:kms" }));
  }

  async get(key: string) {
    const c = await this.clientPromise;
    const out = (await c.send(new c.mod.GetObjectCommand!({ Bucket: this.bucket, Key: key }))) as { Body: { transformToByteArray(): Promise<Uint8Array> } };
    return Buffer.from(await out.Body.transformToByteArray());
  }

  async delete(key: string) {
    const c = await this.clientPromise;
    await c.send(new c.mod.DeleteObjectCommand!({ Bucket: this.bucket, Key: key }));
  }
}
