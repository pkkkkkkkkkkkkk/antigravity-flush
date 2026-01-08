const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Get Antigravity data directory
function getAntigravityDir() {
    const homeDir = os.homedir();
    return path.join(homeDir, '.gemini', 'antigravity');
}

// Delete directory recursively with error handling
async function deleteDirectory(dirPath) {
    try {
        if (fs.existsSync(dirPath)) {
            const files = fs.readdirSync(dirPath);
            for (const file of files) {
                const filePath = path.join(dirPath, file);
                const stat = fs.statSync(filePath);
                if (stat.isDirectory()) {
                    await deleteDirectory(filePath);
                } else {
                    fs.unlinkSync(filePath);
                }
            }
            fs.rmdirSync(dirPath);
            return true;
        }
    } catch (err) {
        console.error(`Error deleting ${dirPath}:`, err);
        return false;
    }
    return false;
}

// Clear specific directory contents (not the directory itself)
async function clearDirectoryContents(dirPath, excludePatterns = []) {
    let cleared = 0;
    let errors = 0;

    try {
        if (fs.existsSync(dirPath)) {
            const files = fs.readdirSync(dirPath);
            for (const file of files) {
                // Check if file matches any exclude pattern
                const shouldExclude = excludePatterns.some(pattern => file.includes(pattern));
                if (shouldExclude) continue;

                const filePath = path.join(dirPath, file);
                try {
                    const stat = fs.statSync(filePath);
                    if (stat.isDirectory()) {
                        await deleteDirectory(filePath);
                    } else {
                        fs.unlinkSync(filePath);
                    }
                    cleared++;
                } catch (err) {
                    console.error(`Error deleting ${filePath}:`, err);
                    errors++;
                }
            }
        }
    } catch (err) {
        console.error(`Error reading ${dirPath}:`, err);
    }

    return { cleared, errors };
}

// Main flush function
async function flushAntigravityContext(currentOnly = false) {
    const antigravityDir = getAntigravityDir();

    // Check if Antigravity directory exists
    if (!fs.existsSync(antigravityDir)) {
        vscode.window.showWarningMessage('Antigravity directory not found. Nothing to flush.');
        return;
    }

    // Confirm action
    const message = currentOnly
        ? 'Flush current conversation only? This will clear the active session.'
        : 'Flush ALL Antigravity context? This will clear all conversations and context data.';

    const confirmText = currentOnly ? 'Flush Current' : 'Flush All';
    const result = await vscode.window.showWarningMessage(
        message,
        { modal: true },
        confirmText,
        'Cancel'
    );

    if (result !== confirmText) {
        return;
    }

    let totalCleared = 0;
    let totalErrors = 0;

    try {
        // Clear conversations directory
        const conversationsDir = path.join(antigravityDir, 'conversations');
        const convResult = await clearDirectoryContents(conversationsDir);
        totalCleared += convResult.cleared;
        totalErrors += convResult.errors;

        // Clear context_state directory
        const contextStateDir = path.join(antigravityDir, 'context_state');
        const ctxResult = await clearDirectoryContents(contextStateDir);
        totalCleared += ctxResult.cleared;
        totalErrors += ctxResult.errors;

        // Clear brain directory (session data) - but preserve workflows
        const brainDir = path.join(antigravityDir, 'brain');
        const brainResult = await clearDirectoryContents(brainDir);
        totalCleared += brainResult.cleared;
        totalErrors += brainResult.errors;


        // Success message with Reload option
        if (totalErrors === 0) {
            const reloadAction = 'Reload Window';
            const selection = await vscode.window.showInformationMessage(
                `🧹 Antigravity context flushed! Cleared ${totalCleared} items. Reload window to start fresh?`,
                reloadAction
            );

            if (selection === reloadAction) {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        } else {
            const reloadAction = 'Reload Window';
            const selection = await vscode.window.showWarningMessage(
                `🧹 Flushed ${totalCleared} items with ${totalErrors} errors. Some files may be in use. Reloading might help.`,
                reloadAction
            );

            if (selection === reloadAction) {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        }

    } catch (err) {
        vscode.window.showErrorMessage(`Error flushing context: ${err.message}`);
    }
}

// Status bar item
let statusBarItem;

function activate(context) {
    console.log('Antigravity Flush extension is now active');

    // Create status bar item first so we can update it
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'antigravity-flush.flush';
    context.subscriptions.push(statusBarItem);

    // Start monitoring
    startMonitoring();
    const flushAllCommand = vscode.commands.registerCommand('antigravity-flush.flush', async () => {
        await flushAntigravityContext(false);
    });

    // Register flush current command
    const flushCurrentCommand = vscode.commands.registerCommand('antigravity-flush.flushCurrent', async () => {
        await flushAntigravityContext(true);
    });

    context.subscriptions.push(flushAllCommand);
    context.subscriptions.push(flushCurrentCommand);

    // Initial update
    updateStatusBar();

    // Check MCP Status on startup
    checkMCPStatus();
}

// MCP Warning Logic
async function checkMCPStatus() {
    // Wait a brief moment for extensions to activate and register commands
    setTimeout(async () => {
        const allCommands = await vscode.commands.getCommands(true); // true = include internal commands too, though false (public) is usually enough. Let's stick to true to be safe.
        const mcpCommands = allCommands.filter(cmd =>
            cmd.startsWith('mcp:') ||
            cmd.includes('mcp_') ||
            (cmd.toLowerCase().includes('mcp') && cmd.includes('.')) // broad catch
        );

        console.log(`Found ${mcpCommands.length} MCP commands.`);

        if (mcpCommands.length > 20) {
            const action = 'Manage Extensions';
            const selection = await vscode.window.showWarningMessage(
                `⚠️ Antigravity Warning: High MCP usage detected (${mcpCommands.length} commands). Having >20 MCP commands may cause performance issues or crashes.`,
                action
            );
            if (selection === action) {
                vscode.commands.executeCommand('workbench.extensions.action.showEnabledExtensions');
            }
        }
    }, 3000); // 3 second delay to ensure load
}

// Monitoring Logic
let fsWatcher;
const WARNING_THRESHOLD_MB = 2.5;
const CRITICAL_THRESHOLD_MB = 3.5;

function startMonitoring() {
    const conversationsDir = path.join(getAntigravityDir(), 'conversations');

    if (fs.existsSync(conversationsDir)) {
        // Update immediately
        updateStatusBar();

        // Watch for changes
        try {
            fsWatcher = fs.watch(conversationsDir, (eventType, filename) => {
                if (filename && filename.endsWith('.pb')) {
                    updateStatusBar();
                }
            });
        } catch (err) {
            console.error('Failed to watch directory:', err);
        }
    }
}

function getActiveConversationSize() {
    try {
        const conversationsDir = path.join(getAntigravityDir(), 'conversations');
        if (!fs.existsSync(conversationsDir)) return 0;

        const files = fs.readdirSync(conversationsDir)
            .filter(f => f.endsWith('.pb'))
            .map(f => {
                const fullPath = path.join(conversationsDir, f);
                return {
                    name: f,
                    path: fullPath,
                    stat: fs.statSync(fullPath)
                };
            })
            .sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime()); // Newest first

        if (files.length > 0) {
            return files[0].stat.size;
        }
    } catch (err) {
        console.error('Error reading conversation size:', err);
    }
    return 0;
}

function updateStatusBar() {
    if (!statusBarItem) return;

    const sizeBytes = getActiveConversationSize();
    const sizeMB = sizeBytes / (1024 * 1024);
    const sizeKB = sizeBytes / 1024;

    // Format text
    let sizeText = '';
    if (sizeMB >= 1) {
        sizeText = `${sizeMB.toFixed(2)} MB`;
    } else {
        sizeText = `${Math.round(sizeKB)} KB`;
    }

    statusBarItem.text = `$(trash) Flush (${sizeText})`;

    // Alert colors
    if (sizeMB > CRITICAL_THRESHOLD_MB) {
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        statusBarItem.tooltip = `⚠️ CRITICAL: Context size (${sizeText}) is very high! Crash imminent. Flush now!`;
    } else if (sizeMB > WARNING_THRESHOLD_MB) {
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        statusBarItem.tooltip = `⚠️ Warning: Context size (${sizeText}) is getting high. Consider flushing.`;
    } else {
        statusBarItem.backgroundColor = undefined; // Default
        statusBarItem.tooltip = `Current Context Size: ${sizeText}. Click to flush.`;
    }

    statusBarItem.show();
}

function deactivate() {
    if (statusBarItem) {
        statusBarItem.dispose();
    }
    if (fsWatcher) {
        fsWatcher.close();
    }
}

module.exports = {
    activate,
    deactivate
};
