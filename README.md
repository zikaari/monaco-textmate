> This repository is a heavily modified version of original `vscode-textmate` package. It's been adjusted here and there to run inside web browsers. All of the file system calls have been removed, most of the API now uses `Promises` and grammars can no longer be loaded synchronously.

⚠ I'd prefer to see this repository where it really belongs. I request anyone from Microsoft to adopt this package as soon as possible.

# Monaco TextMate

An interpreter for grammar files as defined by TextMate that runs on the web. Supports loading grammar files from JSON or PLIST format. Cross - grammar injections are currently not supported.

## Installing

```sh
npm install monaco-textmate
```

## Using

`monaco-textmate` relies on `onigasm` package to provide `oniguruma` regex engine in browsers. `onigasm` itself relies on `WebAssembly`. Therefore to
get `monaco-textmate` working in your browser, it must have `WebAssembly` support and `onigasm` loaded and ready-to-go.

Make sure the example code below runs *after* `onigasm` bootstraping sequence described [here](https://www.npmjs.com/package/onigasm#light-it-up) has finished.

> Example below is just a demostration of available API. To wire it up with `monaco-editor` use [`monaco-editor-textmate`](https://github.com/NeekSandhu/monaco-editor-textmate).

```javascript
import { Registry } from 'monaco-textmate'

(async function test() {
    const registry = new Registry({
        // Since we're in browser, `getFilePath` has been removed, therefore you must provide `getGrammarDefinition` hook for things to work
        getGrammarDefinition: async (scopeName) => {
            // Whenever `Registry.loadGrammar` is called first time per scope name, this function will be called asking you to provide
            // raw grammar definition. Both JSON and plist formats are accepted.
            if (scopeName === 'source.css') {
                return {
                    format: 'json', // can also be `plist`
                    content: await (await fetch(`static/grammars/css.tmGrammar.json`)).text() // when format is 'json', parsed JSON also works
                }
            }
        }
    })

    const grammar = await registry.loadGrammar('source.css')

    console.log(grammar.tokenizeLine('html, body { height: 100%; margin: 0 }'))
    // > {tokens: Array(19), ruleStack: StackElement}
})()

```

> `onigasm` is peer dependency that you must install yourself

## Tokenizing multiple lines

To tokenize multiple lines, you must pass in the previous returned `ruleStack`.

```javascript
var ruleStack = null;
for (var i = 0; i < lines.length; i++) {
	var r = grammar.tokenizeLine(lines[i], ruleStack);
	console.log('Line: #' + i + ', tokens: ' + r.tokens);
	ruleStack = r.ruleStack;
}
```

## API doc

See [the main.ts file](./src/main.ts)

## Developing

* Clone the repository
* Run `npm install`
* Compile in the background with `npm run watch`

## Credits
99% of the code in this repository is extracted straight from [`vscode-textmate`](https://github.com/Microsoft/vscode-textmate), which is MIT licensed.
Other external licenses used can be found in [`ThirdPartyNotices.txt`](https://github.com/NeekSandhu/monaco-textmate/blob/master/ThirdPartyNotices.txt)

## License
[MIT](https://github.com/Microsoft/vscode-textmate/blob/master/LICENSE.md)
