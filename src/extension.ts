import * as vscode from 'vscode';

//This map contains the map between function names and function descriptions of the current file
let functionDefinitionMap = new Map();

export function activate(context: vscode.ExtensionContext) {

	//call the function hello world to refetch the function definitions
	//TODO: if the function definitions is changed then, how to update the map
	console.log('Congratulations, your extension "sampleextension" is now active!');
	let disposable = vscode.commands.registerCommand('sampleextension.helloWorld', () => {
		vscode.window.showInformationMessage('Hello Poorna');
		getFunctionDefinitions();
		
		let optionsA = ["apple", "almond"];
		let optionsB = ["Ball", "Bat"];
		let optionsC = ["cat", "dog"]
		let quickPick = vscode.window.createQuickPick();
		quickPick.onDidChangeValue((search) => {
			if(search.charAt(0) == 'a'){
				quickPick.items = optionsA.map(op => ({label: op}));
			}
			else if(search.charAt(0) == 'b'){
				quickPick.items = optionsB.map(op => ({label: op}))
			}
			else{
				quickPick.items = optionsC.map(op => ({label: op}));
			}
		});
		quickPick.show();
		console.log(quickPick);
	});

	context.subscriptions.push(disposable);

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