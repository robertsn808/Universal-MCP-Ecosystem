#!/bin/bash
echo "🔍 Active Claude Code sessions:"
echo "================================"

tmux list-sessions 2>/dev/null | grep "claude_" | while read session; do
    session_name=$(echo "$session" | cut -d: -f1)
    echo "📝 Session: $session_name"
    echo "   Attach: tmux attach -t $session_name"
    echo "   Kill: tmux kill-session -t $session_name"
    echo ""
done

if [ $? -ne 0 ]; then
    echo "ℹ️  No active Claude sessions found"
fi
