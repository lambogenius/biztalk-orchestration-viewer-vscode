const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

function setWebviewHtml(webview, context) {
  const distUri = vscode.Uri.joinPath(context.extensionUri, 'dist');
  const indexPath = path.join(context.extensionPath, 'dist', 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');

  html = html.replace(
    /(src|href)="\.\/([^"#?]+)"/g,
    (_match, attribute, relativePath) => {
      const resource = vscode.Uri.joinPath(distUri, ...relativePath.split('/'));
      return `${attribute}="${webview.asWebviewUri(resource)}"`;
    },
  );

  webview.html = html;
}

function configureWebview(webview, context) {
  webview.options = {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
  };
  setWebviewHtml(webview, context);
}

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

      setWebviewHtml(panel.webview, context);
    },
  );

  const editorProvider = vscode.window.registerCustomEditorProvider(
    'biztalkOrchestrationViewer.odxEditor',
    {
      resolveCustomTextEditor(document, webviewPanel) {
        configureWebview(webviewPanel.webview, context);

        const sendDocument = () => webviewPanel.webview.postMessage({
          type: 'openArtifact',
          fileName: path.basename(document.uri.fsPath || document.uri.path),
          source: document.getText(),
        });

        const messageSubscription = webviewPanel.webview.onDidReceiveMessage((message) => {
          if (message?.type === 'ready') void sendDocument();
        });
        const changeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
          if (event.document.uri.toString() === document.uri.toString()) void sendDocument();
        });

        webviewPanel.onDidDispose(() => {
          messageSubscription.dispose();
          changeSubscription.dispose();
        });
      },
    },
    { webviewOptions: { retainContextWhenHidden: true } },
  );

  context.subscriptions.push(disposable, editorProvider);
}

function deactivate() {}

module.exports = { activate, deactivate };
