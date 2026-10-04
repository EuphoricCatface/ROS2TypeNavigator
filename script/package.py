#!/usr/bin/env python3
# Copyright (C) 2026 Seongyong Park and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Validate and create reproducible Firefox/Chrome upload ZIPs; no publishing."""

from copy import deepcopy
import json
import os
from pathlib import Path
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent


def main():
    subprocess.run(["node", str(ROOT / "script/test.mjs")], cwd=ROOT, check=True)
    result = subprocess.run(
        ["node", "--input-type=module", "-e",
         "import { validateExtension } from './script/validate.mjs'; "
         "console.log(JSON.stringify(validateExtension('extension')));"],
        cwd=ROOT, check=True, capture_output=True, text=True,
    )
    validated = json.loads(result.stdout)
    manifest = validated["manifest"]
    output = ROOT / "dist"
    output.mkdir(exist_ok=True)

    for browser in ("firefox", "chrome"):
        packaged_manifest = deepcopy(manifest)
        if browser == "chrome":
            packaged_manifest.pop("browser_specific_settings", None)
        destination = output / f"ros2-type-navigator-{manifest['version']}-{browser}.zip"
        with tempfile.NamedTemporaryFile(dir=output, suffix=".tmp", delete=False) as handle:
            temporary = Path(handle.name)
        try:
            with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
                for name in sorted([*validated["files"], "LICENSE", "PRIVACY.md"]):
                    if name == "manifest.json":
                        content = (json.dumps(packaged_manifest, indent=2, ensure_ascii=False) + "\n").encode()
                    else:
                        source = ROOT / name if name in ("LICENSE", "PRIVACY.md") else ROOT / "extension" / name
                        content = source.read_bytes()
                    # Stable timestamps and modes make unchanged packages reproducible.
                    info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                    info.create_system = 3
                    info.external_attr = 0o100644 << 16
                    info.compress_type = zipfile.ZIP_DEFLATED
                    archive.writestr(info, content, compresslevel=9)
            with zipfile.ZipFile(temporary) as archive:
                if archive.testzip() is not None:
                    raise ValueError("Package failed its ZIP integrity check.")
            os.replace(temporary, destination)
        finally:
            temporary.unlink(missing_ok=True)
        print(destination.relative_to(ROOT))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error)) from error
