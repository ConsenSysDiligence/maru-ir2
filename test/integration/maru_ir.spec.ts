import { spawn } from "child_process";
import expect from "expect";
import fse from "fs-extra";

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
                            Note that only primitive literal values are allowed as an arguments.`;

const cases: Array<
    [string[], string | undefined, number, string | RegExp | undefined, string | RegExp | undefined]
> = [
    [["--version"], undefined, 0, /^\d+\.\d+\.\d+$/, undefined],
    [["--help"], undefined, 0, helpMessage, undefined],
    [["test/samples/valid/fun.maruir"], undefined, 0, helpMessage, undefined],
    [["--print"], undefined, 1, undefined, "Specify single file name to process"],
    [
        ["--stdin", "--parse"],
        fse.readFileSync("test/samples/valid/fun.maruir", { encoding: "utf-8" }),
        0,
        "Parsing finished successfully",
        undefined
    ],
    [
        ["test/samples/valid/fun.maruir", "--print"],
        undefined,
        0,
        `fun foo() {
entry:
    return ;
}`,
        undefined
    ],
    [
        ["test/samples/valid/fun.maruir", "--dot"],
        undefined,
        0,
        `digraph foo {
  entry [label="return ;",style=filled,color=lightblue1,shape="box", xlabel="entry"];
}`,
        undefined
    ],
    [
        ["test/samples/valid/fun.maruir", "--tc"],
        undefined,
        0,
        "Type-checking finished successfully",
        undefined
    ],
    [
        ["test/samples/valid/trans_call.maruir", "--ast"],
        undefined,
        0,
        fse.readFileSync("test/samples/valid/trans_call.ast.json", { encoding: "utf-8" }).trimEnd(),
        undefined
    ],
    [
        ["test/samples/valid/trans_call.maruir", "--run", "abort;"],
        undefined,
        1,
        undefined,
        'Option value for "--run" should contain a function call statement'
    ],
    [
        ["test/samples/valid/trans_call.maruir", "--run", "call missing();"],
        undefined,
        1,
        undefined,
        'Found no functions matching name "missing"'
    ],
    [
        ["test/samples/valid/trans_call.maruir", "--run", "call main(0_i8);"],
        undefined,
        1,
        undefined,
        "Parameters cound mismatch: expected 0, received 1"
    ],
    [
        ["test/samples/valid/trans_call.maruir", "--run", "call gauss(i32(0_i8));"],
        undefined,
        1,
        undefined,
        'Only literal values are supported for "--run" option. Received: i32(0_i8)'
    ],
    [
        ["test/samples/valid/trans_call.ast.json", "--from-ast", "--run", "call gauss(5_i32);"],
        undefined,
        0,
        fse
            .readFileSync("test/samples/valid/trans_call.gauss.log", { encoding: "utf-8" })
            .trimEnd(),
        undefined
    ],
    [
        ["test/samples/valid/trans_call.maruir", "--run", "call gauss(5_i32);"],
        undefined,
        0,
        fse
            .readFileSync("test/samples/valid/trans_call.gauss.log", { encoding: "utf-8" })
            .trimEnd(),
        undefined
    ],
    [
        ["test/samples/valid/trans_call.maruir", "--dot", "gauss"],
        undefined,
        0,
        fse
            .readFileSync("test/samples/valid/trans_call.gauss.dot", { encoding: "utf-8" })
            .trimEnd(),
        undefined
    ],
    [
        ["path/to/nowhere"],
        undefined,
        1,
        undefined,
        "ENOENT: no such file or directory, open 'path/to/nowhere'"
    ]
];

function composeCommand(params: string[], stdIn?: string): string {
    let command = "maru-ir";

    if (params.length) {
        command += " " + params.join(" ");
    }

    if (stdIn === undefined) {
        return command;
    }

    return "echo '" + stdIn + "' | " + command;
}

for (const [args, stdIn, expectedExitCode, expectedStdOut, expectedStdErr] of cases) {
    describe(composeCommand(args, stdIn), () => {
        let exitCode: number | null;
        let stdOut = "";
        let stdErr = "";

        before((done) => {
            const proc = spawn("maru-ir", args);

            if (stdIn) {
                proc.stdin.write(stdIn);
            }

            proc.stdout.on("data", (data) => {
                stdOut += data.toString();
            });

            proc.stderr.on("data", (data) => {
                stdErr += data.toString();
            });

            proc.on("exit", (code) => {
                exitCode = code;

                stdOut = stdOut.trimEnd();
                stdErr = stdErr.trimEnd();

                done();
            });
        });

        it("exitCode is correct", () => {
            expect(exitCode).toEqual(expectedExitCode);
        });

        it("stdOut is correct", () => {
            if (expectedStdOut === undefined) {
                expect(stdOut).toEqual("");
            } else if (expectedStdOut instanceof RegExp) {
                expect(stdOut).toMatch(expectedStdOut);
            } else {
                expect(stdOut).toEqual(expectedStdOut);
            }
        });

        it("stdErr is correct", () => {
            if (expectedStdErr === undefined) {
                expect(stdErr).toEqual("");
            } else if (expectedStdErr instanceof RegExp) {
                expect(stdErr).toMatch(expectedStdErr);
            } else {
                expect(stdErr).toEqual(expectedStdErr);
            }
        });
    });
}
