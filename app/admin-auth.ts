import "server-only";
import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const cookieName = "gfc_admin";
const lifetime = 7 * 24 * 60 * 60;
const secret = () => { const value = process.env.SESSION_SECRET; if (!value || value.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters."); return value; };
const signature = (value: string) => createHmac("sha256", secret()).update(value).digest("hex");

export function verifyAdminCredentials(username: string, password: string) {
  const expectedUser = process.env.ADMIN_USERNAME || "admin";
  const stored = process.env.ADMIN_PASSWORD_HASH || "";
  const [method, salt, hash] = stored.split("$");
  if (method !== "scrypt" || !/^[a-f0-9]{32,}$/.test(salt || "") || !/^[a-f0-9]{128}$/.test(hash || "")) throw new Error("ADMIN_PASSWORD_HASH is not configured.");
  const actual = scryptSync(password, Buffer.from(salt, "hex"), 64);
  const expected = Buffer.from(hash, "hex");
  const userA = createHmac("sha256", secret()).update(username).digest();
  const userB = createHmac("sha256", secret()).update(expectedUser).digest();
  return timingSafeEqual(actual, expected) && timingSafeEqual(userA, userB);
}

export function makeAdminSession() {
  const expiry = Math.floor(Date.now() / 1000) + lifetime;
  const payload = `admin.${expiry}`;
  return `${payload}.${signature(payload)}`;
}
export async function setAdminSession() {
  (await cookies()).set(cookieName, makeAdminSession(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: lifetime });
}
export async function clearAdminSession() { (await cookies()).delete(cookieName); }
export async function getAdmin() {
  const value = (await cookies()).get(cookieName)?.value || "";
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== "admin" || !/^\d+$/.test(parts[1]) || Number(parts[1]) < Date.now() / 1000 || !/^[a-f0-9]{64}$/.test(parts[2])) return null;
  const expected = Buffer.from(signature(`${parts[0]}.${parts[1]}`), "hex");
  if (!timingSafeEqual(Buffer.from(parts[2], "hex"), expected)) return null;
  return { userId: "admin", displayName: process.env.ADMIN_USERNAME || "admin" };
}
export async function requireAdmin() { const user = await getAdmin(); if (!user) redirect("/login"); return user; }
