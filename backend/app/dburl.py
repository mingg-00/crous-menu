from urllib.parse import unquote


def parse_database_url(url: str) -> dict:
    """Connection arguments from a postgres URL, tolerant of unescaped passwords.

    Splits on the LAST '@' (a host never contains one), so a password may hold '@', '/', '#', '?' or ':'
    exactly as pasted from a dashboard; standard URL parsers cut at the first '@' and misread the host.
    Percent-escapes (%40) are still decoded.
    """
    rest = url.strip().strip("\"'")
    rest = rest.split("://", 1)[1] if "://" in rest else rest
    userinfo, _, hostpart = rest.rpartition("@")
    user, _, password = userinfo.partition(":")
    hostport, _, dbname = hostpart.partition("/")
    host, _, port = hostport.partition(":")
    args = {
        "host": host,
        "port": int(port) if port else None,
        "user": unquote(user),
        "password": unquote(password),
        "dbname": dbname.split("?")[0],
    }
    return {k: v for k, v in args.items() if v not in ("", None)}
