import expect from "expect";
import fse from "fs-extra";
import {
    FunctionDefinition,
    initAndCall,
    Memory,
    parseProgram,
    poison,
    Program,
    Resolving,
    State,
    StatementExecutor,
    Typing
} from "../src";
import { searchRecursive } from "./utils";

function runTest(
    file: string,
    rootTrans: boolean
): [Program, Resolving, Typing, State, StatementExecutor] {
    const contents = fse.readFileSync(file, { encoding: "utf-8" });
    const defs = parseProgram(contents);
    const entryPoint = defs.filter((x) => x instanceof FunctionDefinition && x.name === "main");

    // Tests need to have a main() entry function
    expect(entryPoint.length).toEqual(1);

    const main = entryPoint[0] as FunctionDefinition;

    // main() must not have any parameters
    expect(main.parameters.length).toEqual(0);

    const [resolving, typing, state, stmtExec] = initAndCall(defs, main, [], new Map(), rootTrans);

    return [defs, resolving, typing, state, stmtExec];
}

describe("Interpreter tests", () => {
    const files = searchRecursive("test/samples/valid/interp", (name) => name.endsWith(".maruir"));

    for (const file of files) {
        it(file, () => {
            const [, , , state] = runTest(file, false);
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
            const [, , , state] = runTest(file, false);

            expect(state.externalReturns).not.toBeDefined();
            expect(state.failed).toEqual(true);
        });
    }
});

describe("Abort on root call", () => {
    it("Normal call", () => {
        const [, , , state] = runTest("test/samples/valid/interp/root_abort.maruir", false);
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
        const [, , , state] = runTest("test/samples/valid/interp/root_abort.maruir", true);
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
