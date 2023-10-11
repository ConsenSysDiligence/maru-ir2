import expect from "expect";
import fse from "fs-extra";
import { Abort, BasicBlock, CFG, copy, noSrc, parseProgram, traverse } from "../src";
import { CustomNode, CustomSrc, searchRecursive } from "./utils";

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

    it("copy() on NoSrc", () => {
        expect(copy(noSrc) === noSrc).toBeTruthy();
    });

    it("copy() on CFG", () => {
        const entry = new BasicBlock("test");
        const originalCfg = new CFG([entry], entry, []);
        const copiedCfg = copy(originalCfg);

        expect(originalCfg !== copiedCfg).toBeTruthy();
        expect(copiedCfg.pp()).toEqual(originalCfg.pp());
    });

    it("Error is thrown on unsupported node", () => {
        const node = new CustomNode(noSrc);

        expect(() => copy(node)).toThrow(`Unable to copy node "${node.constructor.name}"`);
    });

    it("Error is thrown on unsupported source location", () => {
        const src = new CustomSrc();
        const node = new Abort(src);

        expect(() => copy(node)).toThrow(
            `Unable to copy source location "${src.constructor.name}"`
        );
    });
});
