import expect from "expect";
import fse from "fs-extra";
import {
    BuiltinFun,
    FunctionDefinition,
    InterpInternalError,
    LiteralEvaluator,
    Memory,
    Monomorphize,
    parseProgram,
    poison,
    Resolving,
    runProgram,
    State,
    StatementExecutor,
    Typing
} from "../src";
import { searchRecursive } from "./utils";

function runTest(
    file: string,
    rootTrans: boolean,
    monomorphize: boolean,
    builtins = new Map<string, BuiltinFun>()
): State {
    const contents = fse.readFileSync(file, { encoding: "utf-8" });
    let program = parseProgram(contents);

    if (monomorphize) {
        const resolving = new Resolving(program);
        const mono = new Monomorphize(program, resolving);
        program = mono.run();
    }

    const entryPoint = program.find(
        (def): def is FunctionDefinition => def instanceof FunctionDefinition && def.name === "main"
    );

    // Tests need to have a main() entry function
    if (entryPoint === undefined) {
        throw new Error('Unable to find entry point function "main"');
    }

    // main() must not have any parameters
    if (entryPoint.parameters.length > 0) {
        throw new Error('Entry point function "main" should not have any defined parameters');
    }

    const resolving = new Resolving(program);
    const typing = new Typing(program, resolving);
    const state = new State(program, [], rootTrans, builtins);

    const literalEvaluator = new LiteralEvaluator(resolving, state);
    const stmtExecutor = new StatementExecutor(resolving, typing, state);

    const flow = runProgram(literalEvaluator, stmtExecutor, program, state, entryPoint, [], true);

    for (let step = flow.next(); !step.done; step = flow.next());

    // for (const stmt of flow) {
    //     console.error(stmt.pp());
    //     console.error(JSON.stringify(state.dump(), undefined, 4));
    // }

    return state;
}

describe("Interpreter tests", () => {
    const files = searchRecursive("test/samples/valid/interp", (name) => name.endsWith(".maruir"));

    for (const file of files) {
        it(file, () => {
            const state = runTest(file, false, false);

            expect(state.externalReturns).toBeDefined();
            expect(state.failed).toEqual(false);
        });
    }
});

describe("Interpreter tests after monomorphization", () => {
    const files = searchRecursive("test/samples/valid/interp", (name) => name.endsWith(".maruir"));

    for (const file of files) {
        it(file, () => {
            const state = runTest(file, false, true);

            expect(state.externalReturns).toBeDefined();
            expect(state.failed).toEqual(false);
        });
    }
});

describe("Failing interpreter tests", () => {
    const files = searchRecursive("test/samples/invalid/interp", (name) =>
        name.endsWith(".maruir")
    );

    for (const file of files) {
        it(file, () => {
            const state = runTest(file, false, false);

            expect(state.externalReturns).not.toBeDefined();
            expect(state.failed).toEqual(true);
        });
    }
});

describe("Abort on root call", () => {
    it("Normal call", () => {
        const state = runTest("test/samples/valid/interp/root_abort.maruir", false, false);

        expect(state.externalReturns).toEqual([poison]);
        expect(state.failed).toEqual(false);
        expect(state.memories.has("memory")).toBeTruthy();
        expect(state.memories.has("exception")).toBeTruthy();

        const mem = state.memories.get("memory") as Memory;
        const exc = state.memories.get("exception") as Memory;

        expect(exc.size).toEqual(0);
        expect(mem.size).toEqual(1);
        expect(mem.get(0)).toEqual([42n]);
    });

    it("Transaction call", () => {
        const state = runTest("test/samples/valid/interp/root_abort.maruir", true, false);

        expect(state.externalReturns).toEqual([poison, true]);
        expect(state.failed).toEqual(false);
        expect(state.memories.has("memory")).toBeTruthy();
        expect(state.memories.has("exception")).toBeTruthy();

        const mem = state.memories.get("memory") as Memory;
        const exc = state.memories.get("exception") as Memory;

        expect(exc.size).toEqual(0);
        expect(mem.size).toEqual(0);
    });
});

describe("Builtins", () => {
    it("Supplied custom builtin", () => {
        const builtins = new Map<string, BuiltinFun>([
            [
                "customBuiltin",
                (s, f) => {
                    const v = f.args[0][1];

                    return [false, [v]];
                }
            ]
        ]);

        const state = runTest("test/samples/valid/builtin.maruir", false, false, builtins);

        expect(state.externalReturns).toEqual([]);
        expect(state.failed).toEqual(false);

        const exc = state.memories.get("exception") as Memory;

        expect(exc.size).toEqual(0);
    });

    it("Missing custom builtin", () => {
        expect(() => runTest("test/samples/valid/builtin.maruir", false, false)).toThrow(
            InterpInternalError
        );
    });
});
