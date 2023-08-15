import {getGptResponse, parseResponseMulti} from '../gpt';
import {ChatCompletionRequestMessage} from 'openai/api';
import fs from "fs";
import {ParsedResponse} from "../types";

jest.mock("fs")

jest.mock('openai', () => ({
  OpenAIApi: jest.fn().mockImplementation(() => ({
    createChatCompletion: jest.fn().mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content: "Test response",
            },
          },
        ],
      },
    }),
  })),
  Configuration: jest.fn(),
}));

jest.mock('../file', () => ({
    ...jest.requireActual('../file'),
    readDirectory: jest.fn().mockReturnValue(['test.txt'])
  }
))

describe('GPT functions', () => {
  test('getGptResponse is correctly mocked', async () => {
    const messages: ChatCompletionRequestMessage[] = [
      {role: 'system', content: 'You are a helpful assistant.'},
      {role: 'user', content: 'Hello, assistant!'},
    ];
    const model = 'gpt-3.5-turbo';

    const response = await getGptResponse(messages, model);

    expect(response?.choices?.[0].message!.content as string).toBe('Test response');
  });

  test('parseResponse requests access to files that exist', () => {
    const response = 'ACCESS test.txt';
    const projectDir = '.';

    const parsed = parseResponseMulti(response, projectDir);

    expect(parsed).toEqual([{type: 'access', raw: "ACCESS test.txt", path: 'test.txt'}]);
  });

  test("parseResponse throws for files that don't exist", () => {
    const response = 'ACCESS ./does-not-exist.txt';
    const projectDir = '.';

    expect(() => parseResponseMulti(response, projectDir)).toThrow("File ./does-not-exist.txt does not exist")
  });

  describe("parseResponse CHANGE", () => {
    (fs.readdirSync as jest.Mock).mockReturnValue([
      {name: 'test.txt', isDirectory: () => false, isFile: () => true},
    ]);
    (fs.readFileSync as jest.Mock).mockReturnValue("const foo = 2\n")

    const response = 'REPLACE 0-0 test.txt\n' +
      '```typescript\n' +
      'const foo = 3\n' +
      '```\n';
    const responseWeirdLanguage = 'REPLACE 0-0 test.txt\n' +
      '```ABC-DEF GHI!@#$%^&*()\n' +
      'const foo = 3\n' +
      '```\n';
    const responseNoLanguage = 'REPLACE 0-0 test.txt\n' +
      '```\n' +
      'const foo = 3\n' +
      '```\n';

    const projectDir = '.';

    const expected = {
      type: "change",
      path: "test.txt",
      content: "const foo = 3",
      raw: response,
      end: 0,
      start: 0,
    }


    it("correctly parses a response with a language", () => {
      const m = parseResponseMulti(response, projectDir)
      expect(m).toEqual([expected])
    })
    it("correctly parses a response with a weird language", () => {
      const expectedWeirdLanguage = {...expected, raw: responseWeirdLanguage}
      expect(parseResponseMulti(responseWeirdLanguage, projectDir)).toEqual([expectedWeirdLanguage])
    })

    it("correctly parses a response without a language", () => {
      const expectedNoLanguage = {...expected, raw: responseNoLanguage}
      expect(parseResponseMulti(responseNoLanguage, projectDir)).toEqual([expectedNoLanguage])
    })
  });

  describe("parseResponse CREATE", () => {
    (fs.readdirSync as jest.Mock).mockReturnValue([
      {name: 'test.txt', isDirectory: () => false, isFile: () => true},
    ]);
    (fs.readFileSync as jest.Mock).mockReturnValue("const foo = 2")



    it("correctly parses a CREATE with nested triple-ticks", () => {
      const response = 'CREATE README.md\n' +
          '```\n' +
          'This is my README\n\n##Example usage\n```\nnode index.js\n```\n' +
          '```\n'

      const projectDir = '.';

      const expected: ParsedResponse = {
        type: "create",
        path: "README.md",
        content: 'This is my README\n\n##Example usage\n```\nnode index.js\n```',
        raw: response,
      }
      expect(parseResponseMulti(response, projectDir)).toEqual([expected])
    })
  });

  it("correctly parses multiple CREATES", () => {
    const response = 'CREATE README.md\n' +
        '```\n' +
        'This is my README\n' +
        '```\n' +
        '\n' +
        'CREATE index.ts\n' +
        '```\n' +
        'console.log("hello world")\n' +
        '```\n'


    const projectDir = '.';

    const expected: ParsedResponse[] = [
      {
        type: "create",
        path: "README.md",
        content: 'This is my README',
        raw: response,
      },
      {
        type: "create",
        path: "index.ts",
        content: 'console.log("hello world")',
        raw: response,
      },
        ]
    expect(parseResponseMulti(response, projectDir)).toEqual(expected)
  })

});
