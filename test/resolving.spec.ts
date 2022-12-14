import expect from "expect";
import { searchRecursive } from "./utils";
import {
    FunctionDefinition,
    Identifier,
    MIRTypeError,
    parseProgram,
    Resolving,
    UserDefinedType,
    walk
} from "../src";
const fse = require("fs-extra");

describe("Resolving test", () => {
    const files = searchRecursive("test/samples/valid", (name) => name.endsWith(".maruir"));

    for (const file of files) {
        it(file, () => {
            const contents = fse.readFileSync(file, { encoding: "utf-8" });
            const defs = parseProgram(contents);
            const resolving = new Resolving(defs);

            for (const def of defs) {
                if (!(def instanceof FunctionDefinition && def.body)) {
                    continue;
                }

                for (const bb of def.body.nodes.values()) {
                    for (const stmt of bb.statements) {
                        walk(stmt, (nd) => {
                            if (nd instanceof Identifier) {
                                expect(resolving.getIdDecl(nd)).toBeDefined();
                            }

                            if (nd instanceof UserDefinedType) {
                                expect(resolving.getTypeDecl(nd)).toBeDefined();
                            }
                        });
                    }
                }
            }
        });
    }
});

describe("Resolving negative tests", () => {
    const files = searchRecursive("test/samples/invalid/resolving/", (name) =>
        name.endsWith(".maruir")
    );

    for (const file of files) {
        it(file, () => {
            const contents = fse.readFileSync(file, { encoding: "utf-8" });
            const defs = parseProgram(contents);

            expect(() => new Resolving(defs)).toThrow(MIRTypeError);
        });
    }
});
