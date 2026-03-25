import type { Request, Response } from "express";
import { parse as parseCookies } from "cookie";
import { jwtVerify } from "jose";

export type TrpcContext = {
  req: Request;
  res: Response;
  isAdmin: boolean;
};

const COOKIE_NAME = "qr_admin_session";

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(s);
}

async function verifySession(req: Request): Promise<boolean> {
  try {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return false;
    const cookies = parseCookies(cookieHeader);
    const token = cookies[COOKIE_NAME];
    if (!token) return false;
    await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}

export async function createContext({ req, res }: { req: Request; res: Response }): Promise<TrpcContext> {
  const isAdmin = await verifySession(req);
  return { req, res, isAdmin };
}

export { COOKIE_NAME };
