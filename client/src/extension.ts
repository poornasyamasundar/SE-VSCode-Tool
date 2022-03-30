"use strict";
import * as net from "net";
import * as path from "path";
import { resolve } from "path";
import { off, setMaxListeners } from "process";
import * as vscode from 'vscode';
import { ExtensionContext, ExtensionMode, workspace } from "vscode";
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
} from "vscode-languageclient/node";
import { SearchWorldPanel } from "./SearchWorldPanel";
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
let functionDefinitionMap = new Map();

export function activate(context: vscode.ExtensionContext): void {


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
		//test(context);	
	});
	context.subscriptions.push(disposable0);
	let disposable = vscode.commands.registerCommand('sampleextension.helloWorld', () => {
		vscode.window.showInformationMessage('Hello Poorna');
		getFunctionDefinitions();

		let optionsA = ["apple", "almond"];
		let optionsB = ["Ball", "Bat"];
		let optionsC = ["cat", "dog"];
		let quickPick = vscode.window.createQuickPick();
		quickPick.matchOnDescription = true;
		quickPick.onDidChangeValue( async (search) => {
			let u = vscode.Uri.joinPath(context.globalStorageUri, "/poorna");
			let params:string[] = [];
			functionDefinitionMap.forEach((value: string, key: string) => 
			{
				params.push(key);
				params.push(value);
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

	context.subscriptions.push(
		vscode.commands.registerCommand('sampleextension.searchWorld',()=>{
			SearchWorldPanel.createOrShow(context.extensionUri);
			vscode.window.showInformationMessage('Hello');

		})
	);

	//This provides the hover.
	vscode.languages.registerHoverProvider('python', {
		provideHover(document, position, token) {

			const range = document.getWordRangeAtPosition(position); 		//fetch the range of the hovered word
			const word = document.getText(range);							//fetch the word
			if( functionDefinitionMap.has(word) )							//if the word has a definition, then return it
			{
				return {
					contents: [functionDefinitionMap.get(word)],
				};
			}
			return {
				contents: [],
			};
		}
	});
}
/*
async function setList(context: ExtensionContext)
{
	let u = vscode.Uri.joinPath(context.globalStorageUri, "/poorna");
	let params:string[] = [];
	functionDefinitionMap.forEach((value: string, key: string) => 
	{
		params.push(key);
		params.push(value);
	});
	console.log(params);
	let result: string[] = await vscode.commands.executeCommand(
		'helloPoorna',
		u.path,
		params,
		"links",
	);
	quickPick.items = result.map(op => ({label: op}));
}
*/
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
			let def = await getDefiniton(document, pos);		//fetch the definition
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

async function getDefiniton(document: vscode.TextDocument, position: vscode.Position )
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
			let description = sourceFile.lineAt(definition.range.start.line-1);

			//if it is comment, then it is the definition
			if( description.text[0] === '#' )
			{
				return description.text.substring(1);
			}
			//else it is not the definition
			else
			{
				return "No Definition Provided";
			}
		}		
	}

}

export function deactivate() { }