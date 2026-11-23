import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getEnv } from "@/lib/config/env";
import { AppError, USER_MESSAGES } from "@/lib/errors";
import { clientIp, errorResponse, json } from "@/lib/http";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { requireSessionId } from "@/lib/security/session";
import { getStore } from "@/lib/storage";
import { ALLOWED_TYPES, inspectImage, MAX_UPLOAD_BYTES, newUploadKey, uploadPathRegex } from "@/lib/uploads";

/**
 * POST /api/upload
 *
 * Production (Vercel Blob configured): the browser uploads the file DIRECTLY to
 * private Blob storage. This route only issues a short-lived, scoped upload
 * token after checking the session, path, type and size — the image never
 * passes through our serverless function body.
 *
 * Local development (no Blob token): accepts multipart/form-data and saves to
 * ./.data. This fallback is refused on Vercel.
 */
export async function POST(req: Request) {
  try {
    const env = getEnv();
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      if (!env.blob.token) throw new AppError("SERVICE_NOT_CONFIGURED", USER_MESSAGES.uploadsUnavailable, { internal: "BLOB_READ_WRITE_TOKEN is not set" });
      const body = (await req.json()) as HandleUploadBody;
      const result = await handleUpload({
        body,
        request: req,
        token: env.blob.token,
        onBeforeGenerateToken: async (pathname) => {
          const ownerId = await requireSessionId();
          checkRateLimit("upload", `${ownerId}:${clientIp(req)}`);
          if (!uploadPathRegex(ownerId).test(pathname)) throw new AppError("FORBIDDEN", "Invalid upload path.");
          return {
            allowedContentTypes: [...ALLOWED_TYPES],
            maximumSizeInBytes: MAX_UPLOAD_BYTES,
            addRandomSuffix: true,
            allowOverwrite: false,
            validUntil: Date.now() + 10 * 60_000,
            ttlDays: 1,
          };
        },
      });
      return json(result);
    }

    if (contentType.includes("multipart/form-data")) {
      if (getStore().mode !== "local") throw new AppError("BAD_REQUEST", USER_MESSAGES.uploadsUnavailable, { internal: "multipart upload attempted while Blob storage is active" });
      const ownerId = await requireSessionId();
      checkRateLimit("upload", `${ownerId}:${clientIp(req)}`);
      const len = Number(req.headers.get("content-length") ?? "0");
      if (len > MAX_UPLOAD_BYTES + 100_000) throw new AppError("PAYLOAD_TOO_LARGE", "Images must be 10 MB or smaller.");
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new AppError("BAD_REQUEST", "No file was provided.");
      const buf = Buffer.from(await file.arrayBuffer());
      const info = await inspectImage(buf);
      const key = newUploadKey(ownerId, info.contentType);
      await getStore().put(key, buf, info.contentType, { ttlDays: 1 });
      return json({ pathname: key });
    }

    throw new AppError("UNSUPPORTED_MEDIA", "This upload could not be processed. Please choose the image again.");
  } catch (e) {
    return errorResponse(e, "upload");
  }
}
