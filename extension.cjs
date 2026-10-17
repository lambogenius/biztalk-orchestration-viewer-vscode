const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const ARTIFACT_FILTERS = { 'BizTalk artifacts': ['odx', 'xml', 'btm', 'xsd', 'binding', 'config', 'txt'], 'All files': ['*'] };

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

/** BizTalk files are often UTF-16 (with or without a BOM); the webview decodes dropped files the same way. */
function decodeText(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  const sample = Math.min(bytes.length, 200);
  let even = 0;
  let odd = 0;
  for (let index = 0; index < sample; index += 1) {
    if (bytes[index] === 0) {
      if (index % 2 === 0) even += 1;
      else odd += 1;
    }
  }
  if (odd > sample * 0.2) return new TextDecoder('utf-16le').decode(bytes);
  if (even > sample * 0.2) return new TextDecoder('utf-16be').decode(bytes);
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Requests from the webview: it can't download files, and files dragged from VS Code's Explorer reach it only as
 * URIs, so the extension saves the exported model and reads picked or dropped files.
 * `folder` gives the folder dialogs start in (the open document's folder, or the first workspace folder).
 */
function handleMessages(webview, { sendDocument, folder }) {
  const post = message => webview.postMessage(message);
  const openUri = async uri => {
    const bytes = await vscode.workspace.fs.readFile(uri);
    await post({ type: 'openArtifact', fileName: path.basename(uri.path), source: decodeText(bytes) });
  };

  return webview.onDidReceiveMessage(async message => {
    try {
      switch (message?.type) {
        case 'ready':
          if (sendDocument) await sendDocument();
          break;
        case 'pickFile': {
          const picked = await vscode.window.showOpenDialog({ canSelectMany: false, defaultUri: folder?.(), filters: ARTIFACT_FILTERS });
          if (picked?.[0]) await openUri(picked[0]);
          break;
        }
        case 'openUri':
          if (typeof message.uri === 'string') await openUri(vscode.Uri.parse(message.uri, true));
          break;
        case 'saveModel': {
          if (typeof message.content !== 'string') break;
          const start = folder?.();
          const fileName = path.basename(String(message.fileName || 'model.viewer-model.json'));
          const target = await vscode.window.showSaveDialog({
            defaultUri: start ? vscode.Uri.joinPath(start, fileName) : undefined,
            filters: { JSON: ['json'] },
            saveLabel: 'Export model',
          });
          if (!target) break;
          await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(message.content));
          void vscode.window.showInformationMessage(`Exported the parsed model to ${path.basename(target.path)}.`);
          break;
        }
        default:
          break;
      }
    } catch (error) {
      await post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  });
}

const workspaceFolder = () => vscode.workspace.workspaceFolders?.[0]?.uri;

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
      const messages = handleMessages(panel.webview, { folder: workspaceFolder });
      panel.onDidDispose(() => messages.dispose());
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

        const messageSubscription = handleMessages(webviewPanel.webview, {
          sendDocument,
          folder: () => (document.uri.scheme === 'untitled' ? workspaceFolder() : vscode.Uri.joinPath(document.uri, '..')),
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

module.exports = { activate, deactivate, decodeText, handleMessages };
