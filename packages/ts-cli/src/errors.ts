export class ApiError extends Error {
  code: string;
  httpStatus?: number;
  exitCode: number;

  constructor(
    code: string,
    message: string,
    opts: { httpStatus?: number; exitCode?: number } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.httpStatus = opts.httpStatus;
    this.exitCode =
      opts.exitCode ??
      (opts.httpStatus === 401 ? 2 : opts.httpStatus && opts.httpStatus >= 500 ? 3 : 1);
  }
}

export function exitCodeForHttp(status: number): number {
  if (status === 401) return 2;
  if (status >= 500) return 3;
  return 1;
}
