// gpt.ts

import {Configuration, OpenAIApi} from 'openai';
import {ChatCompletionRequestMessage} from "openai/api";
import dotenv from "dotenv"
import {readDirectory, readFile} from './file';
import {
    ParsedResponse,
    RequestAccess,
    RequestChange,
    RequestComplete,
    RequestCreate,
    RequestDelete,
    RequestFollowup,
    RequestResponse
} from "./types";


dotenv.config()

const startToken = "<<<--start-->>"
const endToken = "<<<--end-->>"

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

export async function getGptResponse(messages: ChatCompletionRequestMessage[], model: string): Promise<RequestResponse | undefined> {
    const chatCompletion = await openai.createChatCompletion({
        model,
        messages,
    });

    const value = chatCompletion?.data?.choices?.[0].message?.content || "No response";
    return {...chatCompletion.data, value}
}


const accessRegex = /ACCESS (.+)\n?/gm;
const createRegex = /CREATE\s+(.+?)\n<<<--start-->>\n?(.*?)\n?<<<--end-->>/gs;
const replaceRegex = /REPLACE\s+([0-9]+)-([0-9]+)\s+(.+?)\n<<<--start-->>\n?(.*?)\n?<<<--end-->>/gs;
const deleteRegex = /DELETE (.+)\n?/gm
const followupRegex = /FOLLOWUP (.+)?/gs
const completeRegex = /^COMPLETE$/g

export function parseResponseMulti(response: string, projectDir: string): ParsedResponse[] {
    const files = new Set(readDirectory(projectDir));
    const parsedResponses: ParsedResponse[] = [];
    parsedResponses.push(...parseAccess(response, files))
    parsedResponses.push(...parseCreate(response, files))
    parsedResponses.push(...parseChange(response, files))
    parsedResponses.push(...parseDelete(response, files))
    parsedResponses.push(...parseFollowup(response))
    parsedResponses.push(...parseComplete(response))

    return parsedResponses;
}

const parseChange = (response: string, files: Set<string>): RequestChange[] => {
    const parsed: RequestChange[] = []
    const cleanResponse = replaceOuterCodeBlocks(response)
    const replaceMatches = cleanResponse.matchAll(replaceRegex);

    for (const match of replaceMatches) {
        const [start, end, path, content] = match.slice(1, 6);
        const startNum = Number(start);
        const endNum = Number(end);

        if (!files.has(path)) {
            throw new Error(`File ${path} does not exist`);
        }
        if (Number.isNaN(startNum) || Number.isNaN(endNum)) {
            throw new Error("Invalid line numbers");
        }

        const orig = readFile(path, false);
        const origByLine = orig.split("\n");
        const updated = (origByLine.slice(0, startNum).concat(content).concat(origByLine.slice(endNum + 1))).join("\n");

        parsed.push({
            type: 'change',
            path,
            content: updated,
            raw: response,
            start: startNum,
            end: endNum,
        });
    }
    return parsed
}

const parseCreate = (response: string, files: Set<string>): RequestCreate[] => {
    const parsed: RequestCreate[] = []

    const cleanResponse = replaceOuterCodeBlocks(response)
    const createMatches = cleanResponse.matchAll(createRegex);
    for (const match of createMatches) {
        const [path, content] = match.slice(1, 4);
        if (files.has(path)) {
            throw new Error(`File ${path} already exists`);
        }

        parsed.push({type: 'create', path, content, raw: response})
    }
    return parsed;
}


const parseAccess = (response: string, files: Set<string>): RequestAccess[] => {
    const parsed: RequestAccess[] = []

    const accessMatch = response.matchAll(accessRegex);
    for (const match of accessMatch) {
        const path = match[1];
        if (!files.has(path)) {
            throw new Error(`File ${path} does not exist`);
        }
        parsed.push({type: 'access', path, raw: response})
    }

    return parsed
}


const parseDelete = (response: string, files: Set<string>): RequestDelete[] => {
    const parsed: RequestDelete[] = []

    const deleteMatch = response.matchAll(deleteRegex);
    for (const match of deleteMatch) {
        const path = match[1];
        if (!files.has(path)) {
            throw new Error(`File ${path} does not exist`);
        }
        parsed.push({type: 'delete', path, raw: response})
    }

    return parsed
}

const parseFollowup = (response: string): RequestFollowup[] => {
    const parsed: RequestFollowup[] = []

    const followupMatch = response.matchAll(followupRegex);
    for (const match of followupMatch) {
        const content = match[1];
        parsed.push({type: 'follow-up', content, raw: response})
    }
    return parsed
}

const parseComplete = (response: string): RequestComplete[] => {
    const parsed: RequestComplete[] = []
    const completeMatch = response.matchAll(completeRegex);
    for (const match of completeMatch) {
        parsed.push({type: 'complete', raw: response})
    }
    return parsed
}


const replaceOuterCodeBlocks = (input: string) => {
    const lines = input.replace(/\n+$/, '').split('\n');
    let inCodeBlock = false;

    // The commands that indicate a new request
    const requestCommands = ["ACCESS", "REPLACE", "FOLLOWUP", "CREATE", "DELETE", "COMPLETE"];

    // Helper function to check if a line starts with one of the request commands
    const isRequestCommand = (line: string) => requestCommands.some(cmd => line.startsWith(cmd));

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('```')) {
            if (!inCodeBlock) {
                inCodeBlock = true;
                lines[i] = startToken;
            } else {
                let nextLineIsCommand = false;

                // Look for the next non-empty line that starts with a request command
                for (let j = i + 1; j < lines.length; j++) {
                    if (lines[j].trim() !== '') {
                        nextLineIsCommand = isRequestCommand(lines[j]);
                        break;
                    }
                }

                if (nextLineIsCommand || i === lines.length - 1) {
                    inCodeBlock = false;
                    lines[i] = endToken;
                }
            }
        }
    }

    // Add closing token if code block was not properly closed
    if (inCodeBlock) {
        lines.push(endToken);
    }

    return lines.join('\n');
};
