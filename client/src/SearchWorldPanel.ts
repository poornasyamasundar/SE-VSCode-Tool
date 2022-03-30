import * as vscode from "vscode";
import { getNonce } from "./getNonce";

export class SearchWorldPanel {
    /**
     * Track the currently panel. Only allow a single panel to exist at a time.
     */
    public static currentPanel: SearchWorldPanel | undefined;

    public static readonly viewType = "SearchWorld";

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it. 
        if (SearchWorldPanel.currentPanel) {
            SearchWorldPanel.currentPanel._panel.reveal(column);
            SearchWorldPanel.currentPanel._update();
            return;
        }

        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel(
            SearchWorldPanel.viewType,
            "Sample Extension",
            column || vscode.ViewColumn.One,
            {
                // Enable javascript in the webview
                enableScripts: true,

                // And restrict the webview to only loading content from our extension's `media` directory.
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, "client","media"),
                    vscode.Uri.joinPath(extensionUri, "client","out/compiled"),
                ],
            }
        );

        SearchWorldPanel.currentPanel = new SearchWorldPanel(panel, extensionUri);
    }

    public static kill() {
        SearchWorldPanel.currentPanel?.dispose();
        SearchWorldPanel.currentPanel = undefined;
    }

    public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        SearchWorldPanel.currentPanel = new SearchWorldPanel(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // // Handle messages from the webview
        // this._panel.webview.onDidReceiveMessage(
        //   (message) => {
        //     switch (message.command) {
        //       case "alert":
        //         vscode.window.showErrorMessage(message.text);
        //         return;
        //     }
        //   },
        //   null,
        //   this._disposables
        // );
    }

    public dispose() {
        SearchWorldPanel.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private async _update() {
        const webview = this._panel.webview;

        this._panel.webview.html = this._getHtmlForWebview(webview);
        webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
            	case "onInfo": {
                    if (!data.value) {
                        return;
                    }
                    vscode.window.showInformationMessage(data.value);
                    break;
                }
                case "onError": {
                    if (!data.value) {
                        return;
                    }
                    vscode.window.showErrorMessage(data.value);
                    break;
                }
                // case "tokens": {
                //     await Util.globalState.update(
                //         accessTokenKey,
                //         data.accessToken
                //     );
                //     await Util.globalState.update(
                //         refreshTokenKey,
                //         data.refreshToken
                //     );
                //     break;
                // }
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        // // And the uri we use to load this script in the webview
        // const scriptUri = webview.asWebviewUri(
        //     vscode.Uri.joinPath(this._extensionUri, "out", "compiled/SearchWorldPanel.js")
        // );

        // Uri to load styles into webview
        const stylesResetUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this._extensionUri,
            "client",
            "media","reset.css"
        ));
        const stylesMainUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this._extensionUri,
            "client",
            "media","vscode.css"
        ));
        // const cssUri = webview.asWebviewUri(
        //     vscode.Uri.joinPath(
        //         this._extensionUri,
        //         "out",
        //         "compiled/swiper.css"
        //     )
        // );

        // Use a nonce to only allow specific scripts to be run
        const nonce = getNonce();

        return `<!DOCTYPE html>
			<html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta http-equiv="Content-Security-Policy" content="img-src https: data:; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}';">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <link href="${stylesResetUri}" rel="stylesheet">
                    <link href="${stylesMainUri}" rel="stylesheet">
                    <script nonce="${nonce}"></script>
                </head>
                <body>
                    <h1>Hello world</h1>	
                    <input/>
                    <button>perge</button>	
                </body>
	        </html>`;
    }
}
