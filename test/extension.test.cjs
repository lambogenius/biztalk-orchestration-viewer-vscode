// The extension's webview requests (pick, drop, export), run against a fake `vscode` module.
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const calls = { openDialog: [], saveDialog: [], written: [], info: [] };
const files = new Map();
let saveTarget;
let openResult;

const uri = fsPath => ({ scheme: 'file', path: fsPath.replace(/\\/g, '/'), fsPath, toString: () => `file://${fsPath}` });
const fakeVscode = {
  Uri: {
    parse: value => uri(decodeURIComponent(new URL(value).pathname)),
    joinPath: (base, ...parts) => uri(path.posix.join(base.path, ...parts)),
  },
  window: {
    showOpenDialog: async options => { calls.openDialog.push(options); return openResult; },
    showSaveDialog: async options => { calls.saveDialog.push(options); return saveTarget; },
    showInformationMessage: async message => { calls.info.push(message); },
  },
  workspace: {
    workspaceFolders: [{ uri: uri('/work') }],
    fs: {
      readFile: async target => {
        if (!files.has(target.path)) throw new Error(`File not found: ${target.path}`);
        return files.get(target.path);
      },
      writeFile: async (target, bytes) => { calls.written.push({ path: target.path, text: new TextDecoder().decode(bytes) }); },
    },
  },
};

const originalLoad = Module._load;
Module._load = function load(request, ...rest) {
  return request === 'vscode' ? fakeVscode : originalLoad.call(this, request, ...rest);
};
const { handleMessages, decodeText } = require('../extension.cjs');
Module._load = originalLoad;

function fakeWebview() {
  const posted = [];
  let listener;
  return {
    posted,
    onDidReceiveMessage: handler => { listener = handler; return { dispose() {} }; },
    postMessage: async message => { posted.push(message); return true; },
    send: message => listener(message),
  };
}

test('ready sends the open document', async () => {
  const webview = fakeWebview();
  let sent = 0;
  handleMessages(webview, { sendDocument: async () => { sent += 1; }, folder: () => uri('/work') });
  await webview.send({ type: 'ready' });
  assert.equal(sent, 1);
});

test('Open Artifact shows the open dialog and loads the picked file', async () => {
  files.set('/work/Order.odx', new TextEncoder().encode('<om:MetaModel/>'));
  openResult = [uri('/work/Order.odx')];
  const webview = fakeWebview();
  handleMessages(webview, { folder: () => uri('/work') });
  await webview.send({ type: 'pickFile' });
  assert.equal(calls.openDialog.at(-1).defaultUri.path, '/work');
  assert.deepEqual(webview.posted.at(-1), { type: 'openArtifact', fileName: 'Order.odx', source: '<om:MetaModel/>' });
});

test('a file dropped from the Explorer (a URI) is read by the extension', async () => {
  files.set('/work/sub/Ship.odx', new TextEncoder().encode('<x/>'));
  const webview = fakeWebview();
  handleMessages(webview, { folder: () => uri('/work') });
  await webview.send({ type: 'openUri', uri: 'file:///work/sub/Ship.odx' });
  assert.equal(webview.posted.at(-1).fileName, 'Ship.odx');
  assert.equal(webview.posted.at(-1).source, '<x/>');
});

test('Export parsed model asks where to save and writes the JSON', async () => {
  saveTarget = uri('/work/Order.viewer-model.json');
  const webview = fakeWebview();
  handleMessages(webview, { folder: () => uri('/work') });
  await webview.send({ type: 'saveModel', fileName: '../../Order.viewer-model.json', content: '{"shapes":[]}' });
  assert.equal(calls.saveDialog.at(-1).defaultUri.path, '/work/Order.viewer-model.json', 'only the file name is used');
  assert.deepEqual(calls.written.at(-1), { path: '/work/Order.viewer-model.json', text: '{"shapes":[]}' });
  assert.match(calls.info.at(-1), /Order\.viewer-model\.json/);
});

test('cancelling the save dialog writes nothing', async () => {
  saveTarget = undefined;
  const before = calls.written.length;
  const webview = fakeWebview();
  handleMessages(webview, { folder: () => uri('/work') });
  await webview.send({ type: 'saveModel', fileName: 'x.json', content: '{}' });
  assert.equal(calls.written.length, before);
});

test('errors go back to the webview', async () => {
  const webview = fakeWebview();
  handleMessages(webview, { folder: () => uri('/work') });
  await webview.send({ type: 'openUri', uri: 'file:///work/missing.odx' });
  assert.equal(webview.posted.at(-1).type, 'error');
  assert.match(webview.posted.at(-1).message, /missing\.odx/);
});

test('UTF-16 files are decoded', () => {
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('<a/>', 'utf16le')]);
  assert.equal(decodeText(new Uint8Array(utf16)), '<a/>');
});
