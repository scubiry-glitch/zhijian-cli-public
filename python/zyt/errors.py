from __future__ import annotations


class ApiError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        http_status: int | None = None,
        exit_code: int | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.http_status = http_status
        if exit_code is not None:
            self.exit_code = exit_code
        elif http_status == 401:
            self.exit_code = 2
        elif http_status is not None and http_status >= 500:
            self.exit_code = 3
        else:
            self.exit_code = 1


def exit_code_for_http(status: int) -> int:
    if status == 401:
        return 2
    if status >= 500:
        return 3
    return 1
