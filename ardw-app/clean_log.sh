#!/bin/bash
logfile="$1"
outfile="$2"

if [ -z "$2" ]; then
  echo "Usage: ./clean_log.sh <input file> <output file>"
  exit 1
fi

> "$outfile"

while IFS= read -r line; do
  echo "$line" >> "$outfile"
done < "$logfile"

sed -ri '' -e 's/^(.*),.* - INFO - Study (.*)$/\1 \2/' "$outfile"
