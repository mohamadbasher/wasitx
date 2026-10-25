import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Response } from "express";
import type { AuthedRequest } from "./auth/auth.types.js";

/** Attaches ip / user agent / client device id to the request for audit and risk signals. */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: AuthedRequest, _res: Response, next: NextFunction) {
    const device = req.headers["x-device-id"];
    req.ctx = {
      ip: req.ip ?? req.socket.remoteAddress ?? null,
      userAgent: (req.headers["user-agent"] ?? "").slice(0, 300) || null,
      deviceId: typeof device === "string" && /^[A-Za-z0-9-]{8,64}$/.test(device) ? device : null,
    };
    next();
  }
}
