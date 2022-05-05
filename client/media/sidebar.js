//const { VersionedTextDocumentIdentifier } = require("vscode-languageclient");
//import { VersionedTextDocumentIdentifier } from "vscode-languageclient";

// this function handles the search functionality of the webview
(function () 
    {
        const vscode = acquireVsCodeApi();
        let inputField = document.getElementById("inputfield");

        inputField.addEventListener("input", (event) => {
            let searchString = event.target.value;
            console.log("Search query before sending to extension: ", searchString);
            vscode.postMessage({ command: "searchstring", query: searchString });
        });
        window.addEventListener("message", (event) => {
            const message = event.data;
            switch (message.command) {
                case "searchresult":
                    let arr = message.result;
                    console.log("Search results received from extension", arr);
                    populateChildren(arr);
            }
        });

    // populate the area with the results of the search
    const populateChildren = (arr) => {
        let elem = document.getElementById("searchlist");
        while (elem.firstChild) {
            elem.removeChild(elem.firstChild);
        }
        for (let i = 0; i < arr.length; i++) {
            let child = document.createElement("div");
            child.classList.add("list-item");
            // each div is clickable, which when clicked, navigates to the corresponding function defintion.
            let loc = arr[i].location;
            child.addEventListener("click", () => {
                vscode.postMessage({
                    command: "navigate",
                    location: loc,
                });
            });
            child.innerHTML = `
                <div class="main-text"> 
                    Function: ${arr[i].funcName}
                </div>
                <div class="main-text"> 
                    Description: ${arr[i].description}
                </div>
                <div class="dim-text">
                    ${arr[i].location}
                </div>`;
            elem.appendChild(child);
        }
    };
    
})();