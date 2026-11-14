import { prisma } from "@/lib/db";

export interface VerificationResult {
  ok: boolean;
  status: "VERIFIED" | "FAILED" | "WARNING";
  statusCode?: number;
  contentType?: string;
  finalUrl?: string;
  isAccessible: boolean;
  isDrive: boolean;
  driveDetails?: {
    fileId?: string;
    isPublic?: boolean;
    resourceType?: "file" | "folder" | "document" | "spreadsheets" | "presentation";
  };
  error?: string;
  checkedAt: string;
}

export function parseGoogleDriveUrl(url: string): {
  isDrive: boolean;
  fileId?: string;
  resourceType?: "file" | "folder" | "document" | "spreadsheets" | "presentation";
} {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("google.com") && !parsed.hostname.includes("drive.google.com")) {
      return { isDrive: false };
    }

    let fileId: string | undefined;
    let resourceType: "file" | "folder" | "document" | "spreadsheets" | "presentation" = "file";

    if (parsed.pathname.includes("/file/d/")) {
      const match = parsed.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (match) fileId = match[1];
    } else if (parsed.pathname.includes("/folders/")) {
      const match = parsed.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
      if (match) {
        fileId = match[1];
        resourceType = "folder";
      }
    } else if (parsed.pathname.includes("/document/d/")) {
      const match = parsed.pathname.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
      if (match) {
        fileId = match[1];
        resourceType = "document";
      }
    } else if (parsed.pathname.includes("/spreadsheets/d/")) {
      const match = parsed.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
      if (match) {
        fileId = match[1];
        resourceType = "spreadsheets";
      }
    } else if (parsed.pathname.includes("/presentation/d/")) {
      const match = parsed.pathname.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/);
      if (match) {
        fileId = match[1];
        resourceType = "presentation";
      }
    } else {
      fileId = parsed.searchParams.get("id") || undefined;
    }

    return {
      isDrive: Boolean(fileId),
      fileId,
      resourceType,
    };
  } catch {
    return { isDrive: false };
  }
}

export async function verifyDeliverableUrl(targetUrl: string): Promise<VerificationResult> {
  const checkedAt = new Date().toISOString();
  try {
    const parsed = new URL(targetUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return {
        ok: false,
        status: "FAILED",
        isAccessible: false,
        isDrive: false,
        error: "Invalid protocol. Only HTTP/HTTPS URLs are supported.",
        checkedAt,
      };
    }

    const driveInfo = parseGoogleDriveUrl(targetUrl);

    // Timeout-protected HEAD / GET fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    let res: Response;
    try {
      res = await fetch(targetUrl, {
        method: "HEAD",
        signal: controller.signal,
        headers: {
          "User-Agent": "TaskBoard OS-ArtifactVerifier/1.0",
        },
        redirect: "follow",
      });
      if (res.status === 405) {
        res = await fetch(targetUrl, {
          method: "GET",
          signal: controller.signal,
          headers: {
            "User-Agent": "TaskBoard OS-ArtifactVerifier/1.0",
          },
          redirect: "follow",
        });
      }
    } finally {
      clearTimeout(timeoutId);
    }

    const contentType = res.headers.get("content-type") || undefined;
    const isAccessible = res.ok || res.status < 400;

    return {
      ok: isAccessible,
      status: isAccessible ? "VERIFIED" : "FAILED",
      statusCode: res.status,
      contentType,
      finalUrl: res.url,
      isAccessible,
      isDrive: driveInfo.isDrive,
      driveDetails: driveInfo.isDrive
        ? {
            fileId: driveInfo.fileId,
            resourceType: driveInfo.resourceType,
            isPublic: isAccessible,
          }
        : undefined,
      checkedAt,
    };
  } catch (err: any) {
    const driveInfo = parseGoogleDriveUrl(targetUrl);
    return {
      ok: driveInfo.isDrive,
      status: driveInfo.isDrive ? "WARNING" : "FAILED",
      isAccessible: false,
      isDrive: driveInfo.isDrive,
      driveDetails: driveInfo.isDrive
        ? {
            fileId: driveInfo.fileId,
            resourceType: driveInfo.resourceType,
            isPublic: false,
          }
        : undefined,
      error: err.name === "AbortError" ? "Verification timed out" : err.message || "Failed to reach target URL",
      checkedAt,
    };
  }
}
