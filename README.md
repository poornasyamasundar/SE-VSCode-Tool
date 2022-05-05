# SE-VSCode-Tool

_A VScode Extension for Code Summarization._

# Description of the tool

- The main purpose of our tool is to help developers with documentation. We built a VS Code extension that provides a summary of the code using the - CodeBERT Roberta Model.

- We intend to provide live code summaries for every 4-5 lines of code written by a developer, which he can utilize as he sees fit. Furthermore, users can provide customized descriptions of the functions. 

- We designed a UI for searching functions within the project based on their descriptions. Anytime we hover over a function name, the corresponding description will be displayed.

# Any existing solutions and Novelty of our project :

- Other languages such as C++ and Java have extensions of this type. Python is the most commonly used language, so we built a VS code extension for it.

- As part of our project, we have implemented a new feature that allows users to search across our projects by function.



# Technologies/Libraries Used

-   ### Pygls
```
Python Implementation of Microsoft Language Server Protocol
```
-   ### CodeBERT
```
Used the Roberta Model for generating code summaries.
```
-   ### Gensim 
```
Used a pretrained gensim model (glove-wiki-gigaword-300) for implementing the function description search feature.
```
-   ### VS Code API
-   ### TypeScript & Python



# Run The Extension


-   To run the extension, clone the repo, and execute the following in the same directory.
    ```
    npm install 
    ```
-   In addition to that, execute the following for installing python dependencies:
    ```
    pip install pygls
    ```

# How To Use
> NOTE: _The Extension runs in the developer mode for now._

* Press **f5** to open a new VSCode window in debug mode.
* In the debug window: 
    * Description will be generated on the fly, while writing/editing a function.
    * To specifically generate summary for a function:
        * Select the function declaration code, and execute **ACS-python: Get Summary**.
        * This will insert the summary above the function definition.
    * To Search for a function description :
        * Click the ACS icon on the sidebar. 
        * Enter the description.
        * A list of matching function descriptions appears, click on any of them to navigate to the corresponding function definition.

# DEMO
[Link to Demonstration](https://drive.google.com/file/d/1CjQBl-2XjnfLyBKYqi5PyJr-QEvf-6j6/view?usp=sharing)
