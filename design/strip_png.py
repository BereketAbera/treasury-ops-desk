#!/usr/bin/env python3
"""Rewrites PNG files with only the chunks an image needs, so no text or time metadata is kept.

Standard library only.  python3 strip_png.py a.png b.png
"""
import struct
import sys
import zlib

KEEP = {b"IHDR", b"PLTE", b"tRNS", b"IDAT", b"IEND", b"sRGB", b"gAMA"}
SIGNATURE = b"\x89PNG\r\n\x1a\n"


def chunks(data):
    position = len(SIGNATURE)
    while position < len(data):
        (length,) = struct.unpack(">I", data[position : position + 4])
        kind = data[position + 4 : position + 8]
        yield kind, data[position + 8 : position + 8 + length]
        position += 12 + length


def strip(path):
    with open(path, "rb") as handle:
        data = handle.read()
    if not data.startswith(SIGNATURE):
        raise SystemExit(f"{path} is not a PNG")
    out = [SIGNATURE]
    dropped = []
    for kind, body in chunks(data):
        if kind in KEEP:
            out.append(struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body)))
        else:
            dropped.append(kind.decode("ascii"))
    with open(path, "wb") as handle:
        handle.write(b"".join(out))
    print(f"{path}: dropped {', '.join(dropped) if dropped else 'nothing'}")


if __name__ == "__main__":
    for name in sys.argv[1:]:
        strip(name)
