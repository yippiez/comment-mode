#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# E2E test script for the comment CLI
#
# Usage:
#   chmod +x test.sh
#   ./test.sh
#
# This script:
#   1. Creates a temporary git repository with known files
#   2. Makes some changes (modify, add, delete, stage)
#   3. Runs each `bun cli.ts <command>` variant
#   4. Verifies expected output patterns
# ---------------------------------------------------------------------------

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

PASS=0
FAIL=0

# Store the project root directory (where cli.ts and this script live)
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CLI="bun run $PROJECT_DIR/cli.ts"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

assert_contains() {
    local label="$1"
    local expected="$2"
    local output="$3"

    if echo "$output" | grep -qF "$expected"; then
        echo -e "  ${GREEN}PASS${NC} $label"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}FAIL${NC} $label"
        echo "    Expected to contain: $expected"
        echo "    Got:"
        echo "$output" | sed 's/^/      /'
        FAIL=$((FAIL + 1))
    fi
}

assert_not_contains() {
    local label="$1"
    local unexpected="$2"
    local output="$3"

    if echo "$output" | grep -qF "$unexpected"; then
        echo -e "  ${RED}FAIL${NC} $label (unexpectedly contains: $unexpected)"
        FAIL=$((FAIL + 1))
    else
        echo -e "  ${GREEN}PASS${NC} $label"
        PASS=$((PASS + 1))
    fi
}

assert_exit_code() {
    local label="$1"
    local expected_code="$2"
    local actual_code="$3"

    if [ "$actual_code" -eq "$expected_code" ]; then
        echo -e "  ${GREEN}PASS${NC} $label (exit $actual_code)"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}FAIL${NC} $label (expected exit $expected_code, got $actual_code)"
        FAIL=$((FAIL + 1))
    fi
}

# ---------------------------------------------------------------------------
# Setup: create a temp git repo
# ---------------------------------------------------------------------------

echo -e "${CYAN}=== Setting up test repository ===${NC}"

TEST_DIR=$(mktemp -d /tmp/comment-cli-test-XXXXXX)
cd "$TEST_DIR"

git init --quiet
git config user.email "test@test.com"
git config user.name "Test"

mkdir -p src

# Create initial committed state
cat > README.md << 'EOF'
# Test Project

This is a test project for the comment CLI.
EOF

cat > src/main.ts << 'EOF'
function hello(): string {
  return "hello";
}

function world(): string {
  return "world";
}
EOF

git add -A
git commit -m "initial commit" --quiet

# Make changes for testing:
# 1. Modify README.md (unstaged)
echo "" >> README.md
echo "Updated for testing." >> README.md

# 2. Modify src/main.ts (staged)
cat > src/main.ts << 'EOF'
function hello(): string {
  return "hello world";
}

function goodbye(): string {
  return "goodbye";
}
EOF
git add src/main.ts

# 3. Add new file (untracked)
cat > src/newfile.ts << 'EOF'
export const VERSION = "1.0.0";
EOF

echo -e "${GREEN}Test repo ready at $TEST_DIR${NC}"
echo ""

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

echo -e "${CYAN}=== Test: comment help ===${NC}"

output=$($CLI help 2>&1) || true
assert_contains "help shows command name" "comment" "$output"
assert_contains "help shows diff command" "diff" "$output"
assert_contains "help shows files command" "files" "$output"
assert_contains "help shows git stage" "git stage" "$output"
assert_contains "help shows vcs command" "vcs" "$output"

output=$($CLI --help 2>&1) || true
assert_contains "--help flag works" "comment" "$output"

echo ""

# ---------------------------------------------------------------------------

echo -e "${CYAN}=== Test: comment vcs ===${NC}"

output=$($CLI vcs 2>&1) || true
assert_contains "vcs detects git" "git" "$output"
assert_contains "vcs shows changed files count" "Changed files" "$output"
assert_contains "vcs shows staged changes" "Staged changes" "$output"

echo ""

# ---------------------------------------------------------------------------

echo -e "${CYAN}=== Test: comment files ===${NC}"

output=$($CLI files 2>&1) || true
assert_contains "files shows README.md" "README.md" "$output"
assert_contains "files shows src/main.ts" "src/main.ts" "$output"
assert_contains "files shows src/newfile.ts" "src/newfile.ts" "$output"
assert_contains "files shows staging info" "staged" "$output"

echo ""

# ---------------------------------------------------------------------------

echo -e "${CYAN}=== Test: comment diff ===${NC}"

output=$($CLI diff 2>&1) || true
assert_contains "diff shows VCS header" "VCS: git" "$output"
assert_contains "diff shows README.md" "README.md" "$output"
assert_contains "diff shows src/main.ts" "src/main.ts" "$output"
# New file additions should have + prefix
assert_contains "diff shows additions" "+" "$output"
# The test repo has only additions (no deletions), so skip deletion check

echo ""

# ---------------------------------------------------------------------------

echo -e "${CYAN}=== Test: comment diff --name-only ===${NC}"

output=$($CLI diff --name-only 2>&1) || true
assert_contains "name-only shows README.md" "README.md" "$output"
assert_contains "name-only shows src/main.ts" "src/main.ts" "$output"
# Name-only should not contain diff markers
assert_not_contains "name-only has no diff markers" "+" "$output"
assert_not_contains "name-only has no deletion markers" "-" "$output"

echo ""

# ---------------------------------------------------------------------------

echo -e "${CYAN}=== Test: comment diff --stat ===${NC}"

output=$($CLI diff --stat 2>&1) || true
assert_contains "stat shows README.md" "README.md" "$output"
assert_contains "stat shows + and - numbers" "+" "$output"
assert_contains "stat shows - and + numbers" "-" "$output"

echo ""

# ---------------------------------------------------------------------------

echo -e "${CYAN}=== Test: comment diff --staged ===${NC}"

output=$($CLI diff --staged 2>&1) || true
# src/main.ts is staged, README.md is not — only main.ts should appear
assert_contains "staged shows main.ts" "src/main.ts" "$output"
assert_not_contains "staged hides unstaged README.md" "README.md" "$output"

echo ""

# ---------------------------------------------------------------------------

echo -e "${CYAN}=== Test: comment git status ===${NC}"

output=$($CLI git status 2>&1) || true
# Porcelain status should show M for modified, ?? for untracked
assert_contains "git status shows modified" "M " "$output"
assert_contains "git status shows untracked" "?? " "$output"

echo ""

# ---------------------------------------------------------------------------

echo -e "${CYAN}=== Test: comment git stage / unstage ===${NC}"

# Stage README.md (currently unstaged modified)
output=$($CLI git stage README.md 2>&1) || true
assert_contains "stage confirms" "Staged: README.md" "$output"

# Verify it's now staged
output=$($CLI files 2>&1) || true
assert_contains "staged file in files list" "[staged]" "$output"

# Unstage it
output=$($CLI git unstage README.md 2>&1) || true
assert_contains "unstage confirms" "Unstaged: README.md" "$output"

# Verify it's now unstaged again
output=$($CLI files 2>&1) || true
assert_contains "unstaged file in files list" "[unstaged]" "$output"

echo ""

# ---------------------------------------------------------------------------

echo -e "${CYAN}=== Test: comment diff on a non-git directory ===${NC}"

NON_GIT_DIR=$(mktemp -d /tmp/comment-cli-test-nongit-XXXXXX)
output=$(cd "$NON_GIT_DIR" && $CLI diff 2>&1) || true
assert_contains "non-git diff warns" "No version control system" "$output"

output=$(cd "$NON_GIT_DIR" && $CLI vcs 2>&1) || true
assert_contains "non-git vcs says none" "none" "$output"

rm -rf "$NON_GIT_DIR"

echo ""

# ---------------------------------------------------------------------------

echo -e "${CYAN}=== Test: unknown command ===${NC}"

set +e
output=$($CLI nonexistent 2>&1)
exit_code=$?
set -e
assert_exit_code "unknown command exits 1" 1 "$exit_code"
assert_contains "unknown command error message" "Unknown command" "$output"

echo ""

# ---------------------------------------------------------------------------

echo -e "${CYAN}=== Test: comment agent models ===${NC}"

output=$($CLI agent models 2>&1) || true
assert_contains "agent models shows opencode" "opencode" "$output"
assert_contains "agent models shows pi" "pi" "$output"
assert_contains "agent models shows codex" "codex" "$output"
assert_contains "agent models shows claude_code" "claude_code" "$output"

echo ""

# ---------------------------------------------------------------------------

echo -e "${CYAN}=== Test: agent jj commands exist ===${NC}"

# In a non-jj directory, jj commands should error but not crash
output=$($CLI jj status 2>&1) || true
assert_contains "jj status in non-jj dir errors" "Not a jj repository" "$output"

output=$($CLI jj diff 2>&1) || true
assert_contains "jj diff in non-jj dir errors" "Not a jj repository" "$output"

output=$($CLI jj log 2>&1) || true
assert_contains "jj log in non-jj dir errors" "Not a jj repository" "$output"

echo ""

# ---------------------------------------------------------------------------

echo -e "${CYAN}=== Test: help shows all commands ===${NC}"

output=$($CLI help 2>&1) || true
assert_contains "help shows jj section" "Jujutsu (jj)" "$output"
assert_contains "help shows agent section" "Agent:" "$output"
assert_contains "help shows agent models" "agent models" "$output"

echo ""

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo -e "${CYAN}=== Summary ===${NC}"
TOTAL=$((PASS + FAIL))
echo -e "  ${GREEN}PASS: $PASS${NC}"
echo -e "  ${RED}FAIL: $FAIL${NC}"
echo "  TOTAL: $TOTAL"

# Cleanup
rm -rf "$TEST_DIR"

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
exit 0
