import {getGptResponse, cleanCode, parseResponse} from '../gpt';
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

  test('cleanCode only keeps the text inside the triple ticks with language name', () => {
    const code = 'const a = 1\n' +
      '\n' +
      '\n' +
      'const b = 2\n' +
      '# here is a comment' +
      '\n' +
      '\n';

    const block = `\`\`\`python\n${code}\n\`\`\``

    const cleaned = cleanCode(block);

    expect(cleaned).toEqual(code);
  });

  test('cleanCode only keeps the text inside the triple ticks without language name', () => {
    const code = 'const a = 1\n' +
      '\n' +
      '\n' +
      'const b = 2\n' +
      '# here is a comment' +
      '\n' +
      '\n';

    const block = `\`\`\`\n${code}\n\`\`\``

    const cleaned = cleanCode(block);

    expect(cleaned).toEqual(code);
  });

  test('parseResponse requests access to files that exist', () => {
    const response = 'ACCESS test.txt';
    const projectDir = '.';

    const parsed = parseResponse(response, projectDir);

    expect(parsed).toEqual({type: 'access', raw: "ACCESS test.txt", path: 'test.txt'});
  });

  test("parseResponse throws for files that don't exist", () => {
    const response = 'ACCESS ./does-not-exist.txt';
    const projectDir = '.';

    expect(() => parseResponse(response, projectDir)).toThrow("File ./does-not-exist.txt does not exist")
  });

  describe("parseResponse", () => {
    (fs.readdirSync as jest.Mock).mockReturnValue([
      {name: 'test.txt', isDirectory: () => false, isFile: () => true},
    ]);
    (fs.readFileSync as jest.Mock).mockReturnValue("const foo = 2")

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
      diff: [
        {
          "added": undefined,
          "count": 1,
          "removed": true,
          "value": "const foo = 2",
        },
        {
          "added": true,
          "count": 1,
          "removed": undefined,
          "value": "const foo = 3",
        },
      ]
    }


    it("correctly parses a response with a language", () => {
      expect(parseResponse(response, projectDir)).toEqual(expected)
    })
    it("correctly parses a response with a weird language", () => {
      const expectedWeirdLanguage = {...expected, raw: responseWeirdLanguage}
      expect(parseResponse(responseWeirdLanguage, projectDir)).toEqual(expectedWeirdLanguage)
    })

    it("correctly parses a response without a language", () => {
      const expectedNoLanguage = {...expected, raw: responseNoLanguage}
      expect(parseResponse(responseNoLanguage, projectDir)).toEqual(expectedNoLanguage)
    })
  });

  describe("parseResponse", () => {
    (fs.readdirSync as jest.Mock).mockReturnValue([
      {name: 'test.txt', isDirectory: () => false, isFile: () => true},
    ]);
    (fs.readFileSync as jest.Mock).mockReturnValue("const foo = 2")



    it("correctly parses a CREATE with nested triple-ticks", () => {
      const response = 'CREATE README.md\n' +
          '```\n' +
          'This is my README\n\n##Example usage\n```\nnode index.js\n```' +
          '```\n'

      const projectDir = '.';

      const expected: ParsedResponse = {
        type: "create",
        path: "README.md",
        content: 'This is my README\n\n##Example usage\n```\nnode index.js\n```',
        raw: response,
      }
      expect(parseResponse(response, projectDir)).toEqual(expected)
    })


    it("ignores text prior to the prompt", () => {
      const response = 'This is how you create a the README\n' +
          'CREATE README.md\n' +
          '```\n' +
          'This is my README\n\n##Example usage\n```\nnode index.js\n```' +
          '```\n'

      const projectDir = '.';

      const expected: ParsedResponse = {
        type: "create",
        path: "README.md",
        content: 'This is my README\n\n##Example usage\n```\nnode index.js\n```',
        raw: response,
      }
      expect(parseResponse(response, projectDir)).toEqual(expected)
    })


  });
});
