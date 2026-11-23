"""
Downloads a picture from a link that a user pasted into the app.

Because the SERVER makes this request, it must not be possible to use it to reach things inside
our own network (a "server-side request forgery" attack). So:

  * only http:// and https:// links are accepted, and links with a user name/password are refused
  * the website name is looked up first, and if ANY of its addresses is private, local or
    internal (127.x, 10.x, 192.168.x, 169.254.x, ...) the link is refused
  * the connection is then made to the exact address that was checked, so the website cannot
    change its answer in between
  * every redirect is checked again the same way, and there are at most 4 of them
  * the download stops at 20 MB and after 30 seconds
  * only picture files are accepted (a web page is refused with a helpful hint)

Only the Python standard library is used, so nothing new has to be installed.
"""
import http.client
import ipaddress
import os
import re
import socket
import ssl
import time
from dataclasses import dataclass
from typing import List
from urllib.parse import unquote, urljoin, urlsplit

MAX_BYTES = 20 * 1024 * 1024
MAX_REDIRECTS = 4
CONNECT_TIMEOUT = 12
TOTAL_SECONDS = 30
CHUNK = 64 * 1024

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/124.0 Safari/537.36",
    "Accept": "image/*,*/*;q=0.5",
    "Accept-Encoding": "identity",  # no compression, so the size limit means what it says
    "Connection": "close",
}

CONTENT_TYPE_EXT = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/heic": ".heic",
    "image/heif": ".heif",
    "image/bmp": ".bmp",
    "image/tiff": ".tiff",
}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif", ".bmp", ".tif", ".tiff"}

_NAT64 = ipaddress.ip_network("64:ff9b::/96")
_SIX_TO_FOUR = ipaddress.ip_network("2002::/16")


class UrlFetchError(Exception):
    """A problem the user can understand and fix. The message is shown to them as it is."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


@dataclass
class FetchedImage:
    content: bytes
    filename: str
    content_type: str
    final_url: str

    @property
    def ext(self) -> str:
        return os.path.splitext(self.filename)[1] or ".jpg"


# ---------- checking the link ----------

def _clean_url(url: str) -> str:
    url = (url or "").strip()
    if not url or len(url) > 2048 or any(c.isspace() for c in url):
        raise UrlFetchError("That doesn't look like a link. Paste the full address of the image.")
    if "://" not in url:
        url = "https://" + url
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https"):
        raise UrlFetchError("Only web links (starting with http:// or https://) can be checked.")
    if not parts.hostname:
        raise UrlFetchError("That doesn't look like a link. Paste the full address of the image.")
    if parts.username or parts.password:
        raise UrlFetchError("Links that contain a user name or password can't be checked.")
    try:
        parts.port  # raises ValueError for a bad port such as :99999
    except ValueError:
        raise UrlFetchError("That link has an invalid port number.")
    return url


def _resolve_public(host: str, port: int) -> List[str]:
    """The addresses of this website, and only if every one of them is a normal public address."""
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except (socket.gaierror, UnicodeError):
        raise UrlFetchError("We couldn't find that website. Check the link and try again.")

    ips: List[str] = []
    for info in infos:
        ip_text = info[4][0].split("%")[0]
        addr = ipaddress.ip_address(ip_text)
        if addr.version == 6:
            if addr.ipv4_mapped is not None:
                addr = addr.ipv4_mapped
            elif addr in _NAT64 or addr in _SIX_TO_FOUR:
                raise UrlFetchError("That link points to a private or internal address, so it can't be checked.")
        if not addr.is_global:
            raise UrlFetchError("That link points to a private or internal address, so it can't be checked.")
        if ip_text not in ips:
            ips.append(ip_text)
    if not ips:
        raise UrlFetchError("We couldn't find that website. Check the link and try again.")
    return ips


# ---------- connecting to the checked address ----------

class _PinnedHTTP(http.client.HTTPConnection):
    def __init__(self, host, port, ip, timeout):
        super().__init__(host, port, timeout=timeout)
        self._ip = ip

    def connect(self):
        self.sock = socket.create_connection((self._ip, self.port), self.timeout)


class _PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self, host, port, ip, timeout):
        super().__init__(host, port, timeout=timeout, context=ssl.create_default_context())
        self._ip = ip

    def connect(self):
        raw = socket.create_connection((self._ip, self.port), self.timeout)
        # the certificate is checked against the website's real name, not the address
        self.sock = self._context.wrap_socket(raw, server_hostname=self.host)


def _request(parts, ips: List[str]):
    """Sends the GET request to the first address that answers. Returns (response, connection)."""
    https = parts.scheme == "https"
    port = parts.port or (443 if https else 80)
    path = parts.path or "/"
    if parts.query:
        path += "?" + parts.query

    last_error = None
    for ip in ips:
        conn_class = _PinnedHTTPS if https else _PinnedHTTP
        conn = conn_class(parts.hostname, port, ip, CONNECT_TIMEOUT)
        try:
            conn.request("GET", path, headers=HEADERS)
            return conn.getresponse(), conn
        except ssl.SSLError:
            conn.close()
            raise UrlFetchError("The secure connection to that website failed, so the image can't be downloaded.")
        except (OSError, http.client.HTTPException) as e:
            last_error = e
            conn.close()
    raise UrlFetchError("The website did not answer in time. Try again, or use a different link.")


def _status_message(status: int) -> str:
    if status in (401, 403):
        return "That website refused the download. Save the image to your phone and choose it as a file instead."
    if status in (404, 410):
        return "That link doesn't lead to anything (not found). Check it and try again."
    if status == 429:
        return "That website is limiting downloads right now. Try again in a few minutes."
    return f"The website answered with an error ({status}). Try a different link."


# ---------- reading the answer ----------

def _filename(url: str, content_type: str) -> str:
    name = unquote(os.path.basename(urlsplit(url).path))
    name = re.sub(r"[^A-Za-z0-9._ -]", "_", name).strip(" ._")[:80]
    stem, ext = os.path.splitext(name)
    ext = ext.lower()
    wanted = CONTENT_TYPE_EXT.get(content_type)
    if wanted:
        # trust what the website says the file is (".jpg" and ".jpeg" are the same thing)
        if not (wanted == ".jpg" and ext in (".jpg", ".jpeg")):
            ext = wanted
    elif ext not in IMAGE_EXTS:
        ext = ".jpg"
    return (stem or "image-from-link") + ext


def _read_body(resp, url: str, deadline: float) -> FetchedImage:
    content_type = (resp.getheader("Content-Type") or "").split(";")[0].strip().lower()

    if content_type in ("text/html", "application/xhtml+xml"):
        raise UrlFetchError(
            "That link is a web page, not a picture. Open the page, press and hold the image, "
            "choose \"Copy image address\", and paste that link here."
        )
    if content_type == "image/svg+xml":
        raise UrlFetchError("SVG drawings can't be checked. Use a photo link (JPG, PNG or WebP).")
    if content_type and not (
        content_type.startswith("image/") or content_type in ("application/octet-stream", "binary/octet-stream")
    ):
        raise UrlFetchError("That link is not an image file.")

    too_big = f"That image is too large (the limit is {MAX_BYTES // (1024 * 1024)} MB)."
    length = resp.getheader("Content-Length")
    if length and length.isdigit() and int(length) > MAX_BYTES:
        raise UrlFetchError(too_big)

    chunks = []
    total = 0
    while True:
        if time.monotonic() > deadline:
            raise UrlFetchError("The download took too long. Try again, or use a different link.")
        try:
            chunk = resp.read(CHUNK)
        except (OSError, http.client.HTTPException):
            raise UrlFetchError("The download was interrupted. Try again.")
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_BYTES:
            raise UrlFetchError(too_big)
        chunks.append(chunk)

    if total == 0:
        raise UrlFetchError("The link returned an empty file.")
    return FetchedImage(
        content=b"".join(chunks),
        filename=_filename(url, content_type),
        content_type=content_type,
        final_url=url,
    )


def fetch_image(url: str) -> FetchedImage:
    """Downloads the picture behind a link. Raises UrlFetchError with a message for the user."""
    deadline = time.monotonic() + TOTAL_SECONDS
    current = _clean_url(url)

    for _ in range(MAX_REDIRECTS + 1):
        parts = urlsplit(current)
        port = parts.port or (443 if parts.scheme == "https" else 80)
        ips = _resolve_public(parts.hostname, port)
        resp, conn = _request(parts, ips)
        try:
            if resp.status in (301, 302, 303, 307, 308):
                location = resp.getheader("Location")
                if not location:
                    raise UrlFetchError("That link redirects to nowhere.")
                current = _clean_url(urljoin(current, location))
                continue
            if resp.status != 200:
                raise UrlFetchError(_status_message(resp.status))
            return _read_body(resp, current, deadline)
        finally:
            conn.close()

    raise UrlFetchError("That link redirects too many times.")