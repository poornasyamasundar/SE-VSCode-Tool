"use strict";
import * as net from "net";
import * as path from "path";
import { resolve } from "path";
import { off, setMaxListeners } from "process";
import * as vscode from 'vscode';

import { ExtensionContext, ExtensionMode, workspace } from "vscode";
import {
	InsertReplaceEdit,
	InsertTextFormat,
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
} from "vscode-languageclient/node";
import {SidebarProvider} from "./SidebarProvider";

let client: LanguageClient;



function getClientOptions(): LanguageClientOptions
{
    return {
        documentSelector: [
            {
                scheme: "file", language: "python"
            },
            {
                scheme: "untitled", language: "python"
            },
        ],
		outputChannelName: "[pygls] PythonLanguageServer",
		synchronize:
		{
			fileEvents: workspace.createFileSystemWatcher("**/.clientrc"),
		},
    };
}

function startLanguageServerTCP(addr: number): LanguageClient
{
	const serveroptions: ServerOptions = () =>{
		return new Promise((resolve) => 
		{
			const clientSocket = new net.Socket();
			clientSocket.connect(addr,"127.0.0.1", ()=>{
				resolve({
					reader: clientSocket,
					writer: clientSocket,
				});
			});
		});
	};

	return new LanguageClient(
		`tcp lang server (port ${addr})`,
		serveroptions,
		getClientOptions()
	);
}

function startLangServer(
	command: string,
	args: string[],
	cwd: string
): LanguageClient {
	const serveroptions: ServerOptions = {
		args, command, options: { cwd },
	};
	return new LanguageClient(command, serveroptions, getClientOptions());
}

//This map contains the map between function names and function descriptions of the current file
export let functionDefinitionMap = new Map();
export let globalUri: vscode.Uri;

export function activate(context: vscode.ExtensionContext): void {


	//let textEditor = vscode.window.activeTextEditor.selection;
	//console.log(textEditor);
	if( context.extensionMode === ExtensionMode.Development ){
		client = startLanguageServerTCP(2087);
		console.log("server run manually");
	}

	else{
		const cwd = path.join(__dirname, "..", "..");
		const pythonPath = workspace.getConfiguration("python").get<string>("pythonPath");
		
		if( !pythonPath) 
		{
			throw new Error("`python.pythonPath` is not set");
		}

		client = startLangServer(pythonPath, ["-m", "server"], cwd);
		console.log("Server run production");
	}


	
	context.subscriptions.push(client.start());
	
	const sidebarProvider = new SidebarProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider("sampleextension-sidebar",sidebarProvider)
		);
	
	//call the function hello world to refetch the function definitions
	//TODO: if the function definitions is changed then, how to update the map
	console.log('Congratulations, your extension "sampleextension" is now active!');
	let disposable0 = vscode.commands.registerCommand('sampleextension.fetch', () => {
		vscode.window.showInformationMessage('fetch');
	changeDescription();
	});
	context.subscriptions.push(disposable0);
	let disposable = vscode.commands.registerCommand('sampleextension.helloWorld', () => {
		vscode.window.showInformationMessage('Hello Poorna');
		globalUri = context.globalStorageUri;
		functionDefinitionMap.clear();
		getFunctionDefinitions();
		/*
		let textEditor = vscode.window.activeTextEditor;
		console.log(textEditor);
		if( textEditor )
		{
			let selection = textEditor.selection;
			let text = textEditor.document.getText(selection);
			console.log(text);

			//let st = "\"\"\"$ \n \"\"\"$";
			textEditor.edit(builder => {

				builder.replace(selection, "\"\"\"$\n$\"\"\"\n" + text);
			});
		}
		*/

		let quickPick = vscode.window.createQuickPick();
		quickPick.matchOnDescription = true;
		quickPick.onDidChangeValue( async (search) => {
			let u = vscode.Uri.joinPath(context.globalStorageUri, "/poorna");
			let params:string[] = [];
			functionDefinitionMap.forEach((value: string, key: string) => 
			{
				params.push(key);
				params.push(value[0]);
			});
			console.log(params);
			let result: string[] = await vscode.commands.executeCommand(
				'helloPoorna',
				u.path,
				params,
				search,
			);
			console.log("final result + " , result);
			let functs = [];
			let showitems = [];
			for( let i = 0 ; i < result.length ; i++ )
			{
				if( i % 2 === 0 )
				{
					showitems.push(({label: result[i], description: result[i+1]}));
				}
			}
			let s = showitems.map(op => ({label: op.label, description: op.description}));
			quickPick.items = s;
		});
		quickPick.show();
	});

	context.subscriptions.push(disposable);

	//This provides the hover.
	vscode.languages.registerHoverProvider('python', {
		provideHover(document, position, token) {

			const range = document.getWordRangeAtPosition(position); 		//fetch the range of the hovered word
			const word = document.getText(range);							//fetch the word
			if( functionDefinitionMap.has(word) )							//if the word has a definition, then return it
			{
				console.log("word hovered is ", word);
				console.log("getWord = ", functionDefinitionMap.get(word));
				console.log("getWord = ", functionDefinitionMap.get(word)[0]);
				return {
					contents: [(functionDefinitionMap.get(word))[0]],
				};
			}
			return {
				contents: [],
			};
		}
	});
}
//This function populates the function definition map
async function getFunctionDefinitions()
{
	//if no file openend, then return;
	const activeEditor = vscode.window.activeTextEditor;
	if( !activeEditor )
	{
		return;
	}

	let document = activeEditor.document;
	let u = document?.uri;
	
	//get the token legends
	const tokensLegends = await vscode.commands.executeCommand<vscode.SemanticTokensLegend>(
		'vscode.provideDocumentSemanticTokensLegend',
		u,
	);
	
	//For some reason the first time helloworld is called there is no output, so call again after 1 sec if no output
	if( tokensLegends === undefined )
	{
		setTimeout(()=>
		{vscode.commands.executeCommand(
			'sampleextension.helloWorld',
		);}, 1000);
		return;
	}

	//fetch tokens
	const tokens = await vscode.commands.executeCommand<vscode.SemanticTokens>(
		'vscode.provideDocumentSemanticTokens',
		u,
	);

	let currentLine = 0;
	let charPos = 0;

	//This for loop depends on the structure of the tokens returned, read the documentation to understand the below code.
	for( let i = 0 ; i < tokens.data.length/5 ; i++ )
	{
		currentLine = currentLine + tokens.data[i*5];
		if( tokens.data[i*5] === 0 )
		{
			charPos += tokens.data[i*5+1];
		}
		else
		{
			charPos = tokens.data[i*5+1];
		}

		let pos = new vscode.Position(currentLine, charPos);
		let tokenName = document.getText(document.getWordRangeAtPosition(pos));
		let tokenType = tokensLegends.tokenTypes[tokens.data[i*5+3]];				

		//if the definition is not already added and if the token is a function 
		if( !functionDefinitionMap.has(tokenName) && tokenType === 'function' )
		{
			let def = await getDefinition(document, pos);		//fetch the definition
			functionDefinitionMap.set(tokenName, def);
		}
	}
	//print the function definition map after fetching all definitions
	console.log("Succesfully fetched the definitions");
	for( let [key,value] of functionDefinitionMap )
	{
		console.log(key, " - " , value);
	}
}

async function getDefinition(document: vscode.TextDocument, position: vscode.Position )
{
	//fetch all the definitions
	const definitions = await vscode.commands.executeCommand<vscode.Location[]>
	(
		'vscode.executeDefinitionProvider',
		document.uri,
		position
	);

	for (let definition of definitions) 
	{
		//get the source file( the file that contains the definition)
		let sourceFile = await vscode.workspace.openTextDocument(definition.uri);
		
		if( definition.range.start.line !== 0 )
		{
			//get the description from the line above the declaration

			let description = fetchDescription(sourceFile, definition);
			console.log("description = ",description);
			

			//changeDescription(definition, "this description was changed");

			return [description, definition.uri.path];
		}		
	}

}

function fetchDescription(
	sourceFile: vscode.TextDocument,
	definition: vscode.Location
){
	let des = "";
	let listDes = [];
	let i=1;
	let endDes = sourceFile.lineAt(definition.range.start.line-i);
	i++;
	console.log("endDes = ", endDes.text);//[endDes.text.length-4, endDes.text.length]);
	if(endDes.text === "$\"\"\""){
		let temp = sourceFile.lineAt(definition.range.start.line-i);
		while(temp.text !== "\"\"\"$"){
			i++;
			des = temp.text + "\n" + des;
			console.log("line numbers; ", definition.range.start.line-i);
			temp = sourceFile.lineAt(definition.range.start.line-i);
		}

		//let startDesLine = definition.range.start.line + i;
		console.log("des = ", des);
		return des.substring(0, des.length -1);
	}
	else{
		return "No Definition Provided";
	}

}

async function changeDescription(
){
	let textEditor = vscode.window.activeTextEditor;
	if (textEditor) {
		let selection = textEditor.selection;
		let position = selection.start;
		let description: string = await vscode.commands.executeCommand(
			'sampleextension.fetchSummary',
			textEditor.document.getText(selection),
		);
		console.log("Description generated is ", description);
		let sourceFile: vscode.TextDocument = textEditor.document;
		let i = 1;
		let endDes = sourceFile.lineAt(position.line - i);
		i++;
		console.log("End des = ", endDes.text);
		if (endDes.text === "$\"\"\"") {
			let temp = sourceFile.lineAt(position.line - i);
			while (position.line - i >= 0 && temp.text !== "\"\"\"$") {
				i++;
				console.log("change line = ", position.line - i);
				temp = sourceFile.lineAt(position.line - i);
			}
			//let startDesLine = i;
			//let r = new vscode.Range(definition.range.start.line-i, 0, definition.range.start.line-1, 1000);
			console.log("textedit, beyotch - ");
			textEditor.edit(builder => {

				builder.replace(new vscode.Range(position.line - i + 1, 0, position.line - 2, 1000), description[0]);
			});
		}
		else {
			description = "\"\"\"$\n" + description[0] + "\n$\"\"\"\n";
			textEditor.edit(builder => {
				builder.replace(new vscode.Range(position.line, 0, position.line, 0), description);
			});
		}
	}
}

export function deactivate() { }
