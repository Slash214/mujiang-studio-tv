import { readFileSync } from "node:fs";

export function readDesktopDevelopmentSession(path) {
    if (!path) return undefined;
    const session = JSON.parse(readFileSync(path, "utf8"));
    const url = new URL(session.baseURL);
    if (url.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(url.hostname)
        || url.username || url.password || !session.launchToken || !session.uiBootstrapToken) {
        throw new Error("Invalid local desktop development session");
    }
    return session;
}

export function isLocalDevelopmentRequest(req) {
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress)) return false;
    try {
        const host = new URL(`http://${req.headers.host}`);
        if (!["localhost", "127.0.0.1", "[::1]"].includes(host.hostname)) return false;
        if (req.headers["sec-fetch-site"] === "cross-site") return false;
        if (req.headers.origin && req.headers.origin !== host.origin) return false;
        return !req.headers["x-beeftv-client"];
    } catch { return false; }
}

export function desktopDevelopmentGuard() {
    return {
        name: "beeftv-desktop-development-guard",
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                if (req.url?.split("?")[0].match(/^\/api(?:\/|$)/) && !isLocalDevelopmentRequest(req)) {
                    res.statusCode = 403;
                    res.end("Local same-origin development UI required");
                    return;
                }
                next();
            });
        },
    };
}
