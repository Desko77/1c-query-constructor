// WebView provider for Query Constructor (ТЗ §7.2)
import * as vscode from 'vscode';
import type { HostToWebViewMessage, WebViewToHostMessage, ExtensionSettings } from '../protocol/messages.js';
import { StateManager } from '../sync/state-manager.js';

export class QueryWebViewProvider implements vscode.CustomTextEditorProvider {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    webviewPanel.webview.options = { enableScripts: true };
    webviewPanel.webview.html = this.getWebViewHtml(webviewPanel.webview);

    const stateManager = new StateManager(document, webviewPanel, this.getSettings());

    // Handle messages from WebView
    webviewPanel.webview.onDidReceiveMessage(
      (msg: WebViewToHostMessage) => stateManager.handleWebViewMessage(msg),
      undefined,
      [],
    );

    // Watch for document changes (e.g. from text editor)
    const changeSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        stateManager.onDocumentChanged(e.document.getText());
      }
    });

    webviewPanel.onDidDispose(() => {
      changeSubscription.dispose();
      stateManager.dispose();
    });

    // Initial parse
    stateManager.onDocumentChanged(document.getText());
  }

  async openForText(text: string, _uri: vscode.Uri): Promise<void> {
    // Create a temporary document and open it with the custom editor
    const doc = await vscode.workspace.openTextDocument({ content: text, language: '1cquery' });
    await vscode.commands.executeCommand('vscode.openWith', doc.uri, '1c-query.queryConstructor');
  }

  private getSettings(): ExtensionSettings {
    const config = vscode.workspace.getConfiguration('1c-query');
    return {
      preserveFormatting: config.get('preserveFormatting', true),
      formattingMode: config.get('formattingMode', 'preserve') as 'preserve' | 'canonical',
      syncDebounceMs: config.get('syncDebounceMs', 300),
      undoStackSize: config.get('undoStackSize', 50),
      smartJoinsEnabled: config.get('smartJoins.enabled', true),
      smartJoinsMinScore: config.get('smartJoins.minScore', 50),
    };
  }

  private getWebViewHtml(webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>1C Query Constructor</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; padding: 16px; }
    .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--vscode-panel-border); margin-bottom: 16px; }
    .tab { padding: 8px 16px; cursor: pointer; border: none; background: transparent; color: var(--vscode-foreground); }
    .tab.active { border-bottom: 2px solid var(--vscode-focusBorder); font-weight: bold; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .placeholder { color: var(--vscode-descriptionForeground); font-style: italic; padding: 24px; text-align: center; }
  </style>
</head>
<body>
  <div class="tabs">
    <button class="tab active" data-tab="tables">Таблицы и поля</button>
    <button class="tab" data-tab="joins">Связи</button>
    <button class="tab" data-tab="conditions">Условия</button>
    <button class="tab" data-tab="grouping">Группировка</button>
    <button class="tab" data-tab="params">Параметры</button>
  </div>
  <div id="tables" class="tab-content active">
    <div class="placeholder">Вкладка «Таблицы и поля» — выбор источников данных и полей запроса</div>
  </div>
  <div id="joins" class="tab-content">
    <div class="placeholder">Вкладка «Связи» — настройка JOIN между таблицами</div>
  </div>
  <div id="conditions" class="tab-content">
    <div class="placeholder">Вкладка «Условия» — построение условий WHERE/HAVING</div>
  </div>
  <div id="grouping" class="tab-content">
    <div class="placeholder">Вкладка «Группировка» — GROUP BY и агрегатные функции</div>
  </div>
  <div id="params" class="tab-content">
    <div class="placeholder">Вкладка «Параметры» — управление параметрами запроса</div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
      });
    });
    window.addEventListener('message', event => {
      const msg = event.data;
      // Handle host messages
    });
  </script>
</body>
</html>`;
  }
}
