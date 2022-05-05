"use strict";
import * as net from "net";
import * as path from "path";
import { toUSVString } from "util";
import * as vscode from 'vscode';

let startOfCurrentSet = -1;
let mostRecentInCurrentSet= -1;
let descriptionWriting = false;
let num = 1;

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

// Start An Language Server. A TCP server.
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

// gets called on extension activation, 
// Contains all the setup
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
	getFunctionDefinitions();
	// current context
	context.subscriptions.push(client.start());
	
	// For displaying the sidebar, first create a sidebarProvider
	const sidebarProvider = new SidebarProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider("ACS-python-sidebar",sidebarProvider)
		);

	// Register command for : start
	let disposable = vscode.commands.registerCommand('ACS-python.start', async () => {
		vscode.window.showInformationMessage('ACS is Running.');
		// iniatialize
		functionDefinitionMap.clear();
		// get the mappings
		await getFunctionDefinitions();
		globalUri = context.globalStorageUri;
	});
	context.subscriptions.push(disposable);
	
	// Register command for : fetch
	let disposable0 = vscode.commands.registerCommand('ACS-python.fetch', async () => {
		// First clear the existing mapping for function name <=> function description
		functionDefinitionMap.clear();
		// Populate ^ again
		await getFunctionDefinitions();
		// Successful?
		vscode.window.showInformationMessage('Successfully Fetched');
	});
	context.subscriptions.push(disposable0);

	// Register commmand for : getSummary
	let disposable1 = vscode.commands.registerCommand('ACS-python.getSummary', async () => {
		await generateDescription();
	});
	context.subscriptions.push(disposable1);

	// What happens when there's a change in current document?!
	vscode.workspace.onDidChangeTextDocument(async function (event) 
	{
		// If the change is due to the insertion of a new comment by the extension, ignore.
		if( descriptionWriting )
		{
			return;
		}	

		// if something has changed - Added or Deleted by the user.
		if( event.contentChanges.length !== 0 )
		{
			// *A change can span many lines*
			// currentChange -> the current line where change is being made.
			let currentChange = event.contentChanges[0].range.start.line;
			let sourceFile: vscode.TextDocument = event.document;
			let line = '';
			try {
				line = sourceFile.lineAt(currentChange).text;
			}
			catch (e) {
			}
			var splitted = line.split(" ", 3);
			if( splitted.length !== 0 )
			{
				if( splitted[0] === "def" )
				{
					insertDescriptionBox(currentChange);
				}
			}
			
			if (startOfCurrentSet === -1) {
				startOfCurrentSet = currentChange;
				mostRecentInCurrentSet = currentChange;
			}
			else 
			{
				// if the currentchange is made without breaking the set, i.e it is appended to the most recent change.
				if (currentChange === mostRecentInCurrentSet || currentChange === mostRecentInCurrentSet + 1) {
					// if we have reached the limit of 4 lines, generate the summary again
					if (startOfCurrentSet + 4 <= currentChange) {
						let content = '';
						let sourceFile: vscode.TextDocument = event.document;
						for (let i = startOfCurrentSet; i < currentChange; i++) {
							try {
								let endDes = sourceFile.lineAt(i);
								content += endDes.text + '\n';
							}
							catch (e) {
							}
						}

						console.log(content);
						getFunctionBody(currentChange);
						startOfCurrentSet = currentChange;
					}
					mostRecentInCurrentSet = currentChange;
				}
				else {
					// if the current set is broken, i.e. the change is made somewhere else in the file..
					let content = '';
					let sourceFile: vscode.TextDocument = event.document;
					for (let i = startOfCurrentSet; i <= mostRecentInCurrentSet; i++) {
						try {
							let endDes = sourceFile.lineAt(i);
							content += endDes.text + '\n';
						}
						catch (e) {
						}
					}
					startOfCurrentSet = currentChange;
					// generate the summary for changes made so far, 
					getFunctionBody(currentChange);
					
					// and re-initialize the set.
					mostRecentInCurrentSet = currentChange;
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

// This inserts the description body on the corresponding function definition
function insertDescriptionBox(lineNumber: number)
{
	// select the active editor
	let textEditor = vscode.window.activeTextEditor;
	if( textEditor )
	{
		// active document
		let sourceFile = textEditor.document;
		if( lineNumber !== 0 )
		{
			let endDes = sourceFile.lineAt(lineNumber-1);
			if (endDes.text === "$\"\"\"") 
			{
				return;
			}
		}
		// position for the description (line: lineNumber, character: 0)
		let position = new vscode.Position(lineNumber, 0);
		let content = "\"\"\"$\nFunction Description Goes here\n$\"\"\"\n";
		
		// replace the text
		textEditor.edit(builder => {
			builder.replace(new vscode.Range(position.line, 0, position.line, 0), content);
		});
	}
}

// Get the function body of the function enclosing the line: 'lineNumber'
async function getFunctionBody(lineNumber: number)
{
	let functionStartLine = -1;
	let functionEndLine = -1;

	let textEditor = vscode.window.activeTextEditor;
	if( textEditor )
	{
		let sourceFile = textEditor.document;
		let ln = lineNumber;
		
		// Search for the keyword 'def by moving to the top.
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
		try{
			console.log(sourceFile.lineAt(functionStartLine).text);
		}
		catch(e)
		{
			return;
		}

		ln = lineNumber;
		// search for the end of function, moving down and checking the indentation
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

		try{
			console.log(sourceFile.lineAt(functionEndLine).text);
		}
		catch(e)
		{
			return;
		}
		
		// if the current line isn't inside a function.. return
		if( functionStartLine === -1 || functionEndLine === -1 )
		{
			return;
		}

		let body = '';
		// get the body by iterating over the range
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
			// Edit the description
			changeDescription(textEditor.document, startPosition, body);
		}
	}
}

// fetches the new description and modifies the old description - replace if a description is present, add a new one if not.
async function changeDescription(sourceFile: vscode.TextDocument, position: vscode.Position, body: string) 
{
	let textEditor = vscode.window.activeTextEditor;

	if (textEditor) 
	{
		// fetch the description for the function
		let description: string = await vscode.commands.executeCommand(
			'ACS-python.fetchSummary',
			body,
		);
		let i = 1;
		let endDes = sourceFile.lineAt(position.line - i);

		i++;
		// if description already exists
		if (endDes.text === "$\"\"\"") 
		{
			let temp = sourceFile.lineAt(position.line - i);
			while (position.line - i >= 0 && temp.text !== "\"\"\"$") 
			{
				i++;
				temp = sourceFile.lineAt(position.line - i);
			}
			// this changes should not be considered for onChangeTextDocument event triggers
			descriptionWriting = true;
			
			// replace the old description with the new one.
			await textEditor.edit(builder => {

				builder.replace(new vscode.Range(position.line - i + 1, 0, position.line - 2, 1000), description);
			});
			descriptionWriting = false;

		}
		else 
		{
			// description body
			description = "\"\"\"$\n" + description + "\n$\"\"\"\n";

			descriptionWriting = true;

			// place it above the function defintion
			await textEditor.edit(builder => {
				builder.replace(new vscode.Range(position.line, 0, position.line, 0), description);
			});
			descriptionWriting = false;

		}
		functionDefinitionMap.clear();
		getFunctionDefinitions();
	}
}

// fetch the defintion of a function, which is called/used at position: 'position' 
async function getDefinition(document: vscode.TextDocument, position: vscode.Position )
{
	//fetch all the definitions of the function present at 'position'
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
	
			return [description, definition.uri.path];
		}		
	}

}


// Given the location of the defintion of a function, get the corresponding description
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

// Given the selection (start line and end line) -> (indicates the function body), execute the fetchsummary command 
// and place the generated description
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
	functionDefinitionMap.clear();
	getFunctionDefinitions();
}

export function deactivate() { }
