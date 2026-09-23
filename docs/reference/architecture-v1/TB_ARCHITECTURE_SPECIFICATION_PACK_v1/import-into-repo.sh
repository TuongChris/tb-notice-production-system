#!/usr/bin/env bash
# Documentation-only installer. No package install, app changes, Git writes or network calls.
# Default: dry run. Run from the intended repository root on bootstrap/p0-local.
set -euo pipefail
export LC_ALL=C

MODE="${1:---dry-run}"
if [[ "$MODE" == "--help" || "$MODE" == "-h" ]]; then
  printf '%s\n' 'Usage: bash /path/to/pack/import-into-repo.sh [--dry-run|--apply]' \
    'Run from repository root on bootstrap/p0-local. Default is --dry-run.' \
    'Verifies the original Database/API reference, archives this pack, and adds eight active docs.' \
    'Refuses differing existing files. Does not commit, push, install or migrate.'
  exit 0
fi
if [[ $# -gt 1 || ( "$MODE" != "--dry-run" && "$MODE" != "--apply" ) ]]; then
  printf 'ERROR: expected --dry-run or --apply.\n' >&2
  exit 2
fi
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
for command_name in git sha256sum cmp find sort mkdir cat dirname realpath; do
  command -v "$command_name" >/dev/null 2>&1 || fail "Missing prerequisite: $command_name"
done
PACK_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || fail 'Not inside a Git repository.'
REPO_ROOT="$(cd -- "$REPO_ROOT" && pwd -P)"
[[ "$(pwd -P)" == "$REPO_ROOT" ]] || fail 'Run this command from the repository root, not a subdirectory.'
BRANCH="$(git symbolic-ref --quiet --short HEAD 2>/dev/null)" || fail 'Detached HEAD; select the reviewed documentation branch first.'
[[ "$BRANCH" == 'bootstrap/p0-local' ]] || fail "Expected branch bootstrap/p0-local, found $BRANCH. No branch was changed."

[[ -f "$PACK_DIR/MANIFEST.sha256" ]] || fail 'Pack MANIFEST.sha256 is missing.'
[[ -z "$(find "$PACK_DIR" -type l -print -quit)" ]] || fail 'Pack contains a symlink; refusing import.'
# Validate the file list before passing it to checksum verification.
declare -a PACK_FILES=()
while read -r digest relative_path; do
  [[ -n "${digest:-}" && -n "${relative_path:-}" ]] || fail 'Invalid empty checksum entry.'
  [[ "$digest" =~ ^[0-9a-f]{64}$ ]] || fail 'Invalid checksum format.'
  [[ "$relative_path" =~ ^[A-Za-z0-9_./-]+$ ]] || fail 'Unsafe manifest path.'
  [[ "$relative_path" != /* && "$relative_path" != 'MANIFEST.sha256' ]] || fail 'Invalid manifest target.'
  [[ ! "$relative_path" =~ (^|/)\.\.(/|$) ]] || fail 'Traversal path in manifest.'
  [[ -f "$PACK_DIR/$relative_path" ]] || fail "Pack file missing: $relative_path"
  PACK_FILES+=("$relative_path")
done < "$PACK_DIR/MANIFEST.sha256"
PACK_FILES+=('MANIFEST.sha256')
[[ ${#PACK_FILES[@]} -gt 8 ]] || fail 'Incomplete specification pack.'
actual_count="$(find "$PACK_DIR" -type f -print | wc -l)"
[[ "$actual_count" -eq ${#PACK_FILES[@]} ]] || fail 'Pack has unlisted or duplicate files; use a clean extraction.'
(cd -- "$PACK_DIR" && sha256sum -c MANIFEST.sha256 --quiet) || fail 'Pack checksum verification failed.'

# Reject symlinked ancestors and non-directory path components below the repository.
check_target_path() {
  local relative_path="$1" current="$REPO_ROOT" index
  local -a components
  [[ "$relative_path" =~ ^[A-Za-z0-9_./-]+$ && "$relative_path" != /* ]] || fail 'Unsafe destination.'
  [[ ! "$relative_path" =~ (^|/)\.\.(/|$) ]] || fail 'Unsafe destination traversal.'
  IFS='/' read -r -a components <<< "$relative_path"
  for (( index=0; index<${#components[@]}; index++ )); do
    current="$current/${components[index]}"
    [[ ! -L "$current" ]] || fail "Destination contains symlink: $relative_path"
    if (( index < ${#components[@]}-1 )) && [[ -e "$current" && ! -d "$current" ]]; then
      fail "Destination ancestor is not a directory: $relative_path"
    fi
  done
}

REFERENCE='docs/reference/database-api-v1/TB_DATABASE_SCHEMA_API_CONTRACT_v1'
check_target_path "$REFERENCE/MANIFEST.sha256"
[[ -f "$REPO_ROOT/$REFERENCE/MANIFEST.sha256" ]] || fail 'Expected frozen Database/API reference is missing. Do not create a substitute.'
EXPECTED_REFERENCE_MANIFEST='42c2a419332d666b9d3f94ebcf16310f4d1c14af137eec6d55f4780928646e9c'
actual_reference_manifest="$(sha256sum "$REPO_ROOT/$REFERENCE/MANIFEST.sha256")"
actual_reference_manifest="${actual_reference_manifest%% *}"
[[ "$actual_reference_manifest" == "$EXPECTED_REFERENCE_MANIFEST" ]] || fail 'Database/API manifest differs from the reviewed release. Stop and reconcile versions.'
[[ -z "$(find "$REPO_ROOT/$REFERENCE" -type l -print -quit)" ]] || fail 'Frozen Database/API reference contains symlink.'
(cd -- "$REPO_ROOT/$REFERENCE" && sha256sum -c MANIFEST.sha256 --quiet) || fail 'Existing Database/API reference was changed; no documents were imported.'

ARCHIVE='docs/reference/architecture-v1/TB_ARCHITECTURE_SPECIFICATION_PACK_v1'
declare -a ACTIVE_DOCS=(
  'docs/product/PRODUCT_DEFINITION_v1.md'
  'docs/domain/DOMAIN_MODEL_v1.md'
  'docs/contracts/PRODUCTION_FORM_CONTRACT_v1.md'
  'docs/architecture/TECHNOLOGY_ARCHITECTURE_v1.md'
  'docs/architecture/REPOSITORY_BLUEPRINT_v1.md'
  'docs/architecture/P0_BOOTSTRAP_CONTRACT_v1.md'
  'docs/architecture/ARCHITECTURE_RESOLUTIONS_v1.md'
  'docs/architecture/SOURCE_REGISTER_v1.md'
)
declare -a SOURCES=() TARGETS=()
for relative_path in "${PACK_FILES[@]}"; do
  SOURCES+=("$relative_path")
  TARGETS+=("$ARCHIVE/$relative_path")
done
for relative_path in "${ACTIVE_DOCS[@]}"; do
  SOURCES+=("$relative_path")
  TARGETS+=("$relative_path")
done

add_count=0
same_count=0
# Complete collision preflight before the first mkdir/copy.
for (( i=0; i<${#TARGETS[@]}; i++ )); do
  source_path="$PACK_DIR/${SOURCES[i]}"
  target_path="$REPO_ROOT/${TARGETS[i]}"
  check_target_path "${TARGETS[i]}"
  [[ -f "$source_path" ]] || fail "Required active source is absent: ${SOURCES[i]}"
  if [[ -e "$target_path" ]]; then
    [[ -f "$target_path" ]] || fail "Destination is not a regular file: ${TARGETS[i]}"
    cmp -s -- "$source_path" "$target_path" || fail "Existing file differs: ${TARGETS[i]}. Nothing was overwritten; request a reconciliation."
    printf 'SAME %s\n' "${TARGETS[i]}"
    same_count=$((same_count+1))
  else
    printf 'ADD  %s\n' "${TARGETS[i]}"
    add_count=$((add_count+1))
  fi
done
printf '\nMode: %s | new files: %d | identical files: %d\n' "$MODE" "$add_count" "$same_count"
if [[ "$MODE" == '--dry-run' ]]; then
  printf 'DRY_RUN_OK: no files were copied. Review then rerun with --apply.\n'
  exit 0
fi

umask 022
for (( i=0; i<${#TARGETS[@]}; i++ )); do
  source_path="$PACK_DIR/${SOURCES[i]}"
  target_path="$REPO_ROOT/${TARGETS[i]}"
  if [[ -e "$target_path" ]]; then
    cmp -s -- "$source_path" "$target_path" || fail 'Destination changed during import. Stop other writers.'
    continue
  fi
  check_target_path "${TARGETS[i]}"
  mkdir -p -- "$(dirname -- "$target_path")"
  # noclobber protects an existing file even if it appeared after preflight.
  (set -o noclobber; cat -- "$source_path" > "$target_path") || fail "Could not create new file: ${TARGETS[i]}"
  cmp -s -- "$source_path" "$target_path" || fail "Readback mismatch: ${TARGETS[i]}"
done
(cd -- "$REPO_ROOT/$ARCHIVE" && sha256sum -c MANIFEST.sha256 --quiet) || fail 'Archived pack readback failed.'
(cd -- "$REPO_ROOT/$REFERENCE" && sha256sum -c MANIFEST.sha256 --quiet) || fail 'Old reference readback failed.'
printf 'IMPORT_OK: documentation copied and read back; original reference preserved.\n'
printf 'No app code, secrets, installations, migrations, Git commits/pushes or external actions were performed.\n'
printf 'Next: review git status/diff, commit only approved docs, then run the READ-ONLY reinspection prompt.\n'
