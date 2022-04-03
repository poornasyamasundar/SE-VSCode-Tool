import * as vscode from "vscode";
import { getNonce } from "./getNonce";

export class SidebarProvider implements vscode.WebviewViewProvider {
  _view?: vscode.WebviewView;
  _doc?: vscode.TextDocument;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,

      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    webviewView.webview.postMessage({command:'searchresult',result:["d","b","c"]});

    webviewView.webview.onDidReceiveMessage(
      message=>
      {
        switch(message.command)
        {
          case 'searchstring':
            console.log("Search query received from webview: ", message.query);
            if(message.query==="poorna")
            {
              webviewView.webview.postMessage({command:'searchresult',result:[{"funcName": "helloworld()", "location": "there"},{"funcName": "b", "location": "client/media/logo/hw.js"},{"funcName": "c", "location": "there"}]}); 
            }
            else if(message.query==="srujan")
            {
              webviewView.webview.postMessage({command:'searchresult',result:[{"funcName": "b", "location": "there"},{"funcName": "b", "location": "there"},{"funcName": "c", "location": "there"}]});
            }
            else
            {
              webviewView.webview.postMessage({command:'searchresult',result:[{"funcName": "c", "location": "there"},{"funcName": "b", "location": "there"},{"funcName": "c", "location": "there"}]});
            }
          case 'navigate':
            console.log("Received Location: ", message.location)
        }
      }
    );
  }

  public revive(panel: vscode.WebviewView) {
    this._view = panel;
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const styleResetUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "client","media", "reset.css")
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri,"client", "media", "sidebar.js")
    );
    const styleVSCodeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri,"client", "media", "vscode.css")
    );

    // Use a nonce to only allow a specific script to be run.
    const nonce = getNonce();
    
    return `<!DOCTYPE html>
			<html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="img-src https: data:; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}';">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${styleResetUri}" rel="stylesheet">
            <link href="${styleVSCodeUri}" rel="stylesheet">
        </head>
        <body>
          <h1>Sample Extension</h1>
          <input id="inputfield"></input>
          <div id="searchlist">
          </div> 
          <script type = "module" nonce="${nonce}" src="${scriptUri}"></script>
          </body>
          </html>`;
        }
      }