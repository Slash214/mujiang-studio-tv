import { expect, test } from "bun:test";
import { isLocalDevelopmentRequest } from "../dev-desktop-proxy.mjs";

test("development credentials only reach local same-origin UI requests", () => {
    const request = (headers = {}, address = "127.0.0.1") => ({ socket: { remoteAddress: address }, headers: { host: "localhost:13000", ...headers } });
    expect(isLocalDevelopmentRequest(request())).toBe(true);
    expect(isLocalDevelopmentRequest(request({ origin: "http://localhost:13000" }))).toBe(true);
    expect(isLocalDevelopmentRequest(request({ origin: "https://untrusted.example" }))).toBe(false);
    expect(isLocalDevelopmentRequest(request({ host: "untrusted.example" }))).toBe(false);
    expect(isLocalDevelopmentRequest(request({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isLocalDevelopmentRequest(request({ "x-beeftv-client": "external" }))).toBe(false);
    expect(isLocalDevelopmentRequest(request({}, "192.168.1.2"))).toBe(false);
});
