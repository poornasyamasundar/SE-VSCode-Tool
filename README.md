# SE-VSCode-Tool

_A VScode Extension for Code Summarization._

# Technologies/Libraries Used

-   ### Pygls
```
Python Implementation of Microsoft Language Server Protocol
```

-   ### CodeBERT
```
Used the Roberta Model for generating Code Summaries.
```

-   ### Whoosh
```
For text Based Searching.
```


# Run The Extension


-   To run the extension, clone the repo, and run 'npm install' in the same directory.

-   In addition to that, execute the following command for installing python dependencies:
    ```
    pip install whoosh pygls transformers torch
    ```
-   Before running the extension, download the model into the server directory under the root directory.

-   [Link to the Model](https://code-summary.s3.amazonaws.com/pytorch_model.bin)

# How To Use
> NOTE: _The Extension runs in the developer mode for now._

* Press **f5** to open a new VSCode window in debug mode.
* Press **Ctrl + Shift + p** to open the command palette and execute the **ACS-python: Start** Command, to start the extension.
* Execute **ACS-python: Fetch Definitions** to fetch the definitions for the current file.
* To generate summary for a function:
    * Select the function declaration code, and execute **ACS-python: Get Summary**.
    * This will insert the summary above the function definition.
* To Search for a function description :
    * Click the ACS icon on the sidebar. 
    * Enter the description.
    * A list of matching function descriptions, click on any of them to navigate to the corresponding function definition.
