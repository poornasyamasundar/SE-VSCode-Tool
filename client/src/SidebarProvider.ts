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
    webviewView.webview.onDidReceiveMessage(
      message=>
      {
        console.log(message);
        switch(message.command)
        {
          case 'searchstring':
            console.log(message.query);
            if(message.query==="poorna")
            {
              webviewView.webview.postMessage({command:'searchresult',result:["a","b","c"]}); 
            }
            else if(message.query==="srujan")
            {
              webviewView.webview.postMessage({command:'searchresult',result:["d","b","c"]});
            }
            else
            {
              webviewView.webview.postMessage({command:'searchresult',result:["z"]});
            }
        }
      }
    );

    webviewView.webview.onDidReceiveMessage(async (data) => {
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
        //   await Util.globalState.update(accessTokenKey, data.accessToken);
        //   await Util.globalState.update(refreshTokenKey, data.refreshToken);
        //   break;
        // }
      }
    });
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
    // const styleMainUri = webview.asWebviewUri(
    //   vscode.Uri.joinPath(this._extensionUri, "out", "compiled/sidebar.css")
    // );
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
          <ul id="searchlist">
          </ul> 
          <script nonce="${nonce}" src="${scriptUri}"></script>
          </body>
          </html>`;
        }
      }
      // <link href="" rel="stylesheet">
      // <iframe src="https://youtu.be/0FeJpMteQY4" width="100%" height="400px">
      // </iframe>      