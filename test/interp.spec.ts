import expect from "expect";
import { searchRecursive } from "./utils";
import {
    FunctionDefinition,
    Memory,
    parseProgram,
    poison,
    Program,
    Resolving,
    State,
    StatementExecutor,
    Typing
} from "../src";
const fse = require("fs-extra");

function runTest(
    file: string,
    rootTrans: boolean
): [Program, Resolving, Typing, State, StatementExecutor] {
    const contents = fse.readFileSync(file, { encoding: "utf-8" });
    const defs = parseProgram(contents);
    const resolving = new Resolving(defs);
    const typing = new Typing(defs, resolving);

    const entryPoint = defs.filter((x) => x instanceof FunctionDefinition && x.name === "main");

    // Tests need to have a main() entry function
    expect(entryPoint.length).toEqual(1);

    const main = entryPoint[0] as FunctionDefinition;

    // main() must not have any parameters
    expect(main.parameters.length).toEqual(0);

    const state = new State(defs, main, [], [], rootTrans, new Map());

    const stmtExec = new StatementExecutor(resolving, typing, state);

    while (state.running) {
        const curStmt = state.curFrame.curBB.statements[state.curFrame.curBBInd];
        console.error(`Exec ${curStmt.pp()} in ${state.dump()}`);
        stmtExec.execStatement(curStmt);
    }

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
