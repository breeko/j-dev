#!/usr/bin/env node
import yargs from 'yargs/yargs';
import {hideBin} from 'yargs/helpers';
import {getGptResponse, parseResponseMulti} from './gpt';
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

async function confirm(props: {
    repeat?: () => void,
    request: string | undefined,
    response: RequestChange | RequestCreate | RequestDelete | RequestAccess,
    prefix: string,
    strict: boolean
}
): Promise<{
    confirm: boolean,
    comment: string | undefined
}> {
    const {repeat, request, response, prefix, strict} = props
    const prompt = `${prefix} Do you want to ${response.type} file ${response.path}? (y)es, (n)o, (c)omment, (v)iew response or view (r)equest `
    if (!strict && argv.y) {
        return {confirm: true, comment: undefined};
    }
    repeat?.()
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
                } else if (lowerCaseAnswer === "?" && repeat) {
                    repeat()
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
    const initialPrompt = argv.prompt + '\nBelow is my current folder structure:\n```\n' + files.join('\n') + "\n```"
    const messages: ChatCompletionRequestMessage[] = [
        {role: 'system', content: SYSTEM_PROMPT},
        {role: 'user', content: initialPrompt},
    ];
    const usage = {prompt_tokens: 0, completion_tokens: 0, total_tokens: 0}

    let iter = 0
    while (iter < argv.maxIter) {
        iter += 1
        const response = await getGptResponse(messages, argv.model).catch(e => {
            // console.log(messages)
            console.log(JSON.stringify(e))
        });
        if (response === undefined) {
            iter = argv.maxIter
            console.log("Something went wrong...")
            break
        }
        updateUsage(usage, response)
        const prefix = chalk.magentaBright(`[${iter} / ${argv.maxIter}, tokens ${usage.total_tokens.toLocaleString()}]`)
        messages.push({role: 'assistant', content: response?.value});

        try {
            const parsedResponses = parseResponseMulti(response.value, argv.dir)
            const priorMessage = messages[messages.length - 2]
            for (const parsed of parsedResponses) {
                if (parsed.type === "access") {
                    // Access
                    const res = await confirm({
                        request: priorMessage.content,
                        response: parsed,
                        prefix,
                        strict: false
                    })
                    if (res.confirm) {
                        const contents = readFile(parsed.path, true);
                        messages.push({role: 'user', content: contents});
                    } else {
                        messages.push({
                            role: 'user',
                            content: `[${parsed.path}] ${res.comment || "Access denied"}`
                        });
                    }
                } else if (parsed.type === "change") {
                    // Change
                    const res = await confirm({
                        repeat: () => printDiff(parsed.path, parsed.content),
                        request: priorMessage.content,
                        response: parsed,
                        prefix,
                        strict: true
                    })
                    const responsePrefix = `[${parsed.path} ${parsed.start}-${parsed.end}]`
                    if (res.confirm) {
                        writeFile(parsed.path, parsed.content)
                        messages.push({role: 'user', content: `${responsePrefix} File updated`});
                    } else {
                        messages.push({
                            role: 'user',
                            content: `${responsePrefix} ${res.comment || "Update request denied"}`
                        });
                    }
                } else if (parsed.type === "create") {
                    // Create
                    const responsePrefix = `[${parsed.path}]`
                    const res = await confirm({
                        repeat: () => console.log(chalk.green(parsed.content)),
                        request: priorMessage.content,
                        response: parsed,
                        prefix,
                        strict: true
                    })
                    if (res.confirm) {
                        createFile(parsed.path, parsed.content)
                        messages.push({role: 'user', content: `${responsePrefix} File created`});
                    } else {
                        messages.push({
                            role: 'user',
                            content: `${responsePrefix} ${res.comment || "Create request denied"}`
                        });
                    }
                } else if (parsed.type === "delete") {
                    // Delete
                    const res = await confirm({
                        request: priorMessage.content,
                        response: parsed,
                        prefix,
                        strict: true
                    })
                    const responsePrefix = `[${parsed.path}]`


                    if (res.confirm) {
                        deleteFile(parsed.path)
                        messages.push({role: 'user', content: `${responsePrefix} File deleted`});
                    } else {
                        messages.push({
                            role: 'user',
                            content: `${responsePrefix} ${res.comment || "Delete request denied"}`
                        });
                    }
                } else if (parsed.type === "follow-up") {
                    // Follow-up
                    await askQuestion(parsed, "").then(content => {
                        messages.push({role: 'user', content});
                    })
                } else if (parsed.type === "complete") {
                    // Complete
                    iter = argv.maxIter
                    break
                }
            }
        } catch (e: unknown) {
            console.log(`${prefix} Invalid response`)
            messages.push({
                role: "user",
                content: `${(e as Error).message}. Please make sure responses are restricted to those listed in the system prompt`
            })
        }
    }

    rl.close();
}


main()
    .then(() => console.log("All done!"))
    .catch(e => console.log(e));
