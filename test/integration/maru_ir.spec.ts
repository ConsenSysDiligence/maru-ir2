import { spawn } from "child_process";
import expect from "expect";
import fse from "fs-extra";

const cases: Array<
    [string[], string | undefined, number, string | RegExp | undefined, string | RegExp | undefined]
> = [
    [["--version"], undefined, 0, /^\d+\.\d+\.\d+\s*$/, undefined],
    [
        ["--help"],
        undefined,
        0,
        `Utility for working with maruir files.
USAGE:
$ maru-ir <filename>

OPTIONS:
    --help                  Print help message.
    --version               Print package version.
    --stdin                 Read input from STDIN instead of file.

`,
        undefined
    ],
    [
        ["--stdin"],
        fse.readFileSync("test/samples/valid/fun.maruir", { encoding: "utf-8" }),
        0,
        `fun foo() {
entry:
    return ;
}
`,
        undefined
    ],
    [
        ["test/samples/valid/fun.maruir"],
        undefined,
        0,
        `fun foo() {
entry:
    return ;
}
`,
        undefined
    ],
    [
        ["path/to/nowhere"],
        undefined,
        1,
        `ENOENT: no such file or directory, open 'path/to/nowhere'
`,
        undefined
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
