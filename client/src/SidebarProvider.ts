import * as vscode from "vscode";
import { getNonce } from "./getNonce";
import {functionDefinitionMap, globalUri} from './extension';

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
        switch(message.command)
        {
          case 'searchstring':
          {
            console.log("Search query received from webview: ", message.query);
            getResults( message.query, webviewView);
          }
          case 'navigate':
            console.log("Received Location: ", message.location);
            vscode.workspace.openTextDocument(vscode.Uri.file(message.location)).then(document => vscode.window.showTextDocument(document));
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
          <h3>Search for Description</h3>
          <form id = "form" >
            <input id="inputfield" type="text"></input>
            <input id = "search" type = "submit" value = "Search">
          </form>
          <div id="searchlist">
          </div> 
          <script type = "module" nonce="${nonce}" src="${scriptUri}"></script>
          </body>
          </html>`;
        }
      }
async function getResults(searchQuery: string, webview: vscode.WebviewView)
{
    let u = vscode.Uri.joinPath(globalUri);
			let params:string[] = [];
			functionDefinitionMap.forEach((value: string, key: string) => 
			{
				params.push(key);
				params.push(value[0]);
			});
			console.log(params);
			let result: string[] = await vscode.commands.executeCommand(
				'ACS-python.getSearchResults',
				u.path,
				params,
				searchQuery,
			);


      let items = [];
      for( let i = 0 ; i < result.length ; i++ )
			{
				if( i % 2 === 0 )
				{
					items.push({"funcName": result[i], "location": functionDefinitionMap.get(result[i])[1], "description": result[i+1]});
				}
			}
      webview.webview.postMessage({command:'searchresult',result:items});
}