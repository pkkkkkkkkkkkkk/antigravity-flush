# Antigravity Flush

A VSCode extension that adds a simple "Flush Context" button to clear Antigravity conversation data to fix Opus model crashes caused by token checkpoint truncation.

## Features

- **Status Bar Button**: One-click "🗑️ Flush Context" button in the status bar
- **Keyboard Shortcut**: `Ctrl+Shift+Alt+F` (or `Cmd+Shift+Alt+F` on Mac)
- **Confirmation Dialog**: Prevents accidental data loss
- **Clears All Context**: Removes conversations, context_state, and brain session data

## Why You Need This

The Antigravity IDE has a hardcoded 7500 token "Summarization Threshold" for checkpoint summaries. This is particularly problematic for the Opus model. When conversations get long (92+ messages), the IDE tries to summarize everything which can cause:

- Truncation errors
- Malformed JSON requests  
- 400 Bad Request errors

This extension lets you quickly flush the context and start fresh, resolving the crash immediately.

## New Features (v1.1.0)

- **MCP Warning**: Automatically warns if you have too many MCP commands (>20) registered, which can affect performance.
- **Auto-Reload**: Option to reload the window immediately after flushing for a clean state.

## Installation

### From VS Code Marketplace

**Direct link:** [Antigravity Flush on Marketplace](https://marketplace.visualstudio.com/items?itemName=pkkkkkkkkkkkkk.antigravity-flush)

**Search by ID in VS Code:**
```
@id:pkkkkkkkkkkkkk.antigravity-flush
```

**Command line install (always latest version):**
```bash
code --install-extension pkkkkkkkkkkkkk.antigravity-flush
```

### From VSIX (Local Build)
```bash
cd antigravity-flush
npm install
npm run package
code --install-extension antigravity-flush-*.vsix
```

## Usage

1. Click the "🗑️ Flush Context" button in the status bar, OR
2. Press `Ctrl+Shift+Alt+F`, OR
3. Open Command Palette (`Ctrl+Shift+P`) and search "Flush Antigravity Context"
4. Confirm the action in the dialog
5. Start a new conversation

## Commands

| Command | Description |
|---------|-------------|
| `Flush Antigravity Context` | Clear all conversations and context data |
| `Flush Current Conversation Only` | Clear only the active session |

## What Gets Cleared

- `~/.gemini/antigravity/conversations/` - All conversation .pb files
- `~/.gemini/antigravity/context_state/` - Context state data
- `~/.gemini/antigravity/brain/` - Session brain data

## Author

Created by **Paweł Katarzyński**

## License

This project is licensed under **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)**.

- ✅ Free for personal and educational use
- ✅ You may modify and share with attribution
- ❌ Commercial use requires explicit permission from the author

See [LICENSE](LICENSE) for details.
