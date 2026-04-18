#!/bin/bash
# Build script: concatenate all JS files in dependency order + minify
# Usage: ./build.sh
# Output: dist/app.bundle.js (minified), dist/app.bundle.js.map (sourcemap)

set -e

WEBAPP_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$WEBAPP_DIR/dist"
BUNDLE="$DIST_DIR/app.bundle.js"

mkdir -p "$DIST_DIR"

# Concatenation order — dependencies first, app.js last
FILES=(
    "js/api.js"
    "js/components/color-picker.js"
    "js/components/timeline.js"
    "js/components/habit-card.js"
    "js/components/charts.js"
    "js/components/heatmap.js"
    "js/screens/today.js"
    "js/screens/habits.js"
    "js/screens/planner.js"
    "js/screens/stats.js"
    "js/app.js"
)

echo "Bundling ${#FILES[@]} files..."

# Concatenate with file markers for debugging
> "$BUNDLE"
for f in "${FILES[@]}"; do
    echo "/* === $f === */" >> "$BUNDLE"
    cat "$WEBAPP_DIR/$f" >> "$BUNDLE"
    echo "" >> "$BUNDLE"
done

SIZE_RAW=$(wc -c < "$BUNDLE")
echo "Bundle: $BUNDLE ($SIZE_RAW bytes)"

# Minify if terser/esbuild available
if command -v npx &> /dev/null; then
    echo "Minifying with esbuild..."
    npx -y esbuild "$BUNDLE" --minify --sourcemap --outfile="$DIST_DIR/app.bundle.min.js" 2>/dev/null && {
        SIZE_MIN=$(wc -c < "$DIST_DIR/app.bundle.min.js")
        echo "Minified: $DIST_DIR/app.bundle.min.js ($SIZE_MIN bytes, $(( 100 - SIZE_MIN * 100 / SIZE_RAW ))% smaller)"
        # Replace bundle with minified version
        mv "$DIST_DIR/app.bundle.min.js" "$BUNDLE"
        mv "$DIST_DIR/app.bundle.min.js.map" "$DIST_DIR/app.bundle.js.map" 2>/dev/null || true
    } || echo "esbuild not available, using unminified bundle"
fi

echo "Done!"
