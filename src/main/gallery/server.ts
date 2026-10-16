import { randomBytes, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname } from "node:path";

import { resolveLibraryVideo } from "./operations";

const HOST = "127.0.0.1";
const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

export type GalleryVideoServer = {
  urlForId: (id: string) => string;
  close: () => Promise<void>;
};

type ByteRange = {
  start: number;
  end: number;
};

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

const readRange = (header: string | undefined, size: number): ByteRange | null => {
  if (header === undefined) {
    return { start: 0, end: size - 1 };
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(header);

  if (match === null) {
    return null;
  }

  const first = match[1] ?? "";
  const last = match[2] ?? "";

  if (first === "" && last === "") {
    return null;
  }

  let start: number;
  let end: number;

  if (first === "") {
    const suffix = Number(last);

    if (!Number.isSafeInteger(suffix) || suffix <= 0) {
      return null;
    }

    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(first);
    end = last === "" ? size - 1 : Number(last);

    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end < start ||
      start >= size
    ) {
      return null;
    }

    end = Math.min(end, size - 1);
  }

  return { start, end };
};

const sendError = (
  response: ServerResponse,
  status: number,
  message: string,
  extraHeaders: Record<string, string> = {},
): void => {
  response.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "access-control-allow-origin": "*",
    "cache-control": "no-store",
    ...extraHeaders,
  });

  response.end(message);
};

const serveRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  token: string,
  port: number,
): Promise<void> => {
  const url = new URL(request.url ?? "/", `http://${HOST}:${String(port)}`);

  const match = /^\/video\/([0-9a-f]{64})\/([a-zA-Z0-9_-]+)$/.exec(url.pathname);

  if (request.headers.host !== `${HOST}:${String(port)}` || match === null || url.search !== "") {
    sendError(response, 404, "Not found");
    return;
  }

  const providedToken = match[1] ?? "";
  const id = match[2] ?? "";

  const validToken =
    providedToken.length === token.length &&
    timingSafeEqual(Buffer.from(providedToken), Buffer.from(token));

  if (!validToken) {
    sendError(response, 404, "Not found");
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendError(response, 405, "Method not allowed", {
      allow: "GET, HEAD",
    });
    return;
  }

  let filePath: string;
  let storedName: string;
  let registeredSize: number;

  try {
    const resolved = await resolveLibraryVideo(id);

    filePath = resolved.filePath;
    storedName = resolved.item.storedName;
    registeredSize = resolved.item.size;
  } catch {
    sendError(response, 404, "Video not found");
    return;
  }

  const contentType = CONTENT_TYPES[extname(storedName).toLowerCase()];

  if (contentType === undefined) {
    sendError(response, 415, "Unsupported media");
    return;
  }

  const flags =
    process.platform === "win32" ? constants.O_RDONLY : constants.O_RDONLY | constants.O_NOFOLLOW;

  const handle = await open(filePath, flags);

  let streamStarted = false;

  try {
    const info = await handle.stat();

    if (
      !info.isFile() ||
      !Number.isSafeInteger(info.size) ||
      info.size <= 0 ||
      info.size !== registeredSize
    ) {
      sendError(response, 409, "Video file changed");
      return;
    }

    const rangeHeader = request.headers.range;
    const range = readRange(rangeHeader, info.size);

    if (range === null) {
      sendError(response, 416, "Invalid range", {
        "content-range": `bytes */${String(info.size)}`,
        "accept-ranges": "bytes",
      });
      return;
    }

    const isPartial = rangeHeader !== undefined;
    const contentLength = range.end - range.start + 1;

    const headers = {
      "content-type": contentType,
      "content-length": String(contentLength),
      "accept-ranges": "bytes",
      "access-control-allow-origin": "*",
      "cross-origin-resource-policy": "cross-origin",
      "cache-control": "no-store",
      ...(isPartial
        ? {
            "content-range": `bytes ${String(range.start)}-${String(range.end)}/${String(info.size)}`,
          }
        : {}),
    };

    response.writeHead(isPartial ? 206 : 200, headers);

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    const stream = handle.createReadStream({
      start: range.start,
      end: range.end,
      autoClose: true,
    });

    streamStarted = true;

    response.on("close", () => {
      stream.destroy();
    });

    stream.on("error", (error: Error) => {
      console.error("Gallery video stream error:", getErrorMessage(error));

      response.destroy(error);
    });

    stream.pipe(response);
  } finally {
    if (!streamStarted) {
      await handle.close();
    }
  }
};

export const startGalleryVideoServer = async (): Promise<GalleryVideoServer> => {
  const token = randomBytes(32).toString("hex");

  let listeningPort = 0;

  const server: Server = createServer((request, response) => {
    void serveRequest(request, response, token, listeningPort).catch((error: unknown) => {
      console.error("Gallery video request failed:", getErrorMessage(error));

      if (!response.headersSent) {
        sendError(response, 500, "Internal server error");
      } else {
        response.destroy();
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      reject(error);
    };

    const onListening = (): void => {
      server.off("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(0, HOST);
  });

  const address = server.address();

  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("Library動画サーバーのポートを取得できません。");
  }

  listeningPort = address.port;
  server.unref();

  return {
    urlForId(id: string): string {
      if (!VIDEO_ID_PATTERN.test(id)) {
        throw new Error("Library動画IDが不正です。");
      }

      return `http://${HOST}:${String(listeningPort)}` + `/video/${token}/${id}`;
    },

    close: (): Promise<void> => {
      if (!server.listening) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });

        server.closeAllConnections();
      });
    },
  };
};
