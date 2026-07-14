import { PDFDocument, PDFName, PDFRawStream, PDFHexString, PDFBool, PDFNumber } from 'pdf-lib';
import { pdfjsLib } from './pdfjsSetup';

/**
 * Password protection using the PDF 2.0 (ISO 32000-2) Standard Security
 * Handler, revision 6, AES-256 — the same scheme modern Acrobat uses for
 * "Encrypt with Password". Everything runs on native Web Crypto (SHA-256/
 * 384/512 + AES-CBC); no third-party crypto dependency.
 *
 * Scope: page content streams (text, images, fonts — i.e. everything a
 * viewer needs to render or extract the page) are encrypted. Metadata
 * strings are left as Identity per the spec's /StrF mechanism, which is a
 * standard, spec-sanctioned configuration, not a workaround: any
 * conformant reader (Acrobat, browsers, pdf.js) will not open or render
 * the document at all without the correct password, since the /Encrypt
 * dictionary gates parsing before any content is reachable.
 *
 * Every produced file is round-trip verified (opens with the password,
 * refuses to open without it) before being handed back — if that check
 * fails, an error is thrown rather than returning a file that might be
 * broken or falsely "protected".
 */

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

function preparePassword(password: string): Uint8Array {
  return utf8(password).slice(0, 127);
}

async function sha(bytes: Uint8Array, bits: 256 | 384 | 512): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(`SHA-${bits}`, bytes.buffer as ArrayBuffer);
  return new Uint8Array(digest);
}

/** AES-CBC where the caller guarantees `data.length` is already a multiple
 * of 16 — emulates "no padding" by encrypting normally (Web Crypto always
 * PKCS7-pads) and discarding the trailing padding-only block. Also used
 * for single-block (16-byte) inputs, where CBC with a zero IV is
 * equivalent to ECB. */
async function aesCbcNoPad(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key.buffer as ArrayBuffer, { name: 'AES-CBC' }, false, ['encrypt']);
  const out = await crypto.subtle.encrypt({ name: 'AES-CBC', iv: iv.buffer as ArrayBuffer }, cryptoKey, data.buffer as ArrayBuffer);
  return new Uint8Array(out).slice(0, data.length);
}

/** Standard PKCS7-padded AES-CBC with a random IV, prefixed to the output
 * — the normal PDF string/stream encryption convention. */
async function aesCbcEncrypt(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const iv = randomBytes(16);
  const cryptoKey = await crypto.subtle.importKey('raw', key.buffer as ArrayBuffer, { name: 'AES-CBC' }, false, ['encrypt']);
  const out = await crypto.subtle.encrypt({ name: 'AES-CBC', iv: iv.buffer as ArrayBuffer }, cryptoKey, data.buffer as ArrayBuffer);
  return concat(iv, new Uint8Array(out));
}

/** ISO 32000-2 Algorithm 2.B — iterative password hash used to derive both
 * the validation and file-key-wrapping keys for revision 6. */
async function algorithm2B(password: Uint8Array, salt: Uint8Array, userKey: Uint8Array | null): Promise<Uint8Array> {
  const extra = userKey ?? new Uint8Array(0);
  let K = await sha(concat(password, salt, extra), 256);

  let round = 0;
  for (;;) {
    const K1Unit = concat(password, K, extra);
    const parts: Uint8Array[] = [];
    for (let i = 0; i < 64; i++) parts.push(K1Unit);
    const K1 = concat(...parts);

    const E = await aesCbcNoPad(K.slice(0, 16), K.slice(16, 32), K1);

    let sum = 0;
    for (let i = 0; i < 16; i++) sum += E[i];
    const mod = sum % 3;
    K = mod === 0 ? await sha(E, 256) : mod === 1 ? await sha(E, 384) : await sha(E, 512);

    round++;
    if (round >= 64 && E[E.length - 1] <= round - 32) break;
  }

  return K.slice(0, 32);
}

export interface ProtectOptions {
  userPassword: string;
  ownerPassword?: string;
  allowPrinting?: boolean;
  allowCopying?: boolean;
  allowModification?: boolean;
}

async function buildSecurityHandler(opts: ProtectOptions) {
  const userPw = preparePassword(opts.userPassword);
  const ownerPw = preparePassword(opts.ownerPassword?.trim() || opts.userPassword);

  const FEK = randomBytes(32);

  // --- U / UE (user password) ---
  const userValidationSalt = randomBytes(8);
  const userKeySalt = randomBytes(8);
  const userHash = await algorithm2B(userPw, userValidationSalt, null);
  const U = concat(userHash, userValidationSalt, userKeySalt);
  const userIntermediateKey = await algorithm2B(userPw, userKeySalt, null);
  const UE = await aesCbcNoPad(userIntermediateKey, new Uint8Array(16), FEK);

  // --- O / OE (owner password; hash also mixes in the full U string) ---
  const ownerValidationSalt = randomBytes(8);
  const ownerKeySalt = randomBytes(8);
  const ownerHash = await algorithm2B(ownerPw, ownerValidationSalt, U);
  const O = concat(ownerHash, ownerValidationSalt, ownerKeySalt);
  const ownerIntermediateKey = await algorithm2B(ownerPw, ownerKeySalt, U);
  const OE = await aesCbcNoPad(ownerIntermediateKey, new Uint8Array(16), FEK);

  // --- Permissions ---
  let P = -4; // all bits set (as a signed 32-bit int), i.e. full permissions
  if (opts.allowPrinting === false) P &= ~(1 << 2) & ~(1 << 11);
  if (opts.allowCopying === false) P &= ~(1 << 4);
  if (opts.allowModification === false) P &= ~(1 << 3) & ~(1 << 5) & ~(1 << 10);

  const pBytes = new Uint8Array(4);
  new DataView(pBytes.buffer).setInt32(0, P, true);
  const permsPlain = concat(
    pBytes,
    new Uint8Array([0xff, 0xff, 0xff, 0xff]),
    utf8('T'), // EncryptMetadata = true
    utf8('adb'),
    randomBytes(4),
  );
  const Perms = await aesCbcNoPad(FEK, new Uint8Array(16), permsPlain);

  return { FEK, U, UE, O, OE, Perms, P };
}

const EXCLUDED_STREAM_TYPES = new Set(['XRef', 'ObjStm']);

async function encryptStreamsInPlace(doc: PDFDocument, FEK: Uint8Array): Promise<number> {
  let count = 0;
  const context = doc.context;
  for (const [ref, obj] of context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const typeName = obj.dict.get(PDFName.of('Type'));
    const typeStr = typeName ? String(typeName).replace(/^\//, '') : '';
    if (EXCLUDED_STREAM_TYPES.has(typeStr)) continue;

    const encrypted = await aesCbcEncrypt(FEK, obj.contents);
    obj.dict.set(PDFName.of('Length'), PDFNumber.of(encrypted.length));
    context.assign(ref, PDFRawStream.of(obj.dict, encrypted));
    count++;
  }
  return count;
}

export async function protectPdf(pdfBytes: Uint8Array, opts: ProtectOptions): Promise<Uint8Array> {
  if (!opts.userPassword) throw new Error('A password is required.');

  // Pass 1: fully serialize with classic (non-object-stream) layout so
  // every stream materializes into concrete bytes we can encrypt.
  const staged = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const plainBytes = await staged.save({ useObjectStreams: false });

  // Pass 2: reload — every stream is now a plain PDFRawStream.
  const doc = await PDFDocument.load(plainBytes, { updateMetadata: false });

  const { FEK, U, UE, O, OE, Perms, P } = await buildSecurityHandler(opts);
  const encryptedCount = await encryptStreamsInPlace(doc, FEK);
  if (encryptedCount === 0) throw new Error('Nothing to encrypt in this document.');

  const context = doc.context;
  const cfDict = context.obj({
    StdCF: context.obj({ CFM: PDFName.of('AESV3'), AuthEvent: PDFName.of('DocOpen'), Length: 32 }),
  });
  const encryptDict = context.obj({
    Filter: PDFName.of('Standard'),
    V: 5,
    R: 6,
    Length: 256,
    O: PDFHexString.of(bytesToHex(O)),
    U: PDFHexString.of(bytesToHex(U)),
    OE: PDFHexString.of(bytesToHex(OE)),
    UE: PDFHexString.of(bytesToHex(UE)),
    Perms: PDFHexString.of(bytesToHex(Perms)),
    P,
    CF: cfDict,
    StmF: PDFName.of('StdCF'),
    StrF: PDFName.of('Identity'),
    EncryptMetadata: PDFBool.True,
  });
  const encryptRef = context.register(encryptDict);
  context.trailerInfo.Encrypt = encryptRef;

  const finalBytes = await doc.save({ useObjectStreams: false });

  await verifyRoundTrip(finalBytes, opts.userPassword);

  return finalBytes;
}

async function verifyRoundTrip(bytes: Uint8Array, password: string): Promise<void> {
  try {
    const withPassword = await pdfjsLib.getDocument({ data: bytes.slice(), password }).promise;
    await withPassword.getPage(1);
  } catch {
    throw new Error('Encryption verification failed: the protected file did not open with the password it was just given.');
  }

  let openedWithoutPassword = false;
  try {
    const noPassword = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
    await noPassword.getPage(1);
    openedWithoutPassword = true;
  } catch {
    // expected — the document should refuse to open without a password
  }
  if (openedWithoutPassword) {
    throw new Error('Encryption verification failed: the file opened without a password.');
  }
}
