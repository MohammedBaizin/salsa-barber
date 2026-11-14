/**
 * Web Push without a library: payload encryption (RFC 8291, "aes128gcm" content coding, RFC 8188) and VAPID
 * (RFC 8292, an ES256 JWT that identifies this server to the push service). Node's crypto only.
 * No "server-only" import so the unit tests and the key script can use it; it's only imported by server code.
 */
import { createECDH, createCipheriv, createDecipheriv, createPrivateKey, createPublicKey, hkdfSync, randomBytes, sign, verify } from "node:crypto";

const b64url = (buf: Buffer | Uint8Array) => Buffer.from(buf).toString("base64url");
const fromB64url = (s: string) => Buffer.from(s, "base64url");

const RECORD_SIZE = 4096;

/** Keys derived per RFC 8291 §3.4 (shared by encrypt and decrypt). */
function contentKeys(shared: Buffer, authSecret: Buffer, receiverPublic: Buffer, senderPublic: Buffer, salt: Buffer) {
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), receiverPublic, senderPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, authSecret, keyInfo, 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  return { cek, nonce };
}

/** Encrypts a payload for one subscription (keys as the browser gives them, base64url). */
export function encryptPayload(payload: string, subscription: { p256dh: string; auth: string }, salt: Buffer = randomBytes(16)): Buffer {
  const receiverPublic = fromB64url(subscription.p256dh);
  const authSecret = fromB64url(subscription.auth);
  if (receiverPublic.length !== 65 || authSecret.length !== 16) throw new Error("Bad subscription keys.");
  const sender = createECDH("prime256v1");
  const senderPublic = sender.generateKeys();
  const shared = sender.computeSecret(receiverPublic);
  const { cek, nonce } = contentKeys(shared, authSecret, receiverPublic, senderPublic, salt);

  const plaintext = Buffer.concat([Buffer.from(payload, "utf8"), Buffer.from([2])]); // 0x02 = last record
  if (plaintext.length + 16 > RECORD_SIZE) throw new Error("Payload too large.");
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(senderPublic.length, 20);
  return Buffer.concat([header, senderPublic, body]);
}

/** What a browser does with a push message (used by the tests to read what was sent). */
export function decryptPayload(message: Buffer, receiver: { privateKey: Buffer; publicKey: Buffer; auth: Buffer }): string {
  const salt = message.subarray(0, 16);
  const idLength = message.readUInt8(20);
  const senderPublic = message.subarray(21, 21 + idLength);
  const body = message.subarray(21 + idLength);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(receiver.privateKey);
  const shared = ecdh.computeSecret(senderPublic);
  const { cek, nonce } = contentKeys(shared, receiver.auth, receiver.publicKey, senderPublic, salt);
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(body.subarray(body.length - 16));
  const plain = Buffer.concat([decipher.update(body.subarray(0, body.length - 16)), decipher.final()]);
  const end = plain.lastIndexOf(2);
  return plain.subarray(0, end).toString("utf8");
}

export type VapidKeys = { publicKey: string; privateKey: string; subject: string };

/** A new key pair for VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (base64url, as browsers expect). */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { publicKey: b64url(ecdh.getPublicKey()), privateKey: b64url(ecdh.getPrivateKey()) };
}

function privateKeyObject(keys: { publicKey: string; privateKey: string }) {
  const pub = fromB64url(keys.publicKey);
  return createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: keys.privateKey, x: b64url(pub.subarray(1, 33)), y: b64url(pub.subarray(33, 65)) },
    format: "jwk",
  });
}

/** `Authorization: vapid t=<JWT>, k=<public key>` for one push service, valid for 12 hours. */
export function vapidAuthorization(endpoint: string, keys: VapidKeys, now: number = Date.now()): string {
  const header = b64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(
    Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: keys.subject })),
  );
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), { key: privateKeyObject(keys), dsaEncoding: "ieee-p1363" });
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${keys.publicKey}`;
}

/** Checks a VAPID header against the public key (tests). Returns the claims, or null if the signature is wrong. */
export function verifyVapid(authorization: string, publicKey: string): Record<string, unknown> | null {
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(authorization);
  if (!m || m[4] !== publicKey) return null;
  const pub = fromB64url(publicKey);
  const key = createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64url(pub.subarray(1, 33)), y: b64url(pub.subarray(33, 65)) }, format: "jwk" });
  const ok = verify("sha256", Buffer.from(`${m[1]}.${m[2]}`), { key, dsaEncoding: "ieee-p1363" }, fromB64url(m[3]));
  return ok ? (JSON.parse(fromB64url(m[2]).toString()) as Record<string, unknown>) : null;
}

export type PushResult = "sent" | "gone" | "failed";

type Send = (url: string, init: RequestInit) => Promise<Response>;

/** Sends one encrypted push. "gone" (404/410) means the subscription should be deleted. Never throws. */
export async function sendPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  keys: VapidKeys,
  send: Send = fetch,
): Promise<PushResult> {
  try {
    const body = encryptPayload(payload, subscription);
    const res = await send(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: vapidAuthorization(subscription.endpoint, keys),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(24 * 3600),
        Urgency: "high",
      },
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404 || res.status === 410) return "gone";
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
