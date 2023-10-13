import expect from "expect";
import fse from "fs-extra";
import { BasicBlock, CFG, copy, parseProgram, traverse } from "../src";
import { searchRecursive } from "./utils";

describe("copy()/copySrc()/copyCfg()/copyNode() tests", () => {
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

    it("copy() on CFG", () => {
        const entry = new BasicBlock("test");
        const originalCfg = new CFG([entry], entry, []);
        const copiedCfg = copy(originalCfg);

        expect(originalCfg !== copiedCfg).toBeTruthy();
        expect(copiedCfg.pp()).toEqual(originalCfg.pp());
    });
});
