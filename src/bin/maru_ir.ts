#!/usr/bin/env node
import fse from "fs-extra";
import minimist from "minimist";
import {
    BooleanLiteral,
    FunctionCall,
    FunctionDefinition,
    NumberLiteral,
    PrimitiveValue,
    State,
    StatementExecutor,
    nodeToPlain
} from "..";
import { parseProgram } from "../parser";
import { parseStatement } from "../parser/maruir_parser";
import { Resolving, Typing } from "../passes";

const helpMessage = `Utility for working with maruir files.
USAGE:

$ maru-ir <filename>

OPTIONS:
    --help                  Print help message.
    --version               Print package version.
    --stdin                 Read input from STDIN instead of file.
    --parse                 Parse source and report any errors.
    --ast                   Produce JSON AST for parsed source.
    --tc                    Perform type-checking for parsed source and report any errors.
    --print                 Print parsed source back.
    --run                   Given the function call statement as an entry point, execute program.
                            Note that only primitive literal values are allowed as an arguments.
`;

const cli = {
    boolean: ["version", "help", "stdin", "parse", "ast", "tc", "print"],
    string: ["run"],
    default: {}
};

function terminate(message?: string, exitCode = 0): never {
    if (message !== undefined) {
        if (exitCode === 0) {
            console.log(message);
        } else {
            console.error(message);
        }
    }

    process.exit(exitCode);
}

function error(message: string): never {
    terminate(message, 1);
}

(async () => {
    const args = minimist(process.argv.slice(2), cli);

    if (args.version) {
        const { version } = require("../../package.json");

        terminate(version);
    }

    if (args.help) {
        terminate(helpMessage);
    }

    let fileName: string;
    let contents: string;

    if (args.stdin) {
        fileName = "stdin";
        contents = await fse.readFile(process.stdin.fd, { encoding: "utf-8" });
    } else {
        if (args._.length !== 1) {
            throw new Error("Specify single file name to process");
        }

        fileName = args._[0];
        contents = await fse.readFile(fileName, { encoding: "utf-8" });
    }

    const defs = parseProgram(contents);

    if (args.parse) {
        terminate("Parsing finished successfully");
    }

    if (args.print) {
        terminate(defs.map((def) => def.pp()).join("\n"));
    }

    if (args.ast) {
        terminate(JSON.stringify(defs.map(nodeToPlain), undefined, 4));
    }

    const resolving = new Resolving(defs);
    const typing = new Typing(defs, resolving);

    if (args.tc) {
        terminate("Type-checking finished successfully");
    }

    if (args.run) {
        const entryStmt = parseStatement(args.run);

        if (!(entryStmt instanceof FunctionCall)) {
            throw new Error('Option value for "--run" should contain a function call statement');
        }

        const entryPoint = defs.find(
            (def) => def instanceof FunctionDefinition && def.name === entryStmt.callee.name
        );

        if (!(entryPoint instanceof FunctionDefinition)) {
            throw new Error(`Found no functions matching name "${entryStmt.callee.name}"`);
        }

        if (entryPoint.parameters.length !== entryStmt.args.length) {
            throw new Error(
                `Parameters cound mismatch: expected ${entryPoint.parameters.length}, received ${entryStmt.args.length}`
            );
        }

        const entryArgs: PrimitiveValue[] = entryStmt.args.map((arg) => {
            if (arg instanceof NumberLiteral || arg instanceof BooleanLiteral) {
                return arg.value;
            }

            throw new Error(
                `Only literal values are supported for "--run" option. Received: ${arg.pp()}`
            );
        });

        const state = new State(defs, entryPoint, entryArgs, [], true, new Map());
        const engine = new StatementExecutor(resolving, typing, state);

        while (state.running) {
            const stmt = state.curFrame.curBB.statements[state.curFrame.curBBInd];

            console.log(`Exec ${stmt.pp()} in ${state.dump()}`);

            engine.execStatement(stmt);
        }

        terminate();
    }

    terminate(helpMessage);
})().catch((e) => {
    error(e.message);
});
