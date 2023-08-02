// file.ts

import path from 'path';
import ignore from 'ignore';
import fs from 'fs';
import {Change, diffLines} from "diff"
import chalk from "chalk";

export function readFile(path: string, lineNums = false) {
  const fileContents = fs.readFileSync(path, 'utf-8');
  if (lineNums) {
    return fileContents.split('\n').map((line, index) => `${index}  ${line}`).join('\n');
  } else {
    return fileContents
  }
}


export function writeFile(path: string, contents: string) {
  fs.writeFileSync(path, contents);
}

export function createFile(filePath: string, content: string): void {
  // Ensure the directory exists
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  // Write the content to the file
  fs.writeFileSync(filePath, content);
}

export function deleteFile(filePath: string): void {
  // Delete the file
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  } else {
    throw new Error(`File ${filePath} does not exist`);
  }
}



export function readDirectory(dir: string, prefix = '.'): string[] {
  const ig = ignore();
  const gitignorePath = path.join(dir, '.gitignore');

  // If a .gitignore file exists, read it and add the rules to the ignore object.
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath).toString();
    ig.add(gitignore);
  }

  // Read the directory and filter out ignored files.
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files: string[] = [];
  for (const entry of entries) {
    const relativePath = path.join(prefix, entry.name);
    if (!ig.ignores(relativePath) && !relativePath.startsWith(".git")) {
      if (entry.isDirectory()) {
        files = files.concat(readDirectory(path.join(dir, entry.name), relativePath));
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  }

  return files;
}

export const createDiff = (file1: string, content2: string): Change[] => {
  const content1 = fs.readFileSync(file1, 'utf8');
  return diffLines(content1, content2);
}

export const printDiff = (diff: Change[]) => {
  for (const part of diff) {
    // if the part is added, color it green
    if (part.added) {
      process.stdout.write(chalk.green(part.value));
    }
    // if the part is removed, color it red
    else if (part.removed) {
      process.stdout.write(chalk.red(part.value));
    }
    // for unchanged parts, print normally
    else {
      process.stdout.write(part.value);
    }
  }
}