#!/usr/bin/env node
import fse from "fs-extra";
import minimist from "minimist";
import {
    BooleanLiteral,
    Definition,
    fnToDot,
    FunctionCall,
    FunctionDefinition,
    nodeToPlain,
    NumberLiteral,
    plainToNode,
    PrimitiveValue,
    Program,
    runProgram
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
    --from-ast              Process JSON AST as a program.
    --parse                 Report any errors and quit.
    --ast                   Produce JSON AST for program.
    --tc                    Perform type-checking and report any errors.
    --print                 Print program.
    --dot                   Given the comma-separated function names, print DOT representation for body.
                            All functions are printed if no value provided.
    --run                   Given the function call statement as an entry point, execute program.
                            Note that only primitive literal values are allowed as an arguments.
`;

const cli = {
    boolean: ["version", "help", "stdin", "from-ast", "parse", "ast", "tc", "print"],
    string: ["dot", "run"],
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

    const program: Program = args["from-ast"]
        ? JSON.parse(contents).map(plainToNode)
        : parseProgram(contents);

    if (args.parse) {
        terminate("Parsing finished successfully");
    }

    if (args.print) {
        terminate(program.map((def) => def.pp()).join("\n"));
    }

    if ("dot" in args) {
        let filter: (def: Definition) => def is FunctionDefinition;

        if (args.dot) {
            const names = (args.dot.includes(",") ? args.dot.split(",") : [args.dot]).map(
                (name: string) => name.trim()
            );

            filter = (def): def is FunctionDefinition =>
                def instanceof FunctionDefinition && names.includes(def.name);
        } else {
            filter = (def): def is FunctionDefinition => def instanceof FunctionDefinition;
        }

        terminate(program.filter(filter).map(fnToDot).join("\n"));
    }

    if (args.ast) {
        terminate(JSON.stringify(program.map(nodeToPlain), undefined, 4));
    }

    if (args.tc) {
        const resolving = new Resolving(program);

        new Typing(program, resolving);

        terminate("Type-checking finished successfully");
    }

    if (args.run) {
        const entryStmt = parseStatement(args.run);

        if (!(entryStmt instanceof FunctionCall)) {
            throw new Error('Option value for "--run" should contain a function call statement');
        }

        const entryPoint = program.find(
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

        const entryArgs = entryStmt.args.map((arg): PrimitiveValue => {
            if (arg instanceof NumberLiteral || arg instanceof BooleanLiteral) {
                return arg.value;
            }

            throw new Error(
                `Only literal values are supported for "--run" option. Received: ${arg.pp()}`
            );
        });

        runProgram(program, entryPoint, entryArgs, new Map(), true, (stmt, state) => {
            console.log(`Exec ${stmt.pp()} in ${state.dump()}`);
        });

        terminate();
    }

    terminate(helpMessage);
})().catch((e) => {
    error(e.message);
});
