const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

function activate(context) {
  const disposable = vscode.commands.registerCommand(
    'biztalkOrchestrationViewer.open',
    () => {
      const panel = vscode.window.createWebviewPanel(
        'biztalkOrchestrationViewer',
        'BizTalk Orchestration Viewer',
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
        },
      );

      const distUri = vscode.Uri.joinPath(context.extensionUri, 'dist');
      const indexPath = path.join(context.extensionPath, 'dist', 'index.html');
      let html = fs.readFileSync(indexPath, 'utf8');

      html = html.replace(
        /(src|href)="\.\/([^"#?]+)"/g,
        (_match, attribute, relativePath) => {
          const resource = vscode.Uri.joinPath(distUri, ...relativePath.split('/'));
          return `${attribute}="${panel.webview.asWebviewUri(resource)}"`;
        },
      );

      panel.webview.html = html;
    },
  );

  context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = { activate, deactivate };
