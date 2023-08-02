# j-dev

J(unior)-dev is a command-line interface (CLI) application developed with TypeScript and Node.js. Its help write code in an existing project under the command of an AI OpenAI GPT model.

## Main Features

- Perform file and directory operations like reading, creating, and deleting files under the instruction of GPT.
- Allow GPT to provide meaningful edits, deletions, and new code based on the context of your existing project
- Supports command-line arguments to perform operations directly without any manual intervention

## Setup

### Required Environment Variables

You need to provide your OpenAI API key which can be obtained from the OpenAI official website. To implement this, create a .env file in the root of the project with the following variable:

OPENAI_API_KEY="Your OpenAI API key here"

### Local Setup

To set up on your local machine:

1. Clone this repository
2. Run `npm install` or `yarn install` in the root directory to install all necessary packages
3. Create a .env file and fill in as directed above.
4. Compile the TypeScript code using `tsc` command.
5. Run the application: `npm start` or `yarn start`.

## Using Command-Line Arguments

j-dev supports the passing of command-line arguments for enhanced functionality and ease of use.

The following arguments are available:

| Argument | Description | Type | Default |
| -------- | ----------- | ---- | ------- |
| `prompt` | A string that serves as the prompt for the AI. (Demand Option) | String | - |
| `dir` | A string indicating the directory of the project | String | Current working directory |
| `model` | A string representing the model to use | String | 'gpt-4' |
| `y` | A boolean to automatically confirm all prompts | Boolean | false |
| `maxIter` | A number that specifies the maximum number of iterations | Number | 10 |

## Example Usage

Here is how you can use `j-dev` with command-line arguments in a practical setting:

1. To instruct the AI with a prompt and confirm all prompts automatically:

```bash
jdev --prompt="Update the README to include an example"
```

2. To direct the AI to a specific directory and limit the number of iterations:

```bash
jdev --prompt="write a function that returns a promise in src/functions.ts" --dir="/projects/myProject" --maxIter=5
```

Please note that you must at least pass the `prompt` argument.

## Running Tests

Tests in this project are implemented using Jest. To run the tests, use the command `npm test` or `yarn test` in your terminal.