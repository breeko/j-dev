#!/usr/bin/env node
import yargs from 'yargs/yargs';
import {hideBin} from 'yargs/helpers';
import {getGptResponse, parseResponse} from './gpt';
import {readFile, writeFile, readDirectory, createFile, deleteFile, printDiff} from './file';
import {ChatCompletionRequestMessage} from "openai/api";
import {SYSTEM_PROMPT} from "./prompts/system";
import readline from "readline";
import chalk from "chalk";
import {CreateChatCompletionResponse, CreateCompletionResponseUsage} from "openai";
import {RequestAccess, RequestChange, RequestCreate, RequestDelete, RequestFollowup} from "./types";

const argv = yargs(hideBin(process.argv))
  .options({
    prompt: {type: 'string', demandOption: true, describe: 'The prompt for the AI'},
    dir: {type: 'string', default: process.cwd(), describe: 'The directory of the project'},
    model: {type: 'string', default: 'gpt-4', describe: 'The model to use'},
    y: {type: 'boolean', default: false, describe: 'Automatically confirm all file access requests'},
    maxIter: {type: "number", default: 10, describe: "The maximum number of iterations"}
  }).parseSync();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function confirm(
  request: string | undefined,
  response: RequestChange | RequestCreate | RequestDelete | RequestAccess,
  prefix: string,
  strict: boolean
): Promise<{
  confirm: boolean,
  comment: string | undefined
}> {
  const prompt = `${prefix} Do you want to ${response.type} file ${response.path}? (y)es, (n)o, (c)omment, (v)iew response or view (r)equest `
  if (!strict && argv.y) {
    return {confirm: true, comment: undefined};
  }

  return new Promise((resolve) => {
    const questionFunc = (prompt: string) => {
      rl.question(prompt, (answer) => {
        const lowerCaseAnswer = answer.toLowerCase();

        if (lowerCaseAnswer === 'y' || lowerCaseAnswer === 'yes') {
          resolve({confirm: true, comment: undefined});
        } else if (lowerCaseAnswer === 'n' || lowerCaseAnswer === 'no') {
          resolve({confirm: false, comment: undefined});
        } else if (lowerCaseAnswer === 'c' || lowerCaseAnswer === 'comment') {
          rl.question("Enter your comment: ", (comment) => {
            resolve({confirm: false, comment: comment});
          });
        } else if (lowerCaseAnswer === 'v' || lowerCaseAnswer === 'view') {
          console.log(response.raw)
          return questionFunc(prompt)
        } else if (lowerCaseAnswer === 'r') {
          console.log(request)
          return questionFunc(prompt)
        } else {
          console.log("Invalid answer. Please respond with 'y', 'yes', 'n', 'no', 'c' or 'comment'.");
          questionFunc(prompt);
        }
      });
    };
    questionFunc(prompt);
  });
}

export async function askQuestion(response: RequestFollowup, prefix: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(`${prefix} ${response.content}`, (answer) => {
      resolve(answer);
    });
  });
}

const updateUsage = (orig: CreateCompletionResponseUsage, request: Pick<CreateChatCompletionResponse, "usage">) => {
  orig.completion_tokens += request.usage?.completion_tokens || 0
  orig.prompt_tokens += request.usage?.prompt_tokens || 0
  orig.total_tokens += request.usage?.total_tokens || 0
}


async function main() {
  const files = readDirectory(argv.dir);
  const initialPrompt = argv.prompt + '\nBelow is my current folder structure:\n```\n' + files.join('\n') + "```"
  const messages: ChatCompletionRequestMessage[] = [
    {role: 'system', content: SYSTEM_PROMPT},
    {role: 'user', content: initialPrompt},
  ];
  const usage = {prompt_tokens: 0, completion_tokens: 0, total_tokens: 0}

  let iter = 0
  while (iter < argv.maxIter) {
    iter += 1
    const response = await getGptResponse(messages, argv.model);
    if (response === undefined) {
      console.log("Something went wrong...")
      break
    }
    updateUsage(usage, response)
    const prefix = chalk.green(`[${iter} / ${argv.maxIter}, tokens ${usage.total_tokens.toLocaleString()}]`)
    messages.push({role: 'assistant', content: response?.value});

    try {
      const parsed = parseResponse(response.value, argv.dir)
      if (parsed.type === "access") {
        // Access
        const res = await confirm(messages[messages.length - 2].content, parsed, prefix, false)
        if (res.confirm) {
          const contents = readFile(parsed.path, true);
          messages.push({role: 'user', content: contents});
        } else {
          messages.push({role: 'user', content: res.comment || "Access request denied"});
        }
      } else if (parsed.type === "change") {
        // Change
        printDiff(parsed.diff)
        const res = await confirm(messages[messages.length - 2].content, parsed, prefix, true)
        if (res.confirm) {
          writeFile(parsed.path, parsed.content)
          messages.push({role: 'user', content: "File updated"});
        } else {
          messages.push({role: 'user', content: res.comment || "Update request denied"});
        }
      } else if (parsed.type === "create") {
        // Create
        process.stdout.write(chalk.green(parsed.content));
        process.stdout.write("\n")
        const res = await confirm(messages[messages.length - 2].content, parsed, prefix, true)
        if (res.confirm) {
          createFile(parsed.path, parsed.content)
          messages.push({role: 'user', content: "File created"});
        } else {
          messages.push({role: 'user', content: res.comment || "Create request denied"});
        }
      } else if (parsed.type === "delete") {
        // Delete
        const res = await confirm(messages[messages.length - 2].content, parsed, prefix, true)

        if (res.confirm) {
          deleteFile(parsed.path)
          messages.push({role: 'user', content: "File created"});
        } else {
          messages.push({role: 'user', content: res.comment || "Delete request denied"});
        }
      } else if (parsed.type === "follow-up") {
        // Follow-up
        await askQuestion(parsed, prefix).then(content => {
          messages.push({role: 'user', content});
        })
      } else if (parsed.type === "complete") {
        // Complete
        iter = argv.maxIter
        break
      }
    } catch (e: unknown) {
      console.log(response)
      console.log(e)
      messages.push({
        role: "user",
        content: `${(e as Error).message}. Please make sure to responses are restricted to those listed in the system prompt: ${SYSTEM_PROMPT}`
      })
    }
  }

  rl.close();
}


main()
  .then(() => console.log("All done!"))
  .catch(e => console.log(e));
