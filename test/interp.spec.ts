import expect from "expect";
import fse from "fs-extra";
import {
    eq,
    FunctionDefinition,
    LiteralEvaluator,
    Memory,
    parseProgram,
    poison,
    pp,
    Resolving,
    runProgram,
    State,
    Statement,
    StatementExecutor,
    Typing
} from "../src";
import { searchRecursive } from "./utils";

function runTest(file: string, rootTrans: boolean): State {
    const contents = fse.readFileSync(file, { encoding: "utf-8" });
    const program = parseProgram(contents);
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
    const state = new State(program, [], rootTrans, new Map());

    const literalEvaluator = new LiteralEvaluator(resolving, state);
    const stmtExecutor = new StatementExecutor(resolving, typing, state);

    const flow = runProgram(literalEvaluator, stmtExecutor, program, state, entryPoint, [], true);

    let next: IteratorResult<Statement>;

    while ((next = flow.next()) && !next.done) {
        // const stmt = next.value;
        // console.error(`Exec ${stmt.pp()} in ${state.dump()}`);
    }

    return state;
}

describe("Interpreter tests", () => {
    const files = searchRecursive("test/samples/valid/interp", (name) => name.endsWith(".maruir"));

    for (const file of files) {
        it(file, () => {
            const state = runTest(file, false);

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
            const state = runTest(file, false);

            expect(state.externalReturns).not.toBeDefined();
            expect(state.failed).toEqual(true);
        });
    }
});

describe("Abort on root call", () => {
    it("Normal call", () => {
        const state = runTest("test/samples/valid/interp/root_abort.maruir", false);

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
        const state = runTest("test/samples/valid/interp/root_abort.maruir", true);

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

function checkFreshMems(state: State, expectedContents: Array<Array<[number, string]>>): boolean {
    const freshMems = [...state.memories.keys()].filter((x) => x.startsWith("__fresh_mem"));

    freshMems.sort();

    if (freshMems.length !== expectedContents.length) {
        return false;
    }

    for (let i = 0; i < expectedContents.length; i++) {
        const memName = freshMems[i];

        if (!state.memories.has(memName)) {
            return false;
        }

        const actualMem = state.memories.get(memName) as Memory;

        const actualEntries: Array<[number, string]> = [...actualMem.entries()].map(([k, v]) => [
            k,
            pp(v)
        ]);

        actualEntries.sort();

        if (!eq(actualEntries, expectedContents[i])) {
            return false;
        }
    }

    return true;
}

describe("Fresh memories", () => {
    it("Create 2 fresh memories", () => {
        const state = runTest("test/samples/valid/interp/fresh_mem.maruir", true);

        expect(state.externalReturns).toEqual([false]);
        expect(state.failed).toEqual(false);
        console.error(`State: `, state.dump());
        expect(state.memories.has("exception")).toBeTruthy();
        const exc = state.memories.get("exception") as Memory;
        expect(exc.size).toEqual(0);
        expect(checkFreshMems(state, [[[0, "{x:1,y:2}"]], [[0, "{x:3,y:4}"]]])).toBeTruthy();
    });

    it("Recursive fresh memories", () => {
        const state = runTest("test/samples/valid/interp/fresh_mem_recursive.maruir", true);

        expect(state.externalReturns).toEqual([false]);
        expect(state.failed).toEqual(false);
        console.error(`State: `, state.dump());
        expect(state.memories.has("exception")).toBeTruthy();

        const exc = state.memories.get("exception") as Memory;

        expect(exc.size).toEqual(0);
        expect(
            checkFreshMems(state, [
                [[0, "[0,0,0,0]"]],
                [[0, "[0,0,0]"]],
                [[0, "[0,0]"]],
                [[0, "[0]"]]
            ])
        ).toBeTruthy();
    });

    it("Iterative fresh memories", () => {
        const state = runTest("test/samples/valid/interp/fresh_mem_iterative.maruir", true);

        expect(state.externalReturns).toEqual([false]);
        expect(state.failed).toEqual(false);
        console.error(`State: `, state.dump());
        expect(state.memories.has("exception")).toBeTruthy();

        const exc = state.memories.get("exception") as Memory;

        expect(exc.size).toEqual(0);
        expect(
            checkFreshMems(state, [
                [[0, "[0,0,0,0]"]],
                [[0, "[0]"]],
                [[0, "[0,0]"]],
                [[0, "[0,0,0]"]],
                [[0, "[0,0,0,0]"]]
            ])
        ).toBeTruthy();
    });
});
