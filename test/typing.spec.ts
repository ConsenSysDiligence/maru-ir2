import expect from "expect";
import fse from "fs-extra";
import {
    Expression,
    FunctionDefinition,
    Identifier,
    MemVariableDeclaration,
    MIRTypeError,
    Monomorphize,
    parseProgram,
    pp,
    Program,
    Resolving,
    Typing,
    walk
} from "../src";
import { searchRecursive } from "./utils";

function skipIdentifiers(program: Program): Set<string> {
    const res = new Set<string>(
        program
            .filter((def): def is FunctionDefinition => def instanceof FunctionDefinition)
            .map((def) => def.name)
    );

    for (const def of program) {
        walk(def, (n) => {
            if (n instanceof MemVariableDeclaration) {
                res.add(n.name);
            }
        });
    }

    return res;
}

describe("Typing positive tests", () => {
    const files = searchRecursive("test/samples/valid", (name) => name.endsWith(".maruir"));

    for (const file of files) {
        describe(`${file}`, () => {
            let program: Program;
            let resolving: Resolving;
            let typing: Typing;

            before(() => {
                const contents = fse.readFileSync(file, { encoding: "utf-8" });
                program = parseProgram(contents);
                resolving = new Resolving(program);
            });

            it(`Typing succeeds and covers all expressions`, () => {
                typing = new Typing(program, resolving);

                const skip = skipIdentifiers(program);

                for (const def of program) {
                    if (!(def instanceof FunctionDefinition && def.body)) {
                        continue;
                    }

                    for (const bb of def.body.nodes.values()) {
                        for (const stmt of bb.statements) {
                            walk(stmt, (nd) => {
                                // Skip function names in function calls and mem vars
                                if (nd instanceof Identifier && skip.has(nd.name)) {
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

            it(`Typing succeeds and covers all expressions after monomorphizing`, () => {
                const mono = new Monomorphize(program, resolving);
                const newProgram = mono.run();
                console.error(`Mono program: `, pp(newProgram));
                const newResolving = new Resolving(newProgram);
                const newTyping = new Typing(newProgram, newResolving);

                const skip = skipIdentifiers(newProgram);

                for (const def of newProgram) {
                    if (!(def instanceof FunctionDefinition && def.body)) {
                        continue;
                    }

                    for (const bb of def.body.nodes.values()) {
                        for (const stmt of bb.statements) {
                            walk(stmt, (nd) => {
                                // Skip function names in function calls and mem vars
                                if (nd instanceof Identifier && skip.has(nd.name)) {
                                    return;
                                }

                                if (nd instanceof Expression) {
                                    const type = newTyping.typeOf(nd);
                                    console.error(`Type of ${nd.pp()} is ${pp(type)}`);
                                    expect(type).toBeDefined();
                                }
                            });
                        }
                    }
                }
            });
        });
    }
});

describe("Typing negative tests", () => {
    const files = searchRecursive("test/samples/invalid/tc/", (name) => name.endsWith(".maruir"));

    for (const file of files) {
        it(file, () => {
            const contents = fse.readFileSync(file, { encoding: "utf-8" });
            const program = parseProgram(contents);
            const resolving = new Resolving(program);

            expect(() => new Typing(program, resolving)).toThrow(MIRTypeError);
        });
    }
});
