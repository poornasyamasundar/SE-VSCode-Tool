"use strict";
import * as net from "net";
import * as path from "path";
import * as vscode from 'vscode';

let currentLine = -1;
let lastChange = -1;
let descriptionWriting = false;

import { ExtensionMode, workspace } from "vscode";
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
} from "vscode-languageclient/node";
import {SidebarProvider} from "./SidebarProvider";

let client: LanguageClient;

// File types for the extension
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

// Start An LSP. A TCP server.
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

// Options for the Language Server.
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

// Extension Root directory.
export let globalUri: vscode.Uri;

// 
export function activate(context: vscode.ExtensionContext): void {

	if( context.extensionMode === ExtensionMode.Development ){
		client = startLanguageServerTCP(2087);
	}
	else{
		const cwd = path.join(__dirname, "..", "..");
		const pythonPath = workspace.getConfiguration("python").get<string>("pythonPath");
		
		if( !pythonPath) 
		{
			throw new Error("`python.pythonPath` is not set");
		}

		client = startLangServer(pythonPath, ["-m", "server"], cwd);
	}

	context.subscriptions.push(client.start());
	
	const sidebarProvider = new SidebarProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider("ACS-python-sidebar",sidebarProvider)
		);
	
	let disposable0 = vscode.commands.registerCommand('ACS-python.fetch', async () => {
		functionDefinitionMap.clear();
		await getFunctionDefinitions();
		vscode.window.showInformationMessage('Successfully Fetched');
	});
	context.subscriptions.push(disposable0);

	let disposable = vscode.commands.registerCommand('ACS-python.start', async () => {
		vscode.window.showInformationMessage('ACS is Running.');
		functionDefinitionMap.clear();
		await getFunctionDefinitions();
		globalUri = context.globalStorageUri;
	});

	let disposable1 = vscode.commands.registerCommand('ACS-python.getSummary', async () => {
		await generateDescription();
	});

	context.subscriptions.push(disposable);
	context.subscriptions.push(disposable1);

	vscode.workspace.onDidChangeTextDocument(async function (event) 
	{
		if( descriptionWriting )
		{
			return;
		}	

		if( event.contentChanges.length !== 0 )
		{
			let startLine = event.contentChanges[0].range.start.line;
			let sourceFile: vscode.TextDocument = event.document;
			let line = '';
			try {
				line = sourceFile.lineAt(startLine).text;
			}
			catch (e) {
			}
			var splitted = line.split(" ", 3);
			if( splitted.length !== 0 )
			{
				if( splitted[0] === "def" )
				{
					insertDescriptionBox(startLine);
				}
			}
			
			if (currentLine === -1) {
				currentLine = startLine;
				lastChange = startLine;
			}
			else 
			{
				if (startLine === lastChange || startLine === lastChange + 1) {
					if (currentLine + 4 <= startLine) {
						let content = '';
						let sourceFile: vscode.TextDocument = event.document;
						for (let i = currentLine; i < startLine; i++) {
							try {
								let endDes = sourceFile.lineAt(i);
								content += endDes.text + '\n';
							}
							catch (e) {
							}
						}

						console.log(content);
						getFunctionBody(startLine);
						//await dummyGenerator(sourceFile, startPosition, content);
						currentLine = startLine;
					}
					lastChange = startLine;
				}
				else {
					let content = '';
					let sourceFile: vscode.TextDocument = event.document;
					for (let i = currentLine; i <= lastChange; i++) {
						try {
							let endDes = sourceFile.lineAt(i);
							content += endDes.text + '\n';
						}
						catch (e) {
						}
					}

					console.log(content);
					currentLine = startLine;
					getFunctionBody(startLine);
					lastChange = startLine;
				}
			}
		}
	});
		

	//This provides the hover.
	vscode.languages.registerHoverProvider('python', {
		provideHover(document, position, token) {

			const range = document.getWordRangeAtPosition(position); 		//fetch the range of the hovered word
			const word = document.getText(range);							//fetch the word
			if( functionDefinitionMap.has(word) )							//if the word has a definition, then return it
			{
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
			'ACS-python.start',
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
}
function insertDescriptionBox(lineNumber: number)
{
	let textEditor = vscode.window.activeTextEditor;
	if( textEditor )
	{
		let sourceFile = textEditor.document;
		if( lineNumber !== 0 )
		{
			let endDes = sourceFile.lineAt(lineNumber-1);
			if (endDes.text === "$\"\"\"") 
			{
				return;
			}
		}
		let position = new vscode.Position(lineNumber, 0);
		let content = "\"\"\"$\nFunction Description Goes here\n$\"\"\"\n";
		
		textEditor.edit(builder => {
			builder.replace(new vscode.Range(position.line, 0, position.line, 0), content);
		});
	}
}

async function getFunctionBody(lineNumber: number)
{
	let functionStartLine = -1;
	let functionEndLine = -1;

	let textEditor = vscode.window.activeTextEditor;
	if( textEditor )
	{
		let sourceFile = textEditor.document;
		let ln = lineNumber;
		while( ln !== 0 )
		{
			let line = '';
			try{
			line = sourceFile.lineAt(ln).text;
			}
			catch(e)
			{}
			var splitted = line.split(" ", 3);
			if( splitted.length !== 0 )
			{
				if( splitted[0] === "def" )
				{
					functionStartLine = ln;
					break;
				}
			}
			ln -= 1;
		}
		console.log("Function start line is", functionStartLine);
		try{
			console.log(sourceFile.lineAt(functionStartLine).text);
		}
		catch(e)
		{
			return;
		}

		ln = lineNumber;
		while( true )
		{
			let line = '';
			try{
				line = sourceFile.lineAt(ln).text;
			}
			catch(e)
			{
				break;
			}
			if( line !== '' && line.substring(0, 4) !== "    " )
			{
				functionEndLine = ln-1;
				break;
			}
			ln++;
		}
		if( functionEndLine === -1 )
		{
			functionEndLine = ln-1;
		}

		console.log("functionEndLIne", functionEndLine);
		try{
			console.log(sourceFile.lineAt(functionEndLine).text);
		}
		catch(e)
		{
			return;
		}
		
		if( functionStartLine === -1 || functionEndLine === -1 )
		{
			return;
		}

		let body = '';
		for( let i = functionStartLine; i <= functionEndLine ; i++ )
		{
			try{
				body += sourceFile.lineAt(i).text + "\n";
			}
			catch(e)
			{
				return;
			}
		}

		let startPosition = new vscode.Position(functionStartLine, 0);
		if( body !== '' )
		{
			changeDescription(textEditor.document, startPosition, body);
		}
	}
}

async function changeDescription(sourceFile: vscode.TextDocument, position: vscode.Position, body: string) 
{
	let textEditor = vscode.window.activeTextEditor;

	if (textEditor) 
	{
		//let description = content;
		let description: string = await vscode.commands.executeCommand(
			'ACS-python.fetchSummary',
			body,
		);
		let i = 1;
		let endDes = sourceFile.lineAt(position.line - i);

		i++;
		if (endDes.text === "$\"\"\"") 
		{
			let temp = sourceFile.lineAt(position.line - i);
			while (position.line - i >= 0 && temp.text !== "\"\"\"$") 
			{
				i++;
				temp = sourceFile.lineAt(position.line - i);
			}

			descriptionWriting = true;
			await textEditor.edit(builder => {

				builder.replace(new vscode.Range(position.line - i + 1, 0, position.line - 2, 1000), description);
			});
			descriptionWriting = false;

		}
		else 
		{
			description = "\"\"\"$\n" + description + "\n$\"\"\"\n";

			descriptionWriting = true;
			await textEditor.edit(builder => {
				builder.replace(new vscode.Range(position.line, 0, position.line, 0), description);
			});
			descriptionWriting = false;

		}
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
	if(endDes.text === "$\"\"\""){
		let temp = sourceFile.lineAt(definition.range.start.line-i);
		while(temp.text !== "\"\"\"$"){
			i++;
			des = temp.text + "\n" + des;
			temp = sourceFile.lineAt(definition.range.start.line-i);
		}
		return des.substring(0, des.length -1);
	}
	else{
		return "No Definition Provided";
	}

}

async function generateDescription(
){
	let textEditor = vscode.window.activeTextEditor;
	if (textEditor) {
		let selection = textEditor.selection;
		let position = selection.start;
		console.log("Selected text is:");
		console.log(textEditor.document.getText(selection));
		let description: string = await vscode.commands.executeCommand(
			'ACS-python.fetchSummary',
			textEditor.document.getText(selection),
		);
		let sourceFile: vscode.TextDocument = textEditor.document;
		let i = 1;
		let endDes = sourceFile.lineAt(position.line - i);
		i++;
		if (endDes.text === "$\"\"\"") {
			let temp = sourceFile.lineAt(position.line - i);
			while (position.line - i >= 0 && temp.text !== "\"\"\"$") {
				i++;
				temp = sourceFile.lineAt(position.line - i);
			}
			textEditor.edit(builder => {

				builder.replace(new vscode.Range(position.line - i + 1, 0, position.line - 2, 1000), description);
			});
		}
		else {
			description = "\"\"\"$\n" + description + "\n$\"\"\"\n";
			textEditor.edit(builder => {
				builder.replace(new vscode.Range(position.line, 0, position.line, 0), description);
			});
		}
	}
}

export function deactivate() { }
