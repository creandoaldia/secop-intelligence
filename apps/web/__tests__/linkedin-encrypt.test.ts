// ─────────────────────────────────────────────────────────────
// Tests: LinkedIn Token Encryption
// Pure function — no mocks needed
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt } from "@/lib/linkedin/encrypt";

describe("LinkedIn encrypt/decrypt", () => {
  beforeAll(() => {
    process.env.AUTH_SECRET = "test-secret-for-unit-tests-32chars!";
  });

  it("encripta y desencripta correctamente un token", () => {
    const original = "mock_access_token_abc123def456";
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);

    expect(decrypted).toBe(original);
  });

  it("produce diferentes ciphertext cada vez (IV aleatorio)", () => {
    const token = "token_para_test_001";
    const encrypted1 = encrypt(token);
    const encrypted2 = encrypt(token);

    expect(encrypted1).not.toBe(encrypted2);
  });

  it("maneja tokens largos (simulando JWT)", () => {
    const longToken = "a".repeat(2000);
    const encrypted = encrypt(longToken);
    const decrypted = decrypt(encrypted);

    expect(decrypted).toBe(longToken);
  });

  it("lanza error con formato invalido", () => {
    expect(() => decrypt("formato-invalido")).toThrow("Invalid encrypted text format");
  });

  it("lanza error con datos corruptos", () => {
    const encrypted = encrypt("token_valido");
    const corrupted = encrypted.slice(0, -5) + "XXXXX";
    expect(() => decrypt(corrupted)).toThrow();
  });

  it("maneja tokens con caracteres especiales", () => {
    const special = "token_with_special_chars!@#$%^&*()_+-=[]{}|;':\",./<>?`~";
    const encrypted = encrypt(special);
    const decrypted = decrypt(encrypted);

    expect(decrypted).toBe(special);
  });

  it("usa AUTH_SECRET como clave de derivacion", () => {
    process.env.AUTH_SECRET = "different-secret-key-for-testing-32chr";
    const token = "test-token";
    const encrypted = encrypt(token);
    const decrypted = decrypt(encrypted);

    expect(decrypted).toBe(token);
  });
});
