#!/bin/bash

# Add frontmatter to skill files if missing
# Usage: ./add-skill-frontmatter.sh <file>

FILE="$1"

# Check if file exists and is a skill markdown file
if [[ ! -f "$FILE" ]] || [[ ! "$FILE" =~ \.claude/skills/.*\.md$ ]]; then
  exit 0
fi

# Check if file already has frontmatter (starts with ---)
if head -1 "$FILE" | grep -q "^---"; then
  exit 0
fi

# Extract skill name from filename (remove .md extension)
SKILL_NAME=$(basename "$FILE" .md)

# Create temp file with frontmatter
TEMP_FILE=$(mktemp)

cat > "$TEMP_FILE" << EOF
---
name: $SKILL_NAME
description:
---

EOF

# Append original content
cat "$FILE" >> "$TEMP_FILE"

# Replace original file
mv "$TEMP_FILE" "$FILE"

exit 0
