import expect from "expect";
import fse from "fs-extra";
import { Abort, BasicBlock, CFG, copy, noSrc, parseProgram, traverse } from "../src";
import { searchRecursive } from "./utils";

describe("copy() tests", () => {
    describe("Samples", () => {
        const files = searchRecursive("test/samples/valid", (name) => name.endsWith(".maruir"));

        for (const file of files) {
            it(file, async () => {
                const contents = await fse.readFile(file, { encoding: "utf-8" });

                const originalProgram = parseProgram(contents);
                const copiedProgram = originalProgram.map(copy);

                const originalNodes = originalProgram.map((def) => [...traverse(def)]).flat();
                const copiedNodes = copiedProgram.map((def) => [...traverse(def)]).flat();

                expect(originalNodes.length).toEqual(copiedNodes.length);

                for (let i = 0; i < originalNodes.length; i++) {
                    const originalNode = originalNodes[i];
                    const copiedNode = copiedNodes[i];

                    expect(copiedNode !== originalNode).toBeTruthy();
                    expect(copiedNode.pp()).toEqual(originalNode.pp());
                }
            });
        }
    });

    it("copy() on BasicBlock", () => {
        const originalStmt = new Abort(noSrc);
        const originalBb = new BasicBlock("test", [originalStmt]);
        const copiedBb = copy(originalBb);

        expect(originalBb !== copiedBb).toBeTruthy();
        expect(copiedBb.statements).toHaveLength(originalBb.statements.length);
        expect(originalBb.statements[0] !== copiedBb.statements[0]).toBeTruthy();
        expect(copiedBb.pp()).toEqual(originalBb.pp());
    });

    it("copy() on CFG", () => {
        const entry = new BasicBlock("test");
        const originalCfg = new CFG([entry], entry, []);
        const copiedCfg = copy(originalCfg);

        expect(originalCfg !== copiedCfg).toBeTruthy();
        expect(copiedCfg.pp()).toEqual(originalCfg.pp());
    });
});
