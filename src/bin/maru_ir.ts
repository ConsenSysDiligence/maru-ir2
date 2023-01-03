#!/usr/bin/env node
import fse from "fs-extra";
import minimist from "minimist";
import { parseProgram } from "../parser";
import { Resolving, Typing } from "../passes";

const cli = {
    boolean: ["version", "help", "stdin"],
    string: [],
    default: {}
};

(async () => {
    const args = minimist(process.argv.slice(2), cli);

    if (args.version) {
        const { version } = require("../../package.json");

        console.log(version);
    } else if (args.help || (!args._.length && !args.stdin)) {
        const message = `Utility for working with maruir files.
USAGE:
$ maru-ir <filename>

OPTIONS:
    --help                  Print help message.
    --version               Print package version.
    --stdin                 Read input from STDIN instead of file.
`;

        console.log(message);
    } else {
        let fileName: string;
        let contents: string;

        if (args.stdin) {
            fileName = "stdin";
            contents = await fse.readFile(process.stdin.fd, { encoding: "utf-8" });
        } else {
            fileName = args._[0];
            contents = fse.readFileSync(fileName, { encoding: "utf-8" });
        }

        const defs = parseProgram(contents);

        const resolving = new Resolving(defs);

        new Typing(defs, resolving);

        console.log(defs.map((def) => def.pp()).join("\n"));
    }
})().catch((e) => {
    console.log(e.message);

    process.exit(1);
});
