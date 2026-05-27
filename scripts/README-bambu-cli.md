# Bambu Studio CLI Quote Prototype

This prototype runs Bambu Studio locally/server-side, exports a sliced 3MF, then parses slicer metadata to estimate:

- filament grams
- print time
- material cost
- machine time cost
- electricity cost
- file review fee
- failure margin

Official CLI reference: <https://github.com/bambulab/BambuStudio/wiki/Command-Line-Usage>

## Requirements

Install Bambu Studio on the server or Mac that runs this command.

If the executable is not found automatically, set:

```bash
export BAMBU_STUDIO_CLI="/Applications/BambuStudio.app/Contents/MacOS/bambu-studio"
```

## Parse an already sliced 3MF

```bash
scripts/bambu_quote.py --parse-only path/to/sliced.gcode.3mf
```

## Slice a 3MF that already contains settings

```bash
scripts/bambu_quote.py path/to/project.3mf
```

## Slice STL/OBJ/STEP with fixed presets

STL slicing needs full exported preset JSON files:

```bash
scripts/bambu_quote.py model.stl \
  --machine presets/machine.json \
  --process presets/process.json \
  --filament presets/filament.json
```

Bambu Studio's CLI documentation says STL slicing requires machine, process, and filament settings loaded through `--load-settings` and `--load-filaments`.

## Current pricing defaults

- PLA: 95 KRW/g
- machine time: 2,600 KRW/hour
- average power: 120 W
- electricity: 160 KRW/kWh
- file review: 3,000 KRW
- failure margin: 12%

These are CLI flags, so they can be changed without editing code.
