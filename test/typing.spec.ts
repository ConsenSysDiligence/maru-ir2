import expect from "expect";
import { searchRecursive } from "./utils";
import {
    Expression,
    FunctionDefinition,
    MIRTypeError,
    parseProgram,
    Resolving,
    Typing,
    walk
} from "../src";
const fse = require("fs-extra");

describe("Typing positive tests", () => {
    const files = searchRecursive("test/samples/valid", (name) => name.endsWith(".maruir"));

    for (const file of files) {
        it(file, () => {
            const contents = fse.readFileSync(file, { encoding: "utf-8" });
            const defs = parseProgram(contents);
            const resolving = new Resolving(defs);
            const typing = new Typing(defs, resolving);

            for (const def of defs) {
                if (!(def instanceof FunctionDefinition && def.body)) {
                    continue;
                }

                for (const bb of def.body.nodes.values()) {
                    for (const stmt of bb.statements) {
                        walk(stmt, (nd) => {
                            if (nd instanceof Expression) {
                                const type = typing.typeOf(nd);
                                //console.error(`Type of ${nd.pp()} is ${pp(type)}`);
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
