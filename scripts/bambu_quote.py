#!/usr/bin/env python3
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile
from pathlib import Path
from xml.etree import ElementTree


DEFAULTS = {
    "pla_krw_per_g": 95,
    "machine_krw_per_hour": 2600,
    "electricity_krw_per_kwh": 160,
    "average_watts": 120,
    "file_review_krw": 3000,
    "failure_margin": 0.12,
}


def find_bambu_studio():
    env_path = os.environ.get("BAMBU_STUDIO_CLI")
    candidates = [
        env_path,
        "/Applications/BambuStudio.app/Contents/MacOS/bambu-studio",
        "/Applications/BambuStudio.app/Contents/MacOS/BambuStudio",
        "/Applications/Bambu Studio.app/Contents/MacOS/bambu-studio",
        "/Applications/Bambu Studio.app/Contents/MacOS/BambuStudio",
        shutil.which("bambu-studio"),
        shutil.which("BambuStudio"),
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return str(Path(candidate))
    return None


def run_slicer(cli, input_path, output_dir, machine=None, process=None, filament=None, plate=0):
    output_dir.mkdir(parents=True, exist_ok=True)
    output_3mf = output_dir / f"{input_path.stem}.sliced.3mf"
    cmd = [cli, "--debug", "2", "--slice", str(plate), "--export-3mf", str(output_3mf)]

    if input_path.suffix.lower() != ".3mf":
        if not (machine and process and filament):
            raise RuntimeError("STL/OBJ/STEP slicing needs machine, process, and filament preset JSON files.")
        cmd = [
            cli,
            "--orient",
            "--arrange",
            "1",
            "--load-settings",
            f"{machine};{process}",
            "--load-filaments",
            str(filament),
            "--debug",
            "2",
            "--slice",
            str(plate),
            "--export-3mf",
            str(output_3mf),
        ]

    cmd.append(str(input_path))
    started = time.time()
    result = subprocess.run(cmd, text=True, capture_output=True, timeout=180)
    duration = time.time() - started
    if result.returncode != 0:
        raise RuntimeError(
            json.dumps(
                {
                    "message": "Bambu Studio CLI slicing failed.",
                    "returncode": result.returncode,
                    "stdout": result.stdout[-4000:],
                    "stderr": result.stderr[-4000:],
                    "command": cmd,
                },
                ensure_ascii=False,
            )
        )
    if not output_3mf.exists():
        raise RuntimeError("Bambu Studio CLI finished, but no sliced 3MF was created.")
    return output_3mf, duration, result.stdout + result.stderr


def as_float(value):
    if value is None:
        return None
    try:
        return float(str(value).strip())
    except ValueError:
        return None


def parse_duration(value):
    if value is None:
        return None
    value = str(value).strip()
    numeric = as_float(value)
    if numeric is not None:
        return numeric
    total = 0
    matched = False
    for amount, unit in re.findall(r"(\d+(?:\.\d+)?)\s*([dhms])", value.lower()):
        matched = True
        amount = float(amount)
        if unit == "d":
            total += amount * 86400
        elif unit == "h":
            total += amount * 3600
        elif unit == "m":
            total += amount * 60
        elif unit == "s":
            total += amount
    return total if matched else None


def parse_xml_metadata(text):
    stats = {"filaments": [], "print_time_seconds": None}
    try:
        root = ElementTree.fromstring(text)
    except ElementTree.ParseError:
        return stats

    for element in root.iter():
        attrs = {key.lower(): value for key, value in element.attrib.items()}
        tag = element.tag.lower()
        if "filament" in tag or "filament" in attrs.get("type", ""):
            grams = None
            meters = None
            for key in ("used_g", "weight_g", "filament_used_g", "grams"):
                grams = grams or as_float(attrs.get(key))
            for key in ("used_m", "filament_used_m", "meters"):
                meters = meters or as_float(attrs.get(key))
            if grams is not None or meters is not None:
                stats["filaments"].append(
                    {
                        "id": attrs.get("id"),
                        "type": attrs.get("type") or attrs.get("filament_type"),
                        "used_g": grams,
                        "used_m": meters,
                    }
                )
        for key in ("print_time", "printing_time", "estimated_time", "total_time", "time"):
            seconds = parse_duration(attrs.get(key))
            if seconds and (stats["print_time_seconds"] is None or seconds > stats["print_time_seconds"]):
                stats["print_time_seconds"] = seconds
    return stats


def parse_gcode_metadata(text):
    stats = {"filaments": [], "print_time_seconds": None}
    grams = None
    meters = None
    for line in text.splitlines()[:500]:
        lower = line.lower()
        if "filament" in lower and ("g" in lower or "gram" in lower):
            match = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*g", lower)
            if match:
                grams = float(match.group(1))
        if "filament" in lower and ("m" in lower or "meter" in lower):
            match = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*m", lower)
            if match:
                meters = float(match.group(1))
        if "estimated" in lower or "total time" in lower or "print time" in lower:
            seconds = parse_duration(lower)
            if seconds and (stats["print_time_seconds"] is None or seconds > stats["print_time_seconds"]):
                stats["print_time_seconds"] = seconds
    if grams is not None or meters is not None:
        stats["filaments"].append({"id": "1", "type": None, "used_g": grams, "used_m": meters})
    return stats


def merge_stats(stats_list):
    merged = {"filaments": [], "print_time_seconds": None}
    for stats in stats_list:
        merged["filaments"].extend(stats.get("filaments", []))
        seconds = stats.get("print_time_seconds")
        if seconds and (merged["print_time_seconds"] is None or seconds > merged["print_time_seconds"]):
            merged["print_time_seconds"] = seconds
    return merged


def parse_sliced_3mf(path):
    stats = []
    with zipfile.ZipFile(path) as archive:
        for name in archive.namelist():
            lower = name.lower()
            if lower.endswith("slice_info.config") or lower.endswith(".xml"):
                try:
                    stats.append(parse_xml_metadata(archive.read(name).decode("utf-8", errors="ignore")))
                except Exception:
                    pass
            elif lower.endswith(".gcode"):
                try:
                    stats.append(parse_gcode_metadata(archive.read(name).decode("utf-8", errors="ignore")))
                except Exception:
                    pass
    return merge_stats(stats)


def calculate_quote(stats, options):
    grams = sum(item.get("used_g") or 0 for item in stats["filaments"])
    seconds = stats.get("print_time_seconds") or 0
    hours = seconds / 3600
    material = grams * options["pla_krw_per_g"]
    machine = hours * options["machine_krw_per_hour"]
    electricity = hours * (options["average_watts"] / 1000) * options["electricity_krw_per_kwh"]
    subtotal = material + machine + electricity + options["file_review_krw"]
    margin = subtotal * options["failure_margin"]
    total = int(((subtotal + margin) + 999) // 1000 * 1000)
    return {
        "filament_g": round(grams, 2),
        "print_time_seconds": round(seconds),
        "print_time_hours": round(hours, 2),
        "material_krw": round(material),
        "machine_krw": round(machine),
        "electricity_krw": round(electricity),
        "file_review_krw": options["file_review_krw"],
        "failure_margin_krw": round(margin),
        "total_krw": total,
    }


def main():
    parser = argparse.ArgumentParser(description="Slice with Bambu Studio CLI and return quote JSON.")
    parser.add_argument("input", type=Path)
    parser.add_argument("--cli", default=find_bambu_studio())
    parser.add_argument("--machine")
    parser.add_argument("--process")
    parser.add_argument("--filament")
    parser.add_argument("--output-dir", type=Path, default=Path("tmp/slices"))
    parser.add_argument("--parse-only", action="store_true", help="Parse an already-sliced .3mf without running CLI.")
    for key, value in DEFAULTS.items():
        parser.add_argument(f"--{key.replace('_', '-')}", type=float, default=value)
    args = parser.parse_args()

    options = {key: getattr(args, key) for key in DEFAULTS}
    input_path = args.input.resolve()
    if not input_path.exists():
        raise SystemExit(f"Input file not found: {input_path}")

    if args.parse_only:
        sliced_path = input_path
        slicer_seconds = 0
    else:
        if not args.cli:
            raise SystemExit(
                "Bambu Studio CLI not found. Install Bambu Studio or set BAMBU_STUDIO_CLI=/path/to/bambu-studio."
            )
        sliced_path, slicer_seconds, _ = run_slicer(
            args.cli,
            input_path,
            args.output_dir,
            machine=args.machine,
            process=args.process,
            filament=args.filament,
        )

    stats = parse_sliced_3mf(sliced_path)
    quote = calculate_quote(stats, options)
    print(
        json.dumps(
            {
                "ok": True,
                "input": str(input_path),
                "sliced_3mf": str(sliced_path),
                "slicer_seconds": round(slicer_seconds, 2),
                "stats": stats,
                "quote": quote,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
