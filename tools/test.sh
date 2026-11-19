#!/bin/bash
# Usage: tools/test.sh steps.json  -> serves dist/ on :4173 and runs the screenshot steps
cd "$(dirname "$0")/.."
python3 -m http.server 4173 --directory dist >/dev/null 2>&1 &
SRV=$!
sleep 1
node tools/screenshot.mjs "http://localhost:4173/?test" x "$1" | grep -v 'GL Driver\|Phaser v4'
kill $SRV
