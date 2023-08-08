// gpt.ts

import {Configuration, OpenAIApi} from 'openai';
import {ChatCompletionRequestMessage} from "openai/api";
import dotenv from "dotenv"
import {createDiff, readDirectory, readFile} from './file';
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
  return {...chatCompletion.data, value }
}


export function cleanCode(content: string): string {

  const match = content.match(/```[\s\S]*?```/g);
  if (!match) {
    throw new Error('No code block found');
  }
  return content
    .replace(/(.*\n?)```.*?\n/, '')
    .split("")
    .reverse()
    .join("")
    .replace(/\n?```.*?\n?/, '')
    .split("")
    .reverse()
    .join("")
}


const accessRegex = new RegExp("ACCESS (.+)\\n?", "gm");
const createRegex = new RegExp("CREATE (.+?)\\n+```(.*?\\n?)([\\s\\S]+?)\\n```(?=\\n(CREATE|REPLACE|ACCESS|DELETE|FOLLOWUP|COMPLETE|$))", "gm");
const replaceRegex = new RegExp("REPLACE ([0-9]+)-([0-9]+) (.+?)\\n?```(.*?)\\n([\\s\\S]+?)\\n?```", "gm");
const deleteRegex = new RegExp("DELETE (.+)", "gm");
const followupRegex = RegExp("FOLLOWUP (.+)", "gs");
const completeRegex = RegExp("^COMPLETE$", "g");

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
  const replaceMatches = response.matchAll(replaceRegex);

  for (const match of replaceMatches) {
    const [start, end, path, , content] = match.slice(1, 6);
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

    const diff = createDiff(path, updated);
    parsed.push({
      type: 'change',
      path,
      content: updated,
      diff,
      raw: response,
      start: startNum,
      end: endNum,
    });
  }
  return parsed
}

const parseCreate = (response: string, files: Set<string>): RequestCreate[] => {
  const parsed: RequestCreate[] = []

  const createMatches = response.matchAll(createRegex);
  for (const match of createMatches) {
    const [path, ,content] = match.slice(1, 4);
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

export function parseResponse(response: string, projectDir: string): ParsedResponse {
  const files = new Set(readDirectory(projectDir));

  const accessMatchRegex = new RegExp("ACCESS (.+?)\\n?$", "g");
  const accessMatch = accessMatchRegex.exec(response);
  if (accessMatch) {
    const path = accessMatch[1];
    if (!files.has(path)) {
      throw new Error(`File ${path} does not exist`);
    }
    return {type: 'access', path, raw: response};
  }

  const myRegexp = new RegExp("^REPLACE ([0-9]+)-([0-9]+) (.+?)\\n+```(.*?\\n)([\\s\\S]+)```\\n?$", "g");
  const changeMatch = myRegexp.exec(response);
  if (changeMatch) {
    // Change
    const [start, end, path] = changeMatch.slice(1,4);
    const startNum = Number(start)
    const endNum = Number(end)

    if (!files.has(path)) {
      throw new Error(`File ${path} does not exist`);
    }
    if (Number.isNaN(startNum) || Number.isNaN(endNum) ) {
      throw new Error("Invalid line numbers")
    }

    const orig = readFile(path, false)
    const content = cleanCode(response);

    const origByLine = orig.split("\n")
    const updated = origByLine.slice(0, Number(start)).concat(content).concat(origByLine.slice(Number(end) + 1)).join("\n")

    const diff = createDiff(path, updated)
    return {type: 'change', path, start: startNum, end: endNum, content: updated, diff, raw: response};
  }

  if (response.startsWith("FOLLOWUP")) {
    // Follow-up
    const content = response.replace(/FOLLOWUP /, "");
    return {type: 'follow-up', content, raw: response};
  }

  const createMatch = response.match(/^CREATE (.+?)\n+```(.*?\n)([\s\S]+)```$/m);
  if (createMatch) {
    // Create
    const path = createMatch[1];
    const content = cleanCode(response);
    if (files.has(path)) {
      throw new Error(`File ${path} already exists`);
    }
    return {type: 'create', path, content, raw: response};
  }

  const deleteMatch = response.match(/DELETE (.+)$/m);
  if (deleteMatch) {
    // Delete
    const path = deleteMatch[1];
    if (!files.has(path)) {
      throw new Error(`File ${path} does not exist`);
    }
    return {type: 'delete', path, raw: response};
  }

  if (response === 'COMPLETE') {
    return {type: 'complete', raw: response};
  }

  throw new Error('Invalid response format');
}

