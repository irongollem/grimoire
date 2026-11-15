import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ownerOfPath,
  reserveStoredObjects,
  recordStoredObject,
  releaseStoredObjects,
  signReservation,
  type RpcClient,
} from "./storage-accounting.ts";

const USER = "123e4567-e89b-12d3-a456-426614174000";

function fake(result: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn(async () => result);
  const client: RpcClient = { rpc };
  return { client, rpc };
}

afterEach(() => vi.restoreAllMocks());

describe("ownerOfPath", () => {
  it("returns the user id for an owned key, in any letter case", () => {
    expect(ownerOfPath(`${USER}/a.webp`)).toBe(USER);
    expect(ownerOfPath(`${USER.toUpperCase()}/x/y.webp`)).toBe(USER.toUpperCase());
  });

  it("gives a shared prefix to nobody, so an admin's srd upload is not billed to the admin", () => {
    expect(ownerOfPath("srd/owlbear.webp")).toBeNull();
    expect(ownerOfPath("library/x/y.png")).toBeNull();
  });

  it("gives a bare user id with no file under it to nobody", () => {
    expect(ownerOfPath(USER)).toBeNull();
    expect(ownerOfPath(`${USER}/`)).toBeNull();
  });
});

describe("reserveStoredObjects", () => {
  const objects = [{ path: `${USER}/a`, size: 1 }];

  it("lets the upload through when the accounting call errors (fail open)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fake({ data: null, error: { message: "boom" } });
    expect(await reserveStoredObjects(client, USER, "b", objects, true)).toEqual({ allowed: true });
  });

  it("lets the upload through on an unrecognised answer (fail open)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fake({ data: { allowed: "maybe" }, error: null });
    expect(await reserveStoredObjects(client, USER, "b", objects, true)).toEqual({ allowed: true });
  });

  it("lets the upload through when the rpc rejects (fail open)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const client: RpcClient = { rpc: () => Promise.reject(new Error("net")) };
    expect(await reserveStoredObjects(client, USER, "b", objects, true)).toEqual({ allowed: true });
  });

  it("reports a refusal with the used and limit figures", async () => {
    const { client } = fake({ data: { allowed: false, used: 900, limit: 1000 }, error: null });
    expect(await reserveStoredObjects(client, USER, "b", objects, true)).toEqual({
      allowed: false,
      used: 900,
      limit: 1000,
    });
  });
});

describe("recordStoredObject", () => {
  it("records nothing for a shared-prefix path", async () => {
    const { client, rpc } = fake({ data: { allowed: true }, error: null });
    await recordStoredObject(client, "b", "srd/a.webp", 5);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("records an owned path without enforcing the ceiling, since the bytes are already stored", async () => {
    const { client, rpc } = fake({ data: { allowed: true }, error: null });
    await recordStoredObject(client, "b", `${USER}/a.webp`, 5);
    expect(rpc).toHaveBeenCalledTimes(1);
    const args = (rpc.mock.calls[0] as unknown as [string, Record<string, unknown>])[1];
    expect(args.p_enforce).toBe(false);
    expect(args.p_user_id).toBe(USER);
  });

  it("never throws when the accounting fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fake({ data: null, error: { message: "boom" } });
    await expect(recordStoredObject(client, "b", `${USER}/a`, 5)).resolves.toBeUndefined();
  });
});

describe("releaseStoredObjects", () => {
  it("never throws when the release errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fake({ data: null, error: { message: "boom" } });
    await expect(releaseStoredObjects(client, "b", ["p"])).resolves.toBeUndefined();
  });
});

describe("signReservation", () => {
  const OTHER = "223e4567-e89b-12d3-a456-426614174000";

  it("neither counts an admin's uploads, shared or their own, nor holds them to the ceiling", () => {
    const plan = signReservation(
      [{ path: "srd/owlbear.webp", size: 10 }, { path: `${USER}/own.webp`, size: 20 }],
      { userId: USER, isAdmin: true },
    );
    expect(plan.objects).toEqual([]);
    expect(plan.enforce).toBe(false);
  });

  it("counts an ordinary account's own keys but not a shared srd key", () => {
    const plan = signReservation(
      [{ path: "srd/owlbear.webp", size: 10 }, { path: `${USER}/own.webp`, size: 20 }],
      { userId: USER, isAdmin: false },
    );
    expect(plan.objects).toEqual([{ path: `${USER}/own.webp`, size: 20 }]);
  });

  it("holds an ordinary account to the ceiling", () => {
    expect(signReservation([{ path: `${USER}/a.webp`, size: 1 }], { userId: USER, isAdmin: false }).enforce).toBe(true);
  });

  it("never counts a key under another account's folder against the caller", () => {
    const plan = signReservation([{ path: `${OTHER}/a.webp`, size: 5 }], { userId: USER, isAdmin: false });
    expect(plan.objects).toEqual([]);
  });
});
