#!/usr/bin/env node
import minimist from "minimist";
import { parseProgram } from "../parser";
import { Resolving, Typing } from "../passes";
const fse = require("fs-extra");

const cli = {
    boolean: ["version", "help", "stdin"],
    string: [],
    default: {}
};

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
`;

    console.log(message);
}

const fileName = args._[0];

const contents = fse.readFileSync(fileName, { encoding: "utf-8" });
const defs = parseProgram(contents);

const resolving = new Resolving(defs);
new Typing(defs, resolving);

console.log(defs.map((x: any) => x.pp()).join("\n"));
