import expect from "expect";
import fse from "fs-extra";
import {
    BasicBlock,
    BinaryOperation,
    CFG,
    FunctionCall,
    FunctionDefinition,
    Identifier,
    IntType,
    NumberLiteral,
    checkNodeReuse,
    noSrc,
    parseProgram
} from "../src";
import { searchRecursive } from "./utils";

describe("checkNodeReuse() tests", () => {
    describe("Samples", () => {
        const files = searchRecursive("test/samples/valid", (name) => name.endsWith(".maruir"));

        for (const file of files) {
            it(file, async () => {
                const contents = await fse.readFile(file, { encoding: "utf-8" });

                const program = parseProgram(contents);
                const reuses = checkNodeReuse(program);

                expect(reuses.size).toEqual(0);
            });
        }
    });

    it("Negative test", () => {
        const literal = new NumberLiteral(noSrc, 1n, 10, new IntType(noSrc, 8, false));

        const opA = new BinaryOperation(noSrc, literal, "==", literal);
        const entryA = new BasicBlock("entry", [
            new FunctionCall(noSrc, [], new Identifier(noSrc, "assert"), [], [], [opA])
        ]);

        const fnA = new FunctionDefinition(
            noSrc,
            [],
            [],
            "a",
            [],
            [],
            [],
            new CFG([entryA], entryA, [entryA])
        );

        const opB = new BinaryOperation(noSrc, literal, "==", literal);
        const entryB = new BasicBlock("entry", [
            new FunctionCall(noSrc, [], new Identifier(noSrc, "assert"), [], [], [opB])
        ]);

        const fnB = new FunctionDefinition(
            noSrc,
            [],
            [],
            "b",
            [],
            [],
            [],
            new CFG([entryB], entryB, [entryB])
        );

        const reuses = checkNodeReuse([fnA, fnB]);

        expect(reuses.size).toEqual(1);
        expect(reuses.has(literal)).toBeTruthy();
        expect(reuses.get(literal)).toEqual([opA, opA, opB, opB]);
    });
});
