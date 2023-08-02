import {readDirectory, createDiff, readFile} from '../file';
import fs from "fs"
import path from 'path';

jest.mock('fs');
jest.mock('path');


(path.join as jest.Mock).mockImplementation((a, b) => `${a}/${b}`)

describe('readDirectory', () => {
  it('should read the directory correctly', () => {
    (fs.readdirSync as jest.Mock).mockReturnValue([
      {name: 'file1.txt', isDirectory: () => false, isFile: () => true},
      {name: 'file2.txt', isDirectory: () => false, isFile: () => true},
    ]);
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue("");

    const result = readDirectory('test-dir');
    expect(result).toEqual(['./file1.txt', './file2.txt']);
  });
});

describe('createDiff', () => {
  it('should create correct diff', () => {
    const file1Content = 'This is a test file';
    (fs.readFileSync as jest.Mock).mockReturnValue(file1Content);

    const diff = createDiff('file.txt', 'This is another test file');

    expect(diff.length).toBe(2);
    expect(diff.find(d => d.added)?.value === "This is another test file")
    expect(diff.find(d => d.removed)?.value === "This is a test file")
  });
});

describe('readFile', () => {
  it('returns the content of files', () => {
    const file1Content = 'This is a test file\nThis is the next line';
    const expected = file1Content;
    (fs.readFileSync as jest.Mock).mockReturnValue(file1Content);

    const response = readFile("path")
    expect(response).toEqual(expected)
  });
  it('returns the content of files with line numbers starting at zero', () => {
    const file1Content = 'This is a test file\nThis is the next line';
    const expected = '0  This is a test file\n1  This is the next line';
    (fs.readFileSync as jest.Mock).mockReturnValue(file1Content);

    const response = readFile("path", true)
    expect(response).toEqual(expected)
  });
});
