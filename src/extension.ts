// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { MessagePort, workerData } from 'worker_threads';

let map = new Map();

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "sampleextension" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('sampleextension.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello Poorna');
	});

	context.subscriptions.push(disposable);

	vscode.languages.registerHoverProvider('python', {
		provideHover(document, position, token) {
			const range = document.getWordRangeAtPosition(position); 
			const word = document.getText(range);
			console.log("word from map is " + map.get(word));
			if( map.has(word) )
			{
				return {
					contents: [map.get(word)],
				};
			}
			else{
				printDefinitionsForActiveEditor(document, position);
			}
			//console.log(document.eol);
			//console.log(document.fileName);
			//console.log(document.languageId);
			//console.log(document.isClosed);
		}
	});
}

async function printDefinitionsForActiveEditor(document: vscode.TextDocument, position: vscode.Position) {
	const activeEditor = vscode.window.activeTextEditor;
	if (!activeEditor) {
		return;
	}

	const definitions = await vscode.commands.executeCommand<vscode.Location[]>(
		'vscode.executeDefinitionProvider',
		document.uri,
		position
	);

	for (let definition of definitions) 
	{
		let sourceDef = document.getText(document.getWordRangeAtPosition(definition.range.start));
		console.log("sourceDef is = " + sourceDef);
		console.log(definition);
		
		const word = document.getText(document.getWordRangeAtPosition(position));
		
		if (map.has(word) === false) 
		{
			map.set(word, "");
			
			let instances = await vscode.commands.executeCommand<vscode.Hover[]>(
				'vscode.executeHoverProvider',
				document.uri,
				position
			);
			
			for (let instance of instances) {
				let markdown = instance.contents[0];
				let str = "";
				if ((markdown as vscode.MarkdownString).value) {
					str = (markdown as vscode.MarkdownString).value;
				}
				if (str.substring(11, 19) === "function") {
					console.log("line no is = " + definition.range.start.line);
					if( definition.range.start.line !== 0 )
					{
						let description = document.lineAt(definition.range.start.line-1);
						if( description.text[0] === '#' )
						{
							map.set(word, description.text.substring(1));
						}
						else
						{
							map.set(word, "No Definition");
						}
					}
					else
					{
						map.set(word, "No Definition");
					}
				}
			}
		}
	}
}

// this method is called when your extension is deactivated
export function deactivate() { }