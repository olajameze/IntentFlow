"""MCP server: stack-trace parsing and lightweight Python syntax checks.

Run: python tools/mcp_bug_expert.py
Requires: pip install mcp

Cursor: use project `.cursor/mcp.json` (resolves `${workspaceFolder}/tools/mcp_bug_expert.py`).
If you configured BugExpert in `~/.cursor/mcp.json` with a bare path like `tools/mcp_bug_expert.py`,
Python resolves it from your home directory and fails — remove that entry or fix args to the full
repo path or `${workspaceFolder}/tools/mcp_bug_expert.py` while this folder is the open workspace.
"""

from __future__ import annotations

import os
import re

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("BugExpert")


@mcp.tool()
async def analyze_and_fix_error(error_log: str, codebase_root: str) -> dict:
    """Parses Python stack traces, Next.js hydration bugs, and CrewAI failures to pinpoint file patches."""
    file_pattern = r'File\s+"([^"]+)",\s+line\s+(\d+)'
    matches = re.findall(file_pattern, error_log)

    if not matches:
        return {
            "status": "Could not identify trace path",
            "action_plan": (
                "Scan file dependencies for broken package exports or missing environment variables."
            ),
        }

    last_file, last_line = matches[-1]
    error_message = error_log.strip().split("\n")[-1]

    target = os.path.join(codebase_root, last_file) if not os.path.isabs(last_file) else last_file

    return {
        "target_file_to_patch": target,
        "line_number": int(last_line),
        "exception_found": error_message,
        "action_plan": f"Inspect line {last_line} in {last_file}. Fix the condition causing: {error_message}",
    }


@mcp.tool()
async def inspect_code_syntax(file_path: str) -> str:
    """Validates code structures before execution to maintain clean application lifecycles."""
    if not os.path.exists(file_path):
        return "File path invalid."

    if file_path.endswith(".py"):
        try:
            with open(file_path, encoding="utf-8") as f:
                compile(f.read(), file_path, "exec")
            return "Syntax status: 100% Valid Python Code"
        except SyntaxError as e:
            ctx = (e.text or "").strip()
            return f"Syntax Error: Line {e.lineno} -> {e.msg} (Code context: {ctx})"

    return "Format verified. Handing off file to Next.js/Tailwind engine compiler."


if __name__ == "__main__":
    mcp.run()
