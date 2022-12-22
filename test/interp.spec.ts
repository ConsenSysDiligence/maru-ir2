import expect from "expect";
import { searchRecursive } from "./utils";
import {
    FunctionDefinition,
    parseProgram,
    Resolving,
    State,
    StatementExecutor,
    Typing
} from "../src";
const fse = require("fs-extra");

describe("Interpreter tests", () => {
    const files = searchRecursive("test/samples/valid/interp", (name) => name.endsWith(".maruir"));

    for (const file of files) {
        it(file, () => {
            const contents = fse.readFileSync(file, { encoding: "utf-8" });
            const defs = parseProgram(contents);
            const resolving = new Resolving(defs);
            const typing = new Typing(defs, resolving);

            const entryPoint = defs.filter(
                (x) => x instanceof FunctionDefinition && x.name === "main"
            );

            // Tests need to have a main() entry function
            expect(entryPoint.length).toEqual(1);

            const main = entryPoint[0] as FunctionDefinition;

            // main() must not have any parameters
            expect(main.parameters.length).toEqual(0);

            const state = new State(defs, main, [], new Map());

            const stmtExec = new StatementExecutor(resolving, typing, state);

            while (state.running) {
                const curStmt = state.curFrame.curBB.statements[state.curFrame.curBBInd];
                console.error(`Exec ${curStmt.pp()} in ${state.dump()}`);
                stmtExec.execStatement(curStmt);
            }
        });
    }
});

describe("Crashing interpreter tests", () => {
    const files = searchRecursive("test/samples/invalid/interp", (name) =>
        name.endsWith(".maruir")
    );

    for (const file of files) {
        it(file, () => {
            const contents = fse.readFileSync(file, { encoding: "utf-8" });
            const defs = parseProgram(contents);
            const resolving = new Resolving(defs);
            const typing = new Typing(defs, resolving);

            const entryPoint = defs.filter(
                (x) => x instanceof FunctionDefinition && x.name === "main"
            );

            // Tests need to have a main() entry function
            expect(entryPoint.length).toEqual(1);

            const main = entryPoint[0] as FunctionDefinition;

            // main() must not have any parameters
            expect(main.parameters.length).toEqual(0);

            const state = new State(defs, main, [], new Map());

            const stmtExec = new StatementExecutor(resolving, typing, state);

            while (state.running) {
                const curStmt = state.curFrame.curBB.statements[state.curFrame.curBBInd];
                console.error(`Exec ${curStmt.pp()} in ${state.dump()}`);
                stmtExec.execStatement(curStmt);
            }

            expect(state.externalReturns).toBeDefined();

            if (state.externalReturns === undefined) {
                return;
            }

            expect(state.externalReturns.length).toBeGreaterThan(0);

            const aborted = state.externalReturns[state.externalReturns.length - 1];

            expect(aborted).toEqual(true);
        });
    }
});
