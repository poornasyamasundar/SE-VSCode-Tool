//const { VersionedTextDocumentIdentifier } = require("vscode-languageclient");
//import { VersionedTextDocumentIdentifier } from "vscode-languageclient";
(function () {
    const vscode = acquireVsCodeApi();
    let inputField = document.getElementById("inputfield");

    inputField.addEventListener("input", (event) => {
        let searchString = event.target.value;
        console.log("Search query before sending to extension: ",searchString);
        vscode.postMessage({command:"searchstring",query:searchString});        
    });
    window.addEventListener('message',event=>{
        const message=event.data;
        switch(message.command) 
        {   
            case "searchresult":
                let arr=message.result;
                console.log("Search results received from extension", arr);
                populateChildren(arr);
        }
    });

    const populateChildren = (arr) => {
        let elem=document.getElementById("searchlist");
        while(elem.firstChild) {
             elem.removeChild(elem.firstChild);
        }
        for(var i in arr)
        {
            let child = document.createElement("li");

            //TODO: 
            child.addEventListener("click",()=>{
                console.log("onclick redirect to function definition");
            });
            

            child.innerHTML=arr[i];
            elem.appendChild(child);
        }
    };
    
}());

// const vscode = acquireVsCodeApi();

//     const oldState = vscode.getState() || { colors: [] };

//     /** @type {Array<{ value: string }>} */
//     let colors = oldState.colors;

//     updateColorList(colors);

//     document.querySelector('.add-color-button').addEventListener('click', () => {
//         addColor();
//     });

//     // Handle messages sent from the extension to the webview
//     window.addEventListener('message', event => {
//         const message = event.data; // The json data that the extension sent
//         switch (message.type) {
//             case 'addColor':
//                 {
//                     addColor();
//                     break;
//                 }
//             case 'clearColors':
//                 {
//                     colors = [];
//                     updateColorList(colors);
//                     break;
//                 }

//         }
//     });

//     /**
//      * @param {Array<{ value: string }>} colors
//      */
//     function updateColorList(colors) {
//         const ul = document.querySelector('.color-list');
//         ul.textContent = '';
//         for (const color of colors) {
//             const li = document.createElement('li');
//             li.className = 'color-entry';

//             const colorPreview = document.createElement('div');
//             colorPreview.className = 'color-preview';
//             colorPreview.style.backgroundColor = `#${color.value}`;
//             colorPreview.addEventListener('click', () => {
//                 onColorClicked(color.value);
//             });
//             li.appendChild(colorPreview);

//             const input = document.createElement('input');
//             input.className = 'color-input';
//             input.type = 'text';
//             input.value = color.value;
//             input.addEventListener('change', (e) => {
//                 const value = e.target.value;
//                 if (!value) {
//                     // Treat empty value as delete
//                     colors.splice(colors.indexOf(color), 1);
//                 } else {
//                     color.value = value;
//                 }
//                 updateColorList(colors);
//             });
//             li.appendChild(input);

//             ul.appendChild(li);
//         }

//         // Update the saved state
//         vscode.setState({ colors: colors });
//     }

//     /** 
//      * @param {string} color 
//      */
//     function onColorClicked(color) {
//         vscode.postMessage({ type: 'colorSelected', value: color });
//     }

//     /**
//      * @returns string
//      */
//     function getNewCalicoColor() {
//         const colors = ['020202', 'f1eeee', 'a85b20', 'daab70', 'efcb99'];
//         return colors[Math.floor(Math.random() * colors.length)];
//     }

//     function addColor() {
//         colors.push({ value: getNewCalicoColor() });
//         updateColorList(colors);
//     }