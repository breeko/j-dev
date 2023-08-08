# j-dev

J(unior)-dev is a command-line interface (CLI) application developed with TypeScript and Node.js. It helps write code in an existing project under the command of an AI OpenAI GPT model.

[![asciicast](https://asciinema.org/a/O23EVL7f135uXhBvFSCRhtNHZ.svg)](https://asciinema.org/a/O23EVL7f135uXhBvFSCRhtNHZ)

## Main Features

- Perform file and directory operations like reading, creating, and deleting files under the instruction of GPT.
- Allow an LLM to provide meaningful edits, deletions, and new code based on the context of your existing project
- Supports command-line arguments to perform operations directly without any manual intervention

## Principles

This tool was inspired by [smol-dev](https://github.com/smol-ai/developer), but seeks to remove some of the constraints of the project. The biggest problem with some of the LLM tools like smol-dev is that they require the user to work in a new code base or manually select pass in relevant code snippets to work in an existing codebase.

This project attempts to correct some of the limitations of such tools

### Transparency and customization
j-dev is meant to be fully transparent about what its doing. This means you should clearly see what prompt is being provided and what prompt is being returned.

The system prompts are stored in the `/src/prompts` folder. The tool will also try to parse the reply and act on it accordingly. However, the response prompt is always available to the user by responding `(v)iew response`. The request can be accessed by responding `view (r)equest`

```bash
> yarn start --prompt "update the readme with an MIT license"
yarn run v1.22.17
$ node dist/index.js --prompt 'update the readme with an MIT license'
[1 / 10, tokens 408] Do you want to access file README.md? (y)es, (n)o, (c)omment, (v)iew response or view (r)equest v
ACCESS README.md
```

You also have control over which files the application can access. After the initial prompt, the LLM is given the folder structure of your project (ignoring files specified in .gitignore), but then access to each file has to be granted. 

Creating editing and deleting files always requires confirmation, but explicit permission to read files can be turned off with the `-y` flag.

### Respect tokens

Tokens used are tracked and made explicit in the responses. Too many tools are loose with how many tokens which results in unnecessary expense. For instance, `smol-dev` basically rebuilds the entire app on every request. This requires unnecessary iterations and whack-a-mole bug fixes. `j-dev` is meant to be used in an existing codebase while restricting the amount of tokens used.

`j-dev` also lets you control how many iterations a prompt can generate. The default is 10 iterations in a single prompt but can be adjusted through the `-maxIter` argument. 

### Ability to work in a large existing codebase

`j-dev` is meant to work in an existing codebase. It only communicates what is necessary for any given task while giving the LLM discretion as to what it needs to know. Access grants are controlled by the user 


### Don't fight the LLM

LLMs aren't perfect, at least not yet. While `j-dev` tries to be clear and simple with its instructions, it tries to instruct the LLM to perform tasks in the way it has been trained. For instance, it allows some flexibility in including a language when specifying code blocks and allows multiple requests in one response.

When I tried stating conditions that go against what the LLM would naturally want to do, it would often ignore the rules anyway. So some flexibility is built in.


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
jdev --prompt="update the readme to include command line arguments from the app" --dir="/projects/myProject" --maxIter=5
```

Please note that you must at least pass the `prompt` argument.

## License
This project is licensed under the terms of the MIT License.
