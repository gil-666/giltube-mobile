"""Publish GilTube Android releases with the Google Play Developer API.

Authenticates as the google-play-publisher service account. The key file is
read from $GILTUBE_PLAY_KEY (default: /home/gil/giltube/giltube-app-d9c2d9c49e1a.json)
and must never be committed. Requires the `cryptography` package.

Usage:
  python3 play-store/publish.py tracks
      List every track and its releases (read-only; the edit is discarded).

  python3 play-store/publish.py release --aab AAB --version-code CODE --name NAME
      --notes NOTES_JSON [--symbols ZIP] TRACK [TRACK ...]
      Upload AAB and make it the completed release on each TRACK in a single
      edit. "Closed testing" is the `alpha` track; internal testing is `internal`.
      NOTES_JSON is a list of {"language": ..., "text": ...} objects
      (see play-store/release-notes/).

Example:
  python3 play-store/publish.py release \\
      --aab dist/play-store-0.9.38/GilTube-0.9.38-play-store.aab \\
      --version-code 52 --name "0.9.38 (52)" \\
      --notes play-store/release-notes/0.9.38.json internal alpha
"""
import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

KEY_FILE = os.environ.get("GILTUBE_PLAY_KEY", "/home/gil/giltube/giltube-app-d9c2d9c49e1a.json")
PACKAGE = "com.gilservers.giltube"
API = f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PACKAGE}"
UPLOAD = f"https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/{PACKAGE}"


def b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=")


def token():
    with open(KEY_FILE) as f:
        key = json.load(f)
    now = int(time.time())
    header = b64(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    claims = b64(json.dumps({
        "iss": key["client_email"],
        "scope": "https://www.googleapis.com/auth/androidpublisher",
        "aud": key["token_uri"],
        "iat": now,
        "exp": now + 3600,
    }).encode())
    private_key = serialization.load_pem_private_key(key["private_key"].encode(), password=None)
    signature = b64(private_key.sign(header + b"." + claims, padding.PKCS1v15(), hashes.SHA256()))
    assertion = (header + b"." + claims + b"." + signature).decode()
    body = f"grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion={assertion}".encode()
    req = urllib.request.Request(key["token_uri"], data=body, headers={"Content-Type": "application/x-www-form-urlencoded"})
    return json.load(urllib.request.urlopen(req))["access_token"]


def call(tok, method, url, body=None, data=None, content_type="application/json"):
    headers = {"Authorization": f"Bearer {tok}"}
    if body is not None:
        data = json.dumps(body).encode()
    if data is not None:
        headers["Content-Type"] = content_type
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        resp = urllib.request.urlopen(req, timeout=1800)
    except urllib.error.HTTPError as err:
        sys.exit(f"{method} {url} -> {err.code}: {err.read().decode()}")
    raw = resp.read()
    return json.loads(raw) if raw else {}


def read_bytes(path):
    with open(path, "rb") as f:
        return f.read()


def list_tracks(tok):
    edit = call(tok, "POST", f"{API}/edits", {})["id"]
    try:
        tracks = call(tok, "GET", f"{API}/edits/{edit}/tracks")
        print(json.dumps(tracks, indent=1, ensure_ascii=False))
    finally:
        call(tok, "DELETE", f"{API}/edits/{edit}")


def release(tok, aab, symbols, version_code, name, notes, tracks):
    edit = call(tok, "POST", f"{API}/edits", {})["id"]
    print("edit", edit)
    bundle = call(tok, "POST", f"{UPLOAD}/edits/{edit}/bundles?uploadType=media",
                  data=read_bytes(aab), content_type="application/octet-stream")
    print("uploaded bundle versionCode", bundle.get("versionCode"), bundle.get("sha256"))
    if int(bundle["versionCode"]) != version_code:
        call(tok, "DELETE", f"{API}/edits/{edit}")
        sys.exit(f"bundle versionCode {bundle['versionCode']} != expected {version_code}; edit discarded")
    if symbols:
        call(tok, "POST", f"{UPLOAD}/edits/{edit}/apks/{version_code}/deobfuscationFiles/nativeCode?uploadType=media",
             data=read_bytes(symbols), content_type="application/octet-stream")
        print("uploaded native debug symbols")
    for track in tracks:
        new_release = {"name": name, "versionCodes": [str(version_code)], "status": "completed", "releaseNotes": notes}
        updated = call(tok, "PUT", f"{API}/edits/{edit}/tracks/{track}", {"track": track, "releases": [new_release]})
        print("track", track, "->", json.dumps(updated.get("releases"), ensure_ascii=False))
    committed = call(tok, "POST", f"{API}/edits/{edit}:commit")
    print("committed edit", committed.get("id"))


def main():
    parser = argparse.ArgumentParser(description="Publish GilTube Android releases to Google Play.")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("tracks", help="list tracks and their releases")
    rel = commands.add_parser("release", help="upload an AAB and release it on one or more tracks")
    rel.add_argument("--aab", required=True)
    rel.add_argument("--version-code", required=True, type=int)
    rel.add_argument("--name", required=True, help='release name, e.g. "0.9.38 (52)"')
    rel.add_argument("--notes", required=True, help="release notes JSON file")
    rel.add_argument("--symbols", help="native debug symbols zip for this build")
    rel.add_argument("tracks", nargs="+", help="e.g. internal alpha")
    args = parser.parse_args()

    tok = token()
    if args.command == "tracks":
        list_tracks(tok)
    else:
        with open(args.notes, encoding="utf-8") as f:
            notes = json.load(f)
        release(tok, args.aab, args.symbols, args.version_code, args.name, notes, args.tracks)


if __name__ == "__main__":
    main()
