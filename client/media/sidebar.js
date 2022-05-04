// This is the js file for sidebar component.
(function () {
    const vscode = acquireVsCodeApi();
    
    document.getElementById("form").onsubmit= function (event) {
        event.preventDefault();
        let searchString = document.getElementById("inputfield").value;
        vscode.postMessage({ command: "searchstring", query: searchString });
    };

    // when a "message" event happens, the results are received
    window.addEventListener("message", (event) => {
        const message = event.data;
        switch (message.command) {
            case "searchresult":
                let arr = message.result;
                // results are here, populate the best matched description area
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