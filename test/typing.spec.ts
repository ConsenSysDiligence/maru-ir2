import expect from "expect";
import fse from "fs-extra";
import {
    Expression,
    FunctionDefinition,
    Identifier,
    MemVariableDeclaration,
    MIRTypeError,
    parseProgram,
    Resolving,
    Typing,
    walk
} from "../src";
import { searchRecursive } from "./utils";

describe("Typing positive tests", () => {
    const files = searchRecursive("test/samples/valid", (name) => name.endsWith(".maruir"));

    for (const file of files) {
        it(file, () => {
            const contents = fse.readFileSync(file, { encoding: "utf-8" });
            const defs = parseProgram(contents);
            const resolving = new Resolving(defs);
            const typing = new Typing(defs, resolving);

            const funNames = new Set<string>(
                defs
                    .filter((x) => x instanceof FunctionDefinition)
                    .map((x) => (x as FunctionDefinition).name)
            );

            const memVarNames = new Set<string>();

            for (const def of defs) {
                walk(def, (n) => {
                    if (n instanceof MemVariableDeclaration) {
                        memVarNames.add(n.name);
                    }
                });
            }

            for (const def of defs) {
                if (!(def instanceof FunctionDefinition && def.body)) {
                    continue;
                }

                for (const bb of def.body.nodes.values()) {
                    for (const stmt of bb.statements) {
                        walk(stmt, (nd) => {
                            // Skip function names in function calls
                            if (nd instanceof Identifier && funNames.has(nd.name)) {
                                return;
                            }

                            // Skip mem vars uses in alloc
                            if (nd instanceof Identifier && memVarNames.has(nd.name)) {
                                return;
                            }

                            if (nd instanceof Expression) {
                                const type = typing.typeOf(nd);
                                // console.error(`Type of ${nd.pp()} is ${pp(type)}`);
                                expect(type).toBeDefined();
                            }
                        });
                    }
                }
            }
        });
    }
});

describe("Typing negative tests", () => {
    const files = searchRecursive("test/samples/invalid/tc/", (name) => name.endsWith(".maruir"));

    for (const file of files) {
        it(file, () => {
            const contents = fse.readFileSync(file, { encoding: "utf-8" });
            const defs = parseProgram(contents);
            const resolving = new Resolving(defs);

            expect(() => new Typing(defs, resolving)).toThrow(MIRTypeError);
        });
    }
});
