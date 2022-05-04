(function () {
    const vscode = acquireVsCodeApi();
    document.getElementById("form").onsubmit= function (event) {
        event.preventDefault();
        let searchString = document.getElementById("inputfield").value;
        console.log("Search query before sending to extension: ", searchString);
        vscode.postMessage({ command: "searchstring", query: searchString });
    };
    window.addEventListener("message", (event) => {
        const message = event.data;
        switch (message.command) {
            case "searchresult":
                let arr = message.result;
                console.log("Search results received from extension", arr);
                populateChildren(arr);
        }
    });

    const populateChildren = (arr) => {
        let elem = document.getElementById("searchlist");
        while (elem.firstChild) {
            elem.removeChild(elem.firstChild);
        }
        for (var i in arr) {
            let child = document.createElement("div");
            child.classList.add("list-item");
            //TODO:
            child.addEventListener("click", () => {
                vscode.postMessage({
                    command: "navigate",
                    location: arr[i].location,
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