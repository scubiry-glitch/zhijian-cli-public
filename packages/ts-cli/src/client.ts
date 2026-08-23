import { ApiError, exitCodeForHttp } from "./errors.js";

/** 贝壳 WAF 会拦截默认 undici/Python-urllib UA；使用常规浏览器 UA */
export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export type ZytClientOptions = {
  baseUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  /** 跳过 TLS 校验（仅测试环境自签证书） */
  insecure?: boolean;
  userAgent?: string;
};

function looksLikeWafHtml(text: string): boolean {
  return (
    text.includes("访问已被拦截") ||
    text.includes("贝壳信息安全中心") ||
    /<title[^>]*>\s*访问已被拦截/i.test(text)
  );
}

export class ZytClient {
  private baseUrl: string;
  private apiKey?: string;
  private fetchImpl: typeof fetch;
  private insecure: boolean;
  private userAgent: string;

  constructor(opts: ZytClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.insecure = Boolean(opts.insecure);
    this.userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
  }

  async request<T = unknown>(
    method: string,
    path: string,
    opts: { query?: Record<string, string | number | undefined | null>; body?: unknown } = {},
  ): Promise<T> {
    if (!this.apiKey) {
      throw new ApiError(
        "MISSING_API_KEY",
        "未配置 API Key。请设置 ZYT_API_KEY、写入仓库 `.zyt/config.json`，或运行：zyt 配置 设置 --api-key <key>（向智见开放 API 管理员申请）",
        {
          exitCode: 2,
        },
      );
    }

    const full = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const u = new URL(full);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v === undefined || v === null || v === "") continue;
        u.searchParams.set(k, String(v));
      }
    }

    let res: Response;
    const prevTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    try {
      if (this.insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
      res = await this.fetchImpl(u.toString(), {
        method,
        headers: {
          "X-Api-Key": this.apiKey,
          Accept: "application/json",
          "User-Agent": this.userAgent,
          ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    } catch (e) {
      throw new ApiError("NETWORK_ERROR", e instanceof Error ? e.message : String(e), {
        exitCode: 3,
      });
    } finally {
      if (this.insecure) {
        if (prevTls === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTls;
      }
    }

    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }

    if (!res.ok) {
      if (res.status === 403 && looksLikeWafHtml(text)) {
        throw new ApiError(
          "WAF_BLOCKED",
          "贝壳 WAF 拦截（HTML「访问已被拦截」）。请确认客户端已带浏览器 User-Agent；若仍失败可换网络或联系 API 管理员",
          { httpStatus: 403, exitCode: 3 },
        );
      }
      const errObj = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
      const code =
        (typeof errObj.code === "string" && errObj.code) ||
        (errObj.error && typeof errObj.error === "object" && typeof (errObj.error as { code?: string }).code === "string"
          ? (errObj.error as { code: string }).code
          : undefined) ||
        (res.status === 401 ? "INVALID_API_KEY" : "HTTP_ERROR");
      const message =
        (typeof errObj.message === "string" && errObj.message) ||
        (errObj.error && typeof errObj.error === "object" && typeof (errObj.error as { message?: string }).message === "string"
          ? (errObj.error as { message: string }).message
          : undefined) ||
        res.statusText ||
        `HTTP ${res.status}`;
      throw new ApiError(code, message, {
        httpStatus: res.status,
        exitCode: exitCodeForHttp(res.status),
      });
    }

    return data as T;
  }

  get<T = unknown>(path: string, query?: Record<string, string | number | undefined | null>) {
    return this.request<T>("GET", path, { query });
  }

  post<T = unknown>(path: string, body: unknown) {
    return this.request<T>("POST", path, { body });
  }
}
