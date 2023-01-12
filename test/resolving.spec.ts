import expect from "expect";
import fse from "fs-extra";
import {
    FunctionDefinition,
    Identifier,
    MIRTypeError,
    parseProgram,
    Resolving,
    UserDefinedType,
    walk
} from "../src";
import { searchRecursive } from "./utils";

describe("Resolving test", () => {
    const files = searchRecursive("test/samples/valid", (name) => name.endsWith(".maruir"));

    for (const file of files) {
        it(file, () => {
            const contents = fse.readFileSync(file, { encoding: "utf-8" });
            const proram = parseProgram(contents);
            const resolving = new Resolving(proram);

            for (const def of proram) {
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
            const program = parseProgram(contents);

            expect(() => new Resolving(program)).toThrow(MIRTypeError);
        });
    }
});
